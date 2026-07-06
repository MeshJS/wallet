import { Serialization } from "@cardano-sdk/core";

import {
  createCip30Api,
  createCip30Wallet,
} from "../../../src/cardano/cip30/cip30-api";
import { APIErrorCode } from "../../../src/cardano/cip30/errors";
import {
  coinCbor,
  createWallet,
  SCRIPT_ADDRESS_BECH32,
} from "./fixtures";

describe("createCip30Api", () => {
  describe("getUtxos", () => {
    it("returns all utxos when no amount or paginate is given", async () => {
      const api = createCip30Api(await createWallet());
      const utxos = await api.getUtxos();
      expect(utxos).not.toBeNull();
      expect(utxos).toHaveLength(6);
    });

    it("greedily selects utxos covering the requested amount", async () => {
      const api = createCip30Api(await createWallet());
      const target = new Serialization.Value(1_000_000_000n);
      const utxos = await api.getUtxos(target.toCbor());
      expect(utxos).not.toBeNull();
      const total = utxos!.reduce(
        (sum, hex) =>
          sum +
          Serialization.TransactionUnspentOutput.fromCbor(hex)
            .output()
            .amount()
            .coin(),
        0n,
      );
      expect(total).toBeGreaterThanOrEqual(1_000_000_000n);
    });

    it("returns null when the amount can't be covered by any combination of utxos", async () => {
      const api = createCip30Api(await createWallet());
      const target = new Serialization.Value(10_000_000_000_000n);
      const utxos = await api.getUtxos(target.toCbor());
      expect(utxos).toBeNull();
    });

    it("applies pagination after amount filtering", async () => {
      const api = createCip30Api(await createWallet());
      const page = await api.getUtxos(undefined, { page: 0, limit: 2 });
      expect(page).toHaveLength(2);
    });

    it("throws Cip30PaginateError with maxSize when the page is out of range", async () => {
      const api = createCip30Api(await createWallet());
      await expect(
        api.getUtxos(undefined, { page: 10, limit: 2 }),
      ).rejects.toMatchObject({ maxSize: 6 });
    });

    it("throws InvalidRequest for a negative page or non-positive limit", async () => {
      const api = createCip30Api(await createWallet());
      await expect(
        api.getUtxos(undefined, { page: -1, limit: 2 }),
      ).rejects.toMatchObject({ code: APIErrorCode.InvalidRequest });
      await expect(
        api.getUtxos(undefined, { page: 0, limit: 0 }),
      ).rejects.toMatchObject({ code: APIErrorCode.InvalidRequest });
    });

    it("throws InvalidRequest for malformed amount CBOR", async () => {
      const api = createCip30Api(await createWallet());
      await expect(api.getUtxos("zz")).rejects.toMatchObject({
        code: APIErrorCode.InvalidRequest,
      });
    });
  });

  describe("getUsedAddresses", () => {
    it("paginates the fetcher-derived used addresses, reusing PaginateError semantics", async () => {
      const api = createCip30Api(await createWallet());
      const used = await api.getUsedAddresses();
      expect(used).toHaveLength(2);

      const page0 = await api.getUsedAddresses({ page: 0, limit: 1 });
      expect(page0).toHaveLength(1);

      await expect(
        api.getUsedAddresses({ page: 5, limit: 1 }),
      ).rejects.toMatchObject({ maxSize: 2 });
    });
  });

  describe("getCollateral", () => {
    it("selects the smallest pure-ADA utxos covering the default 5 ADA", async () => {
      const api = createCip30Api(await createWallet());
      const collateral = await api.getCollateral();
      expect(collateral).not.toBeNull();
      const total = collateral!.reduce(
        (sum, hex) =>
          sum +
          Serialization.TransactionUnspentOutput.fromCbor(hex)
            .output()
            .amount()
            .coin(),
        0n,
      );
      expect(total).toBeGreaterThanOrEqual(5_000_000n);
      for (const hex of collateral!) {
        expect(
          Serialization.TransactionUnspentOutput.fromCbor(hex)
            .output()
            .amount()
            .multiasset(),
        ).toBeUndefined();
      }
    });

    it("returns null when the requested amount exceeds available pure-ADA", async () => {
      const api = createCip30Api(await createWallet());
      const collateral = await api.getCollateral({
        amount: coinCbor(10_000_000_000_000n),
      });
      expect(collateral).toBeNull();
    });
  });

  describe("getExtensions", () => {
    it("defaults to an empty array when created without granted extensions", async () => {
      const api = createCip30Api(await createWallet());
      expect(await api.getExtensions()).toEqual([]);
    });
  });

  describe("signData", () => {
    it("rejects with AddressNotPK for a script address, without calling the wallet", async () => {
      const api = createCip30Api(await createWallet());
      await expect(
        api.signData(SCRIPT_ADDRESS_BECH32, "68656c6c6f"),
      ).rejects.toMatchObject({ code: 2 }); // DataSignErrorCode.AddressNotPK
    });
  });

  describe("error mapping", () => {
    it("maps a missing fetcher to Cip30APIError(InternalError)", async () => {
      const api = createCip30Api(await createWallet(false));
      await expect(api.getUtxos()).rejects.toMatchObject({
        code: APIErrorCode.InternalError,
      });
    });
  });
});

describe("createCip30Wallet", () => {
  it("exposes apiVersion, name and starts disabled", async () => {
    const wallet = createCip30Wallet({
      wallet: await createWallet(),
      name: "mesh-headless",
    });
    expect(wallet.apiVersion).toBe("1");
    expect(wallet.name).toBe("mesh-headless");
    expect(await wallet.isEnabled()).toBe(false);
  });

  it("enable() grants only the requested ∩ supported extensions", async () => {
    const wallet = createCip30Wallet({
      wallet: await createWallet(),
      name: "mesh-headless",
      supportedExtensions: [{ cip: 95 }],
    });
    const api = await wallet.enable({
      extensions: [{ cip: 95 }, { cip: 999 }],
    });
    expect(await api.getExtensions()).toEqual([{ cip: 95 }]);
    expect(await wallet.isEnabled()).toBe(true);
  });

  it("enable() grants nothing when no extensions are requested", async () => {
    const wallet = createCip30Wallet({
      wallet: await createWallet(),
      name: "mesh-headless",
      supportedExtensions: [{ cip: 95 }],
    });
    const api = await wallet.enable();
    expect(await api.getExtensions()).toEqual([]);
  });

  it("throws Refused and stays disabled when autoApprove is false", async () => {
    const wallet = createCip30Wallet({
      wallet: await createWallet(),
      name: "mesh-headless",
      autoApprove: false,
    });
    await expect(wallet.enable()).rejects.toMatchObject({
      code: APIErrorCode.Refused,
    });
    expect(await wallet.isEnabled()).toBe(false);
  });

  it("throws Refused when the approve callback declines", async () => {
    const wallet = createCip30Wallet({
      wallet: await createWallet(),
      name: "mesh-headless",
      approve: async () => false,
    });
    await expect(wallet.enable()).rejects.toMatchObject({
      code: APIErrorCode.Refused,
    });
  });
});
