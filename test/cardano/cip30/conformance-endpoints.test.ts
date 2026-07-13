/**
 * CIP-30 conformance: the data-retrieval and tx-submission endpoints of the
 * negotiated API (everything except signTx/signData, covered separately in
 * conformance-signing.test.ts).
 *
 * @see https://cips.cardano.org/cips/cip30/#dataschema
 */
import { Cardano, Serialization } from "@cardano-sdk/core";

import { ISubmitter } from "@meshsdk/common";
import { OfflineFetcher } from "@meshsdk/provider";

import { AddressType } from "../../../src/cardano/address/cardano-address";
import { createCip30Api } from "../../../src/cardano/cip30/cip30-api";
import {
  APIErrorCode,
  Cip30PaginateError,
  TxSendErrorCode,
} from "../../../src/cardano/cip30/errors";
import { mergeValue } from "../../../src/cardano/utils/value";
import { CardanoHeadlessWallet } from "../../../src/cardano/wallet/mesh/cardano-headless-wallet";
import {
  coinCbor,
  createWallet,
  FIXTURE_ASSET_ID,
  FIXTURE_ASSET_QUANTITY,
  MNEMONIC,
  TOTAL_FIXTURE_COIN,
} from "./fixtures";

function coinOf(utxoHex: string): bigint {
  return Serialization.TransactionUnspentOutput.fromCbor(utxoHex as any)
    .output()
    .amount()
    .coin();
}

describe("CIP-30 api.getNetworkId()", () => {
  it("returns the wallet's network ID (0 for this testnet fixture)", async () => {
    const api = createCip30Api(await createWallet());
    await expect(api.getNetworkId()).resolves.toBe(0);
  });
});

describe("CIP-30 api.getUtxos(amount, paginate)", () => {
  it("with no args, returns all utxos, each a valid CBOR-round-tripping TransactionUnspentOutput", async () => {
    const api = createCip30Api(await createWallet());
    const utxos = await api.getUtxos();
    expect(utxos).toHaveLength(6);
    for (const hex of utxos!) {
      expect(
        Serialization.TransactionUnspentOutput.fromCbor(hex as any).toCbor(),
      ).toBe(hex);
    }
  });

  it("with a satisfiable amount, the returned subset's merged value covers it", async () => {
    const api = createCip30Api(await createWallet());
    const target = new Serialization.Value(1_000_000_000n);
    const utxos = await api.getUtxos(target.toCbor());
    expect(utxos).not.toBeNull();
    const total = utxos!.reduce(
      (sum, hex) => sum + coinOf(hex),
      0n,
    );
    expect(total).toBeGreaterThanOrEqual(1_000_000_000n);
  });

  it("returns null when the wallet lacks the requested native asset entirely", async () => {
    const api = createCip30Api(await createWallet());
    const missingAsset = Cardano.AssetId(
      "ff".repeat(28) + Buffer.from("nonexistent").toString("hex"),
    );
    const target = new Serialization.Value(
      0n,
      new Map([[missingAsset, 1n]]),
    );
    await expect(api.getUtxos(target.toCbor())).resolves.toBeNull();
  });

  it("returns null when the amount exceeds total ADA across all utxos", async () => {
    const api = createCip30Api(await createWallet());
    const target = new Serialization.Value(TOTAL_FIXTURE_COIN + 1n);
    await expect(api.getUtxos(target.toCbor())).resolves.toBeNull();
  });

  it("paginate slices exact items for page 0 and page 1", async () => {
    const api = createCip30Api(await createWallet());
    const page0 = await api.getUtxos(undefined, { page: 0, limit: 2 });
    expect(page0!.map(coinOf)).toEqual([977313882n, 977313882n]);

    const page1 = await api.getUtxos(undefined, { page: 1, limit: 2 });
    expect(page1!.map(coinOf)).toEqual([954457687n, 954284486n]);
  });

  it("throws Cip30PaginateError with maxSize === total when the page is out of range", async () => {
    const api = createCip30Api(await createWallet());
    await expect(
      api.getUtxos(undefined, { page: 10, limit: 2 }),
    ).rejects.toMatchObject({ maxSize: 6 });
  });

  it("filters by amount, then paginates the filtered subset", async () => {
    const api = createCip30Api(await createWallet());
    // Every utxo but the smallest (5_000_000) covers this on its own, so the
    // filtered subset is a 1-item greedy selection; page 0 limit 1 returns it.
    const target = new Serialization.Value(900_000_000n);
    const page = await api.getUtxos(target.toCbor(), { page: 0, limit: 1 });
    expect(page).toHaveLength(1);
    expect(coinOf(page![0]!)).toBeGreaterThanOrEqual(900_000_000n);
  });

  it("returns [] (not an error) for a zero-utxo wallet's page 0", async () => {
    // Same mnemonic/address shape as the shared fixture wallet, but wired to
    // a fresh fetcher with no utxos added for any of its addresses.
    const emptyWallet = await CardanoHeadlessWallet.fromMnemonic({
      mnemonic: MNEMONIC,
      networkId: 0,
      walletAddressType: AddressType.Base,
      fetcher: new OfflineFetcher("preprod"),
    });
    const emptyApi = createCip30Api(emptyWallet);
    await expect(
      emptyApi.getUtxos(undefined, { page: 0, limit: 5 }),
    ).resolves.toEqual([]);
  });
});

