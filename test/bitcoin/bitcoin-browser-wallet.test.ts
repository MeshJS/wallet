import { BitcoinBrowserWallet } from "../../src/bitcoin/wallet/browser/bitcoin-browser-wallet";
import {
  AddressPurpose,
  IBitcoinWallet,
  MessageSigningProtocols,
} from "../../src/bitcoin/interfaces/bitcoin-wallet";

/**
 * BitcoinBrowserWallet is a thin pass-through wrapper around an injected
 * IBitcoinWallet (typically an XverseAdapter). Test the public surface by
 * passing a hand-rolled fake provider.
 */
function makeFake(): jest.Mocked<IBitcoinWallet> {
  return {
    getNetwork: jest.fn().mockResolvedValue("Testnet4"),
    getAddresses: jest.fn().mockResolvedValue([]),
    getAccounts: jest.fn().mockResolvedValue([]),
    getBalance: jest.fn().mockResolvedValue({ confirmed: "0", unconfirmed: "0", total: "0" }),
    signMessage: jest.fn().mockResolvedValue({
      signature: "sig",
      messageHash: "hash",
      address: "addr",
      protocol: MessageSigningProtocols.ECDSA,
    }),
    signTransfer: jest.fn().mockResolvedValue("txid-fake"),
    signPsbt: jest.fn().mockResolvedValue("psbt-fake"),
  } as unknown as jest.Mocked<IBitcoinWallet>;
}

describe("BitcoinBrowserWallet", () => {
  describe("getInstalledWallets", () => {
    it("returns empty list when no providers exist on globalThis", () => {
      // Ensure Xverse isn't installed
      delete (globalThis as any).XverseProviders;
      delete (globalThis as any).BitcoinProvider;
      const wallets = BitcoinBrowserWallet.getInstalledWallets();
      expect(wallets).toEqual([]);
    });

    it("includes Xverse when window.XverseProviders.BitcoinProvider is present", () => {
      (globalThis as any).XverseProviders = {
        BitcoinProvider: { request: jest.fn() },
      };
      const wallets = BitcoinBrowserWallet.getInstalledWallets();
      expect(wallets.find((w) => w.id === "xverse")).toBeDefined();
      delete (globalThis as any).XverseProviders;
    });

    it("includes Xverse when only legacy window.BitcoinProvider is present", () => {
      (globalThis as any).BitcoinProvider = { request: jest.fn() };
      const wallets = BitcoinBrowserWallet.getInstalledWallets();
      expect(wallets.find((w) => w.id === "xverse")).toBeDefined();
      delete (globalThis as any).BitcoinProvider;
    });
  });

  describe("enable", () => {
    it("throws for an unknown wallet name", async () => {
      await expect(BitcoinBrowserWallet.enable("does-not-exist")).rejects.toThrow(
        /Unknown wallet/,
      );
    });

    it("throws when xverse is not installed", async () => {
      delete (globalThis as any).XverseProviders;
      delete (globalThis as any).BitcoinProvider;
      await expect(BitcoinBrowserWallet.enable("xverse")).rejects.toThrow();
    });
  });

  describe("constructor + pass-through methods", () => {
    it("delegates getNetwork to wrapped wallet", async () => {
      const fake = makeFake();
      const wallet = new BitcoinBrowserWallet(fake);
      await wallet.getNetwork();
      expect(fake.getNetwork).toHaveBeenCalledTimes(1);
    });

    it("delegates getAddresses with given purposes", async () => {
      const fake = makeFake();
      const wallet = new BitcoinBrowserWallet(fake);
      await wallet.getAddresses([AddressPurpose.Payment, AddressPurpose.Ordinals]);
      expect(fake.getAddresses).toHaveBeenCalledWith([
        AddressPurpose.Payment,
        AddressPurpose.Ordinals,
      ]);
    });

    it("delegates getAccounts", async () => {
      const fake = makeFake();
      const wallet = new BitcoinBrowserWallet(fake);
      await wallet.getAccounts([AddressPurpose.Payment]);
      expect(fake.getAccounts).toHaveBeenCalledWith([AddressPurpose.Payment]);
    });

    it("delegates getBalance", async () => {
      const fake = makeFake();
      const wallet = new BitcoinBrowserWallet(fake);
      const balance = await wallet.getBalance();
      expect(balance).toEqual({ confirmed: "0", unconfirmed: "0", total: "0" });
      expect(fake.getBalance).toHaveBeenCalledTimes(1);
    });

    it("delegates signMessage with explicit protocol", async () => {
      const fake = makeFake();
      const wallet = new BitcoinBrowserWallet(fake);
      await wallet.signMessage("tb1q...", "hi", MessageSigningProtocols.BIP322);
      expect(fake.signMessage).toHaveBeenCalledWith(
        "tb1q...",
        "hi",
        MessageSigningProtocols.BIP322,
      );
    });

    it("delegates signTransfer", async () => {
      const fake = makeFake();
      const wallet = new BitcoinBrowserWallet(fake);
      const txid = await wallet.signTransfer([
        { address: "tb1q...", amount: 1000 },
      ]);
      expect(txid).toBe("txid-fake");
      expect(fake.signTransfer).toHaveBeenCalled();
    });

    it("delegates signPsbt", async () => {
      const fake = makeFake();
      const wallet = new BitcoinBrowserWallet(fake);
      const out = await wallet.signPsbt({ psbt: "cHNidP...", broadcast: false });
      expect(out).toBe("psbt-fake");
      expect(fake.signPsbt).toHaveBeenCalled();
    });
  });
});
