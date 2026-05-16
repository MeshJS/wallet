import {
  AddressPurpose,
  BitcoinAccount,
  BitcoinAddress,
  BitcoinBalance,
  BitcoinSignature,
  IBitcoinWallet,
  MessageSigningProtocols,
} from "../../interfaces/bitcoin-wallet";
import { isXverseInstalled, XverseAdapter } from "./adapters/xverse-adapter";

export type InstalledBitcoinWallet = {
  id: string;
  name: string;
  icon?: string;
};

type BitcoinWalletEntry = {
  factory: () => Promise<IBitcoinWallet>;
  meta: InstalledBitcoinWallet;
  isInstalled: () => boolean;
};

const REGISTRY: Record<string, BitcoinWalletEntry> = {
  xverse: {
    factory: () => XverseAdapter.enable(),
    isInstalled: isXverseInstalled,
    meta: {
      id: "xverse",
      name: "Xverse",
      icon: "https://www.xverse.app/favicon.ico",
    },
  },
};

/**
 * BitcoinBrowserWallet wraps an `IBitcoinWallet`-compatible browser provider
 * (e.g., Xverse). Mirrors `CardanoBrowserWallet` for the Bitcoin chain.
 *
 * Typical usage:
 *   const wallets = BitcoinBrowserWallet.getInstalledWallets();
 *   const wallet  = await BitcoinBrowserWallet.enable("xverse");
 *   const balance = await wallet.getBalance();
 */
export class BitcoinBrowserWallet implements IBitcoinWallet {
  walletInstance: IBitcoinWallet;

  constructor(walletInstance: IBitcoinWallet) {
    this.walletInstance = walletInstance;
  }

  getNetwork(): Promise<"Mainnet" | "Testnet4"> {
    return this.walletInstance.getNetwork();
  }

  getAddresses(addressPurposes: AddressPurpose[]): Promise<BitcoinAddress[]> {
    return this.walletInstance.getAddresses(addressPurposes);
  }

  getAccounts(addressPurposes: AddressPurpose[]): Promise<BitcoinAccount[]> {
    return this.walletInstance.getAccounts(addressPurposes);
  }

  getBalance(): Promise<BitcoinBalance> {
    return this.walletInstance.getBalance();
  }

  signMessage(
    address: string,
    message: string,
    protocol?: MessageSigningProtocols,
  ): Promise<BitcoinSignature> {
    return this.walletInstance.signMessage(address, message, protocol);
  }

  signTransfer(
    recipients: { address: string; amount: number }[],
  ): Promise<string> {
    return this.walletInstance.signTransfer(recipients);
  }

  signPsbt(signConfig: {
    psbt: string;
    signInputs?: { [x: string]: number[] } | undefined;
    broadcast?: boolean | undefined;
  }): Promise<string> {
    return this.walletInstance.signPsbt(signConfig);
  }

  /**
   * Returns a list of Bitcoin wallets the user has installed in the browser.
   */
  static getInstalledWallets(): InstalledBitcoinWallet[] {
    const out: InstalledBitcoinWallet[] = [];
    if (typeof globalThis === "undefined") return out;
    for (const entry of Object.values(REGISTRY)) {
      try {
        if (entry.isInstalled()) out.push(entry.meta);
      } catch {
        // ignore — provider probing should never throw
      }
    }
    return out;
  }

  /**
   * Request the user's permission to connect, returning a wrapped wallet on success.
   */
  static async enable(walletName: string): Promise<BitcoinBrowserWallet> {
    const entry = REGISTRY[walletName.toLowerCase()];
    if (!entry) {
      throw new Error(
        `[BitcoinBrowserWallet] Unknown wallet: ${walletName}. Supported: ${Object.keys(REGISTRY).join(", ")}`,
      );
    }
    try {
      const instance = await entry.factory();
      return new BitcoinBrowserWallet(instance);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[BitcoinBrowserWallet] An error occurred during enable: ${msg}`,
      );
    }
  }
}