describe("CIP-30 api.getBalance()", () => {
  it("returns a valid Value CBOR equal to the sum of getUtxos()'s values", async () => {
    const api = createCip30Api(await createWallet());
    const balanceCbor = await api.getBalance();
    const balance = Serialization.Value.fromCbor(balanceCbor as any);

    const utxos = await api.getUtxos();
    let summed = new Serialization.Value(0n);
    for (const hex of utxos!) {
      summed = mergeValue(
        summed,
        Serialization.TransactionUnspentOutput.fromCbor(
          hex as any,
        )
          .output()
          .amount(),
      );
    }

    expect(balance.coin()).toBe(summed.coin());
    expect(balance.coin()).toBe(TOTAL_FIXTURE_COIN);
    expect(balance.multiasset()?.get(FIXTURE_ASSET_ID)).toBe(
      FIXTURE_ASSET_QUANTITY,
    );
  });
});

describe("CIP-30 api.getUsedAddresses(paginate)", () => {
  it("returns valid address hex, parseable via Cardano.Address.fromBytes", async () => {
    const api = createCip30Api(await createWallet());
    const used = await api.getUsedAddresses();
    for (const hex of used) {
      expect(Cardano.Address.fromBytes(hex as any)).toBeDefined();
    }
  });

  it("paginates and throws Cip30PaginateError out of range", async () => {
    const api = createCip30Api(await createWallet());
    const all = await api.getUsedAddresses();
    expect(all).toHaveLength(2);

    const page0 = await api.getUsedAddresses({ page: 0, limit: 1 });
    expect(page0).toEqual([all[0]]);
    const page1 = await api.getUsedAddresses({ page: 1, limit: 1 });
    expect(page1).toEqual([all[1]]);

    await expect(
      api.getUsedAddresses({ page: 5, limit: 1 }),
    ).rejects.toMatchObject({ maxSize: 2 });
  });

  it("the fetcher-derived used addresses are distinct", async () => {
    const api = createCip30Api(await createWallet());
    const used = await api.getUsedAddresses();
    expect(new Set(used).size).toBe(used.length);
  });

  it("falls back to the single-address behavior when the fetcher is present but returns zero utxos", async () => {
    // Fetcher configured, but with no utxos loaded for any wallet address —
    // must fall back to the stateless single-address result, not [] or throw.
    const emptyWallet = await CardanoHeadlessWallet.fromMnemonic({
      mnemonic: MNEMONIC,
      networkId: 0,
      walletAddressType: AddressType.Base,
      fetcher: new OfflineFetcher("preprod"),
    });
    const api = createCip30Api(emptyWallet);
    const used = await api.getUsedAddresses();
    expect(used).toHaveLength(1);
    expect(Cardano.Address.fromBytes(used[0] as any)).toBeDefined();
  });
});

describe("CIP-30 api.getUnusedAddresses()", () => {
  it("returns valid address hex", async () => {
    const api = createCip30Api(await createWallet());
    const [address] = await api.getUnusedAddresses();
    expect(Cardano.Address.fromBytes(address as any)).toBeDefined();
  });
});

describe("CIP-30 api.getChangeAddress()", () => {
  it("returns valid address hex", async () => {
    const api = createCip30Api(await createWallet());
    const address = await api.getChangeAddress();
    expect(Cardano.Address.fromBytes(address as any)).toBeDefined();
  });
});

describe("CIP-30 api.getRewardAddresses()", () => {
  it("returns valid address hex in stake-credential (reward) form", async () => {
    const api = createCip30Api(await createWallet());
    const [address] = await api.getRewardAddresses();
    const parsed = Cardano.Address.fromBytes(address as any);
    expect(parsed).toBeDefined();
    expect(parsed!.getProps().type).toBe(Cardano.AddressType.RewardKey);
  });
});

