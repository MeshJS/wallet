import type { TransactionsInfo } from "../../types/transactions-info";
import type { UTxO } from "../../types/utxo";
import {
  AddressPurpose,
  BitcoinAccount,
  BitcoinAddress,
  BitcoinBalance,
  BitcoinSignature,
  IBitcoinWallet,
  MessageSigningProtocols,
  VerifyMessageResult,
} from "../../interfaces/bitcoin-wallet";
import { isXverseInstalled, XverseAdapter } from "./adapters/xverse-adapter";

/** localStorage key used to persist the last-connected wallet name. */
const PERSIST_KEY = "mesh_bitcoin_wallet";

/**
 * Throws a clear error when called outside a browser.
 * Prevents accidental SSR usage where `window` / `localStorage` do not exist.
 */
function assertClientSide(): void {
  if (typeof window === "undefined") {
    throw new Error(
      "BitcoinBrowserWallet: This class can only be used in a browser environment. " +
        "Do not import or call it during server-side rendering.",
    );
  }
}

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
 *   const wallet  = await BitcoinBrowserWallet.enable("xverse", { persist: true });
 *   const balance = await wallet.getBalance();
 *
 * To reconnect after a page reload without prompting the user again:
 *   const wallet = await BitcoinBrowserWallet.restore();
 */
export class BitcoinBrowserWallet implements IBitcoinWallet {
  walletInstance: IBitcoinWallet;
  /** Lowercase registry key of the connected wallet (e.g. `"xverse"`). */
  readonly walletName: string;

  constructor(walletInstance: IBitcoinWallet, walletName = "") {
    this.walletInstance = walletInstance;
    this.walletName = walletName;
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

  verifyMessage(
    address: string,
    message: string,
    signature: string,
  ): Promise<VerifyMessageResult> {
    return this.walletInstance.verifyMessage(address, message, signature);
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

  fetchUTXOs(
    purposes?: AddressPurpose[],
  ): Promise<(UTxO & { address: string; purpose: AddressPurpose })[]> {
    return this.walletInstance.fetchUTXOs(purposes);
  }

  getTransactionHistory(options?: {
    purposes?: AddressPurpose[];
    lastSeenTxid?: string;
  }): Promise<
    (TransactionsInfo & { address: string; purpose: AddressPurpose })[]
  > {
    return this.walletInstance.getTransactionHistory(options);
  }

  /**
   * Removes the persisted wallet selection so `restore()` returns `null` on
   * the next page load. Call this on an explicit user-initiated disconnect.
   */
  disconnect(): void {
    assertClientSide();
    localStorage.removeItem(PERSIST_KEY);
  }

  /**
   * Returns a list of Bitcoin wallets the user has installed in the browser.
   * Throws when called outside a browser (SSR).
   */
  static getInstalledWallets(): InstalledBitcoinWallet[] {
    assertClientSide();
    const out: InstalledBitcoinWallet[] = [];
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
   * Returns `true` when a wallet session has been persisted and `restore()`
   * (or `enable()` with `persist: true`) can reconnect it silently.
   */
  static hasPersistedSession(): boolean {
    assertClientSide();
    return localStorage.getItem(PERSIST_KEY) !== null;
  }

  /**
   * Connect to a wallet, returning a wrapped `BitcoinBrowserWallet`.
   *
   * When `options.persist` is `true` the behaviour differs depending on
   * whether a prior session exists:
   *
   *   • **No existing session** — runs the normal connect flow (may show the
   *     wallet's approval popup)
   *   • **Existing session for the same wallet** — silently reconnects without showing any popup.
   *
   * @param walletName  Registry key of the wallet (e.g. `"xverse"`).
   * @param options.persist  Opt-in to silent restore on subsequent page loads.
   */
  static async enable(
    walletName: string,
    options?: { persist?: boolean },
  ): Promise<BitcoinBrowserWallet> {
    assertClientSide();
    const key = walletName.toLowerCase();
    const entry = REGISTRY[key];
    if (!entry) {
      throw new Error(
        `[BitcoinBrowserWallet] Unknown wallet: ${walletName}. Supported: ${Object.keys(REGISTRY).join(", ")}`,
      );
    }

    if (options?.persist && localStorage.getItem(PERSIST_KEY) === key) {
      try {
        const instance = await entry.factory();
        return new BitcoinBrowserWallet(instance, key);
      } catch {
        localStorage.removeItem(PERSIST_KEY);
        // fall through to normal connect
      }
    }

    // ── Normal connect path ───────────────────────────────────────────────
    try {
      const instance = await entry.factory();
      const wallet = new BitcoinBrowserWallet(instance, key);
      if (options?.persist) {
        localStorage.setItem(PERSIST_KEY, key);
      }
      return wallet;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[BitcoinBrowserWallet] An error occurred during enable: ${msg}`,
      );
    }
  }

  /**
   * Silently reconnects using the wallet name saved by a previous
   * `enable({ persist: true })` call.
   *
   * Returns `null` if nothing was persisted or the saved wallet is no longer
   * available (extension uninstalled / access revoked). The stale entry is
   * cleared automatically in the latter case.
   */
  static async restore(): Promise<BitcoinBrowserWallet | null> {
    assertClientSide();
    const saved = localStorage.getItem(PERSIST_KEY);
    if (!saved) return null;
    try {
      // Re-use enable() with persist:true so the silent-restore logic applies.
      return await BitcoinBrowserWallet.enable(saved, { persist: true });
    } catch {
      localStorage.removeItem(PERSIST_KEY);
      return null;
    }
  }
}
