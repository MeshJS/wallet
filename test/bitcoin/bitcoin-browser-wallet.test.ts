import { BitcoinBrowserWallet } from "../../src/bitcoin/wallet/browser/bitcoin-browser-wallet";
import { XverseAdapter } from "../../src/bitcoin/wallet/browser/adapters/xverse-adapter";
import {
  AddressPurpose,
  IBitcoinWallet,
  MessageSigningProtocols,
} from "../../src/bitcoin/interfaces/bitcoin-wallet";

const PERSIST_KEY = "mesh_bitcoin_wallet";

// ---------------------------------------------------------------------------
// Minimal browser-environment shim for the node test runner
// ---------------------------------------------------------------------------

/** In-memory localStorage substitute. */
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (k: string)           => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string)            => { delete store[k]; },
    clear:      ()                     => { store = {}; },
  };
})();

beforeAll(() => {
  // Make `typeof window !== "undefined"` true so assertClientSide passes.
  (globalThis as any).window     = globalThis;
  (globalThis as any).localStorage = mockLocalStorage;
});

afterAll(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFake(): jest.Mocked<IBitcoinWallet> {
  return {
    getNetwork:            jest.fn().mockResolvedValue("Testnet4"),
    getAddresses:          jest.fn().mockResolvedValue([]),
    getAccounts:           jest.fn().mockResolvedValue([]),
    getBalance:            jest.fn().mockResolvedValue({ confirmed: "0", unconfirmed: "0", total: "0" }),
    signMessage:           jest.fn().mockResolvedValue({ signature: "sig", messageHash: "hash", address: "addr", protocol: MessageSigningProtocols.ECDSA }),
    verifyMessage:         jest.fn().mockResolvedValue(true),
    signTransfer:          jest.fn().mockResolvedValue("txid-fake"),
    signPsbt:              jest.fn().mockResolvedValue("psbt-fake"),
    fetchUTXOs:            jest.fn().mockResolvedValue([]),
    getTransactionHistory: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<IBitcoinWallet>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BitcoinBrowserWallet", () => {
  // ── SSR guard ──────────────────────────────────────────────────────────────

  describe("SSR guard", () => {
    function withoutWindow(fn: () => unknown) {
      const orig = (globalThis as any).window;
      delete (globalThis as any).window;
      try { return fn(); }
      finally { (globalThis as any).window = orig; }
    }

    it("getInstalledWallets throws when called outside a browser", () => {
      withoutWindow(() => {
        expect(() => BitcoinBrowserWallet.getInstalledWallets()).toThrow(/browser environment/);
      });
    });

    it("enable throws when called outside a browser", async () => {
      await withoutWindow(() =>
        expect(BitcoinBrowserWallet.enable("xverse")).rejects.toThrow(/browser environment/),
      );
    });

    it("restore throws when called outside a browser", async () => {
      await withoutWindow(() =>
        expect(BitcoinBrowserWallet.restore()).rejects.toThrow(/browser environment/),
      );
    });

    it("disconnect throws when called outside a browser", () => {
      withoutWindow(() => {
        expect(() => new BitcoinBrowserWallet(makeFake(), "xverse").disconnect()).toThrow(/browser environment/);
      });
    });
  });

  // ── getInstalledWallets ────────────────────────────────────────────────────

  describe("getInstalledWallets", () => {
    it("returns empty list when no providers exist on globalThis", () => {
      delete (globalThis as any).XverseProviders;
      delete (globalThis as any).BitcoinProvider;
      expect(BitcoinBrowserWallet.getInstalledWallets()).toEqual([]);
    });

    it("includes Xverse when window.XverseProviders.BitcoinProvider is present", () => {
      (globalThis as any).XverseProviders = { BitcoinProvider: { request: jest.fn() } };
      expect(BitcoinBrowserWallet.getInstalledWallets().find((w) => w.id === "xverse")).toBeDefined();
      delete (globalThis as any).XverseProviders;
    });

    it("includes Xverse when only legacy window.BitcoinProvider is present", () => {
      (globalThis as any).BitcoinProvider = { request: jest.fn() };
      expect(BitcoinBrowserWallet.getInstalledWallets().find((w) => w.id === "xverse")).toBeDefined();
      delete (globalThis as any).BitcoinProvider;
    });
  });

  // ── enable ─────────────────────────────────────────────────────────────────

  describe("enable", () => {
    it("throws for an unknown wallet name", async () => {
      await expect(BitcoinBrowserWallet.enable("does-not-exist")).rejects.toThrow(/Unknown wallet/);
    });

    it("throws when xverse is not installed", async () => {
      delete (globalThis as any).XverseProviders;
      delete (globalThis as any).BitcoinProvider;
      await expect(BitcoinBrowserWallet.enable("xverse")).rejects.toThrow();
    });

    it("sets walletName on the returned instance", async () => {
      jest.spyOn(XverseAdapter, "enable").mockResolvedValueOnce(makeFake() as unknown as XverseAdapter);
      const wallet = await BitcoinBrowserWallet.enable("Xverse");
      expect(wallet.walletName).toBe("xverse");
      jest.restoreAllMocks();
    });

    it("persist:true stores walletName in localStorage", async () => {
      mockLocalStorage.clear();
      jest.spyOn(XverseAdapter, "enable").mockResolvedValueOnce(makeFake() as unknown as XverseAdapter);
      await BitcoinBrowserWallet.enable("xverse", { persist: true });
      expect(mockLocalStorage.getItem(PERSIST_KEY)).toBe("xverse");
      jest.restoreAllMocks();
    });

    it("persist:false (default) does not write to localStorage", async () => {
      mockLocalStorage.clear();
      jest.spyOn(XverseAdapter, "enable").mockResolvedValueOnce(makeFake() as unknown as XverseAdapter);
      await BitcoinBrowserWallet.enable("xverse");
      expect(mockLocalStorage.getItem(PERSIST_KEY)).toBeNull();
      jest.restoreAllMocks();
    });
  });

  // ── restore ────────────────────────────────────────────────────────────────

  describe("restore", () => {
    beforeEach(() => mockLocalStorage.clear());

    it("returns null when nothing is persisted", async () => {
      expect(await BitcoinBrowserWallet.restore()).toBeNull();
    });

    it("reconnects using the persisted wallet name", async () => {
      mockLocalStorage.setItem(PERSIST_KEY, "xverse");
      jest.spyOn(XverseAdapter, "enable").mockResolvedValueOnce(makeFake() as unknown as XverseAdapter);
      const wallet = await BitcoinBrowserWallet.restore();
      expect(wallet).not.toBeNull();
      expect(wallet!.walletName).toBe("xverse");
      jest.restoreAllMocks();
    });

    it("returns null and clears stale key when the saved wallet is unavailable", async () => {
      mockLocalStorage.setItem(PERSIST_KEY, "xverse");
      delete (globalThis as any).XverseProviders;
      delete (globalThis as any).BitcoinProvider;
      const wallet = await BitcoinBrowserWallet.restore();
      expect(wallet).toBeNull();
      expect(mockLocalStorage.getItem(PERSIST_KEY)).toBeNull();
    });
  });

  // ── disconnect ─────────────────────────────────────────────────────────────

  describe("disconnect", () => {
    it("removes the persisted wallet key from localStorage", () => {
      mockLocalStorage.setItem(PERSIST_KEY, "xverse");
      new BitcoinBrowserWallet(makeFake(), "xverse").disconnect();
      expect(mockLocalStorage.getItem(PERSIST_KEY)).toBeNull();
    });

    it("is a no-op when nothing was persisted", () => {
      mockLocalStorage.clear();
      expect(() => new BitcoinBrowserWallet(makeFake(), "xverse").disconnect()).not.toThrow();
    });
  });

  // ── pass-through delegates ─────────────────────────────────────────────────

  describe("constructor + pass-through methods", () => {
    it("delegates getNetwork to wrapped wallet", async () => {
      const fake = makeFake();
      await new BitcoinBrowserWallet(fake).getNetwork();
      expect(fake.getNetwork).toHaveBeenCalledTimes(1);
    });

    it("delegates getAddresses with given purposes", async () => {
      const fake = makeFake();
      await new BitcoinBrowserWallet(fake).getAddresses([AddressPurpose.Payment, AddressPurpose.Ordinals]);
      expect(fake.getAddresses).toHaveBeenCalledWith([AddressPurpose.Payment, AddressPurpose.Ordinals]);
    });

    it("delegates getAccounts", async () => {
      const fake = makeFake();
      await new BitcoinBrowserWallet(fake).getAccounts([AddressPurpose.Payment]);
      expect(fake.getAccounts).toHaveBeenCalledWith([AddressPurpose.Payment]);
    });

    it("delegates getBalance", async () => {
      const fake = makeFake();
      const balance = await new BitcoinBrowserWallet(fake).getBalance();
      expect(balance).toEqual({ confirmed: "0", unconfirmed: "0", total: "0" });
      expect(fake.getBalance).toHaveBeenCalledTimes(1);
    });

    it("delegates signMessage with explicit protocol", async () => {
      const fake = makeFake();
      await new BitcoinBrowserWallet(fake).signMessage("tb1q...", "hi", MessageSigningProtocols.BIP322);
      expect(fake.signMessage).toHaveBeenCalledWith("tb1q...", "hi", MessageSigningProtocols.BIP322);
    });

    it("delegates signTransfer", async () => {
      const fake = makeFake();
      const txid = await new BitcoinBrowserWallet(fake).signTransfer([{ address: "tb1q...", amount: 1000 }]);
      expect(txid).toBe("txid-fake");
      expect(fake.signTransfer).toHaveBeenCalled();
    });

    it("delegates signPsbt", async () => {
      const fake = makeFake();
      const out = await new BitcoinBrowserWallet(fake).signPsbt({ psbt: "cHNidP...", broadcast: false });
      expect(out).toBe("psbt-fake");
      expect(fake.signPsbt).toHaveBeenCalled();
    });

    it("walletName defaults to empty string when not supplied", () => {
      expect(new BitcoinBrowserWallet(makeFake()).walletName).toBe("");
    });
  });
});