describe("CIP-30 api.getCollateral(params)", () => {
  it("with no params, returns pure-ADA utxo(s) covering the default 5 ADA", async () => {
    const api = createCip30Api(await createWallet());
    const collateral = await api.getCollateral();
    expect(collateral).not.toBeNull();
    const total = collateral!.reduce((sum, hex) => sum + coinOf(hex), 0n);
    expect(total).toBeGreaterThanOrEqual(5_000_000n);
  });

  it("all returned collateral utxos are pure ADA (no multiasset) and valid CBOR", async () => {
    const api = createCip30Api(await createWallet());
    const collateral = await api.getCollateral();
    for (const hex of collateral!) {
      const utxo = Serialization.TransactionUnspentOutput.fromCbor(
        hex as any,
      );
      expect(utxo.output().amount().multiasset()).toBeUndefined();
      expect(utxo.toCbor()).toBe(hex);
    }
  });

  it("honors a small requested amount with a minimal (single-utxo) set", async () => {
    const api = createCip30Api(await createWallet());
    const collateral = await api.getCollateral({
      amount: coinCbor(1_000_000n),
    });
    expect(collateral).toHaveLength(1);
    expect(coinOf(collateral![0]!)).toBe(5_000_000n);
  });

  it("returns null when the requested amount exceeds available pure-ADA", async () => {
    const api = createCip30Api(await createWallet());
    const collateral = await api.getCollateral({
      amount: coinCbor(10_000_000_000_000n),
    });
    expect(collateral).toBeNull();
  });

  it("rejects a negative CBOR amount as Cip30APIError(InvalidRequest)", async () => {
    const api = createCip30Api(await createWallet());
    // "20" is CBOR for -1 (major type 1) — Coin is non-negative per spec.
    await expect(api.getCollateral({ amount: "20" })).rejects.toMatchObject({
      code: APIErrorCode.InvalidRequest,
    });
  });

  it("rejects non-integer CBOR amounts as Cip30APIError(InvalidRequest)", async () => {
    const api = createCip30Api(await createWallet());
    // "80" is CBOR for an empty array — not a Coin.
    await expect(api.getCollateral({ amount: "80" })).rejects.toMatchObject({
      code: APIErrorCode.InvalidRequest,
    });
  });
});

describe("CIP-30 api.submitTx(tx)", () => {
  it("passes through the txid from a mock ISubmitter", async () => {
    const submitter: ISubmitter = {
      submitTx: async () => "mock-txid",
    };
    const wallet = await createWallet();
    Object.assign(wallet, { submitter });
    const api = createCip30Api(wallet);
    await expect(api.submitTx("84a0")).resolves.toBe("mock-txid");
  });

  it("wraps a throwing submitter as Cip30TxSendError(Failure)", async () => {
    const submitter: ISubmitter = {
      submitTx: async () => {
        throw new Error("node rejected the transaction");
      },
    };
    const wallet = await createWallet();
    Object.assign(wallet, { submitter });
    const api = createCip30Api(wallet);
    await expect(api.submitTx("84a0")).rejects.toMatchObject({
      code: TxSendErrorCode.Failure,
    });
  });

  it("no submitter configured maps to Cip30APIError(InternalError)", async () => {
    const api = createCip30Api(await createWallet(false));
    await expect(api.submitTx("84a0")).rejects.toMatchObject({
      code: APIErrorCode.InternalError,
    });
  });
});

describe("CIP-30 error wire shapes", () => {
  it("Cip30APIError serializes to { code, info }", async () => {
    const api = createCip30Api(await createWallet(false));
    try {
      await api.getUtxos();
      throw new Error("expected getUtxos() to reject");
    } catch (error) {
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        code: APIErrorCode.InternalError,
        info: expect.any(String),
      });
    }
  });

  it("Cip30PaginateError serializes to { maxSize }, with no code/info", async () => {
    const api = createCip30Api(await createWallet());
    try {
      await api.getUtxos(undefined, { page: 10, limit: 2 });
      throw new Error("expected getUtxos() to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Cip30PaginateError);
      const wire = JSON.parse(JSON.stringify(error));
      expect(wire).toEqual({ maxSize: 6 });
      expect(wire.code).toBeUndefined();
    }
  });

  it("invalid pagination input serializes as Cip30APIError(InvalidRequest)", async () => {
    const api = createCip30Api(await createWallet());
    try {
      await api.getUtxos(undefined, { page: -1, limit: 2 });
      throw new Error("expected getUtxos() to reject");
    } catch (error) {
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        code: APIErrorCode.InvalidRequest,
        info: expect.any(String),
      });
    }
  });
});
