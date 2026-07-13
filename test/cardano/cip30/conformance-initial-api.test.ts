/**
 * CIP-30 conformance: the initial API (`window.cardano.<name>`), i.e.
 * everything exposed before `enable()` plus `enable()`'s own negotiation
 * semantics.
 *
 * @see https://cips.cardano.org/cips/cip30/#dataschema
 */
import { APIErrorCode } from "../../../src/cardano/cip30/errors";
import { createCip30Wallet } from "../../../src/cardano/cip30/cip30-api";
import { createWallet } from "./fixtures";

describe("CIP-30 initial API (window.cardano.<name>)", () => {
  describe("apiVersion / name / icon / supportedExtensions", () => {
    it("apiVersion is the string '1', not the number 1", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
      });
      expect(wallet.apiVersion).toBe("1");
      expect(typeof wallet.apiVersion).toBe("string");
    });

    it("passes through name and icon", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        icon: "data:image/png;base64,AA==",
      });
      expect(wallet.name).toBe("mesh-headless");
      expect(wallet.icon).toBe("data:image/png;base64,AA==");
    });

    it("defaults icon to an empty string when omitted", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
      });
      expect(wallet.icon).toBe("");
    });

    it("supportedExtensions defaults to [] and otherwise passes through as given", async () => {
      const withDefault = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
      });
      expect(withDefault.supportedExtensions).toEqual([]);

      const withExtensions = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        supportedExtensions: [{ cip: 95 }, { cip: 30 }],
      });
      expect(withExtensions.supportedExtensions).toEqual([
        { cip: 95 },
        { cip: 30 },
      ]);
    });
  });

  describe("isEnabled()", () => {
    it("is false before enable() and true after", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
      });
      expect(await wallet.isEnabled()).toBe(false);
      await wallet.enable();
      expect(await wallet.isEnabled()).toBe(true);
    });

    it("stays false when enable() is refused", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        autoApprove: false,
      });
      await expect(wallet.enable()).rejects.toBeDefined();
      expect(await wallet.isEnabled()).toBe(false);
    });
  });

  describe("enable()", () => {
    it("returns the full CIP-30 API surface", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
      });
      const api = await wallet.enable();

      // Spot-check every endpoint the spec's `ICip30Api` requires exists.
      for (const method of [
        "getExtensions",
        "getNetworkId",
        "getUtxos",
        "getBalance",
        "getUsedAddresses",
        "getUnusedAddresses",
        "getChangeAddress",
        "getRewardAddresses",
        "getCollateral",
        "signTx",
        "signData",
        "submitTx",
      ] as const) {
        expect(typeof api[method]).toBe("function");
      }
    });

    it("negotiates requested ∩ supported, dropping unsupported extensions silently", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        supportedExtensions: [{ cip: 95 }],
      });
      // Requests both a supported and an unsupported extension; the spec
      // requires the unsupported one to be dropped, not rejected.
      const api = await wallet.enable({
        extensions: [{ cip: 95 }, { cip: 999 }],
      });
      await expect(api.getExtensions()).resolves.toEqual([{ cip: 95 }]);
    });

    it("grants nothing when the wallet supports no extensions", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
      });
      const api = await wallet.enable({ extensions: [{ cip: 95 }] });
      await expect(api.getExtensions()).resolves.toEqual([]);
    });

    it("grants nothing when no extensions are requested, even if some are supported", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        supportedExtensions: [{ cip: 95 }],
      });
      const api = await wallet.enable();
      await expect(api.getExtensions()).resolves.toEqual([]);
    });

    it("throws Refused(-3) when autoApprove is false", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        autoApprove: false,
      });
      await expect(wallet.enable()).rejects.toMatchObject({
        code: APIErrorCode.Refused,
      });
    });

    it("throws Refused(-3) when the approve callback declines", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        approve: async () => false,
      });
      await expect(wallet.enable()).rejects.toMatchObject({
        code: APIErrorCode.Refused,
      });
    });

    it("Refused(-3) serializes to the spec's { code, info } wire shape", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        autoApprove: false,
      });
      try {
        await wallet.enable();
        throw new Error("expected enable() to reject");
      } catch (error) {
        const wire = JSON.parse(JSON.stringify(error));
        expect(wire).toEqual({
          code: APIErrorCode.Refused,
          info: expect.any(String),
        });
      }
    });
  });

  describe("getExtensions()", () => {
    it("returns the extensions granted during enable()", async () => {
      const wallet = createCip30Wallet({
        wallet: await createWallet(),
        name: "mesh-headless",
        supportedExtensions: [{ cip: 95 }],
      });
      const api = await wallet.enable({ extensions: [{ cip: 95 }] });
      await expect(api.getExtensions()).resolves.toEqual([{ cip: 95 }]);
    });

    it("independent createCip30Wallet instances don't share granted-extension state", async () => {
      const walletA = createCip30Wallet({
        wallet: await createWallet(),
        name: "wallet-a",
        supportedExtensions: [{ cip: 95 }],
      });
      const walletB = createCip30Wallet({
        wallet: await createWallet(),
        name: "wallet-b",
        supportedExtensions: [{ cip: 95 }],
      });

      const apiA = await walletA.enable({ extensions: [{ cip: 95 }] });
      const apiB = await walletB.enable();

      await expect(apiA.getExtensions()).resolves.toEqual([{ cip: 95 }]);
      await expect(apiB.getExtensions()).resolves.toEqual([]);
      // Re-checking A confirms B's enable() didn't clobber A's grant.
      await expect(apiA.getExtensions()).resolves.toEqual([{ cip: 95 }]);
    });
  });
});
