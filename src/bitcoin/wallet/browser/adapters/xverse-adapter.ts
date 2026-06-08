import type { TransactionsInfo } from "../../../types/transactions-info";
import type { UTxO } from "../../../types/utxo";
import { networkFromName } from "../../../address/bitcoin-address";
import {
  AddressPurpose,
  AddressType,
  BitcoinAccount,
  BitcoinAddress,
  BitcoinBalance,
  BitcoinSignature,
  IBitcoinWallet,
  MessageSigningProtocols,
  VerifyMessageResult,
} from "../../../interfaces/bitcoin-wallet";
import { verifyBitcoinMessage } from "../../mesh/bitcoin-headless-wallet";

/**
 * Shape of the Xverse `BitcoinProvider` reachable via `window.XverseProviders.BitcoinProvider`.
 * We only depend on the `request(method, params)` JSON-RPC-style surface, which is the public
 * Sats Connect protocol — no SDK dependency required.
 *
 * See: https://docs.xverse.app/sats-connect (`getAddresses`, `getAccounts`, `getBalance`,
 *      `signMessage`, `sendTransfer`, `signPsbt`, `getNetwork`).
 */
export interface XverseBitcoinProvider {
  request<T = unknown>(
    method: string,
    params?: Record<string, unknown> | null,
  ): Promise<XverseResponse<T>>;
}

/**
 * The Xverse provider's `request()` returns one of two envelopes, depending on
 * whether the dApp went through the sats-connect-core library (which normalises
 * the wire format) or hit `window.XverseProviders.BitcoinProvider` directly
 * (raw JSON-RPC 2.0). We accept both so the adapter works either way.
 */
export type XverseResponse<T> =
  | { status: "success"; result: T }
  | { status: "error"; error: { code: number; message: string } }
  | { jsonrpc: "2.0"; result: T; id?: string | number | null }
  | {
      jsonrpc: "2.0";
      error: { code: number; message: string };
      id?: string | number | null;
    };

/**
 * Typed error preserving the RPC error code so callers can distinguish
 * `USER_REJECTION` (-32000) from `ACCESS_DENIED` (-32002), etc.
 */
/** Sats Connect `RpcErrorCode.ACCESS_DENIED` — app has not connected yet. */
export const XVERSE_ACCESS_DENIED = -32002;

export class XverseRpcError extends Error {
  readonly code: number;
  readonly method: string;
  constructor(method: string, code: number, message: string) {
    super(`[XverseAdapter] ${method} failed (${code}): ${message}`);
    this.name = "XverseRpcError";
    this.code = code;
    this.method = method;
  }
}

declare global {
  interface Window {
    XverseProviders?: {
      BitcoinProvider?: XverseBitcoinProvider;
    };
    BitcoinProvider?: XverseBitcoinProvider;
  }
}

export function isXverseInstalled(): boolean {
  if (typeof globalThis === "undefined") return false;
  const w = globalThis as unknown as Window;
  return Boolean(w?.XverseProviders?.BitcoinProvider ?? w?.BitcoinProvider);
}

function getProvider(): XverseBitcoinProvider {
  const w = globalThis as unknown as Window;
  const provider = w?.XverseProviders?.BitcoinProvider ?? w?.BitcoinProvider;
  if (!provider) {
    throw new Error(
      "[XverseAdapter] Xverse provider not found on window. Install Xverse and reload.",
    );
  }
  return provider;
}

async function call<T>(
  method: string,
  params?: Record<string, unknown> | null,
): Promise<T> {
  const response = (await getProvider().request<T>(method, params ?? null)) as {
    status?: string;
    result?: T;
    error?: { code: number; message: string };
    jsonrpc?: string;
  };

  // sats-connect-normalised envelope: { status, result | error }
  if (response.status === "error" && response.error) {
    throw new XverseRpcError(
      method,
      response.error.code,
      response.error.message,
    );
  }
  if (response.status === "success" && "result" in response) {
    return response.result as T;
  }
  // Raw JSON-RPC 2.0 envelope: { jsonrpc, result | error }
  if (response.jsonrpc === "2.0") {
    if (response.error) {
      throw new XverseRpcError(
        method,
        response.error.code,
        response.error.message,
      );
    }
    if ("result" in response) {
      return response.result as T;
    }
  }
  // Some Xverse builds return the unwrapped result directly. Trust the type.
  if (response && !("status" in response) && !("jsonrpc" in response)) {
    return response as unknown as T;
  }
  throw new XverseRpcError(
    method,
    -1,
    "Unrecognised response envelope from Xverse",
  );
}

type XverseAddressItem = {
  address: string;
  publicKey: string;
  addressType: string;
  purpose: AddressPurpose | string;
  walletType?: "software" | "ledger" | "keystone";
};

type WalletConnectResult = {
  addresses?: XverseAddressItem[];
  /** Historical typo in some Xverse builds. */
  addressses?: XverseAddressItem[];
  walletType?: string;
  id?: string;
  network?: { bitcoin?: { name?: string } };
};

const DEFAULT_CONNECT_MESSAGE = "Connect to Mesh SDK";

function normalizeAddressType(t: string): AddressType | null {
  const lower = t.toLowerCase();
  const known = Object.values(AddressType) as string[];
  if (known.includes(lower)) return lower as AddressType;
  // Xverse historically returns "p2sh" for nested-SegWit; map common aliases.
  if (lower === "p2sh-p2wpkh") return "p2sh" as AddressType;
  // Unknown types (new Xverse versions may add them) are filtered out by the caller
  // rather than throwing and breaking the entire getAddresses response.
  return null;
}

function normalizePurpose(raw: string): AddressPurpose | null {
  const known = Object.values(AddressPurpose) as string[];
  if (known.includes(raw)) return raw as AddressPurpose;
  return null;
}

function mapAddressItems(items: XverseAddressItem[]): BitcoinAddress[] {
  const out: BitcoinAddress[] = [];
  for (const a of items) {
    const addressType = normalizeAddressType(a.addressType);
    if (addressType === null) continue;
    const purpose = normalizePurpose(a.purpose);
    if (purpose === null) continue;
    out.push({
      address: a.address,
      publicKey: a.publicKey,
      purpose,
      addressType,
      walletType: (a.walletType ?? "software") as
        | "software"
        | "ledger"
        | "keystone",
    });
  }
  return out;
}

function parseAddressListResult(
  result:
    | XverseAddressItem[]
    | { addresses?: XverseAddressItem[]; accounts?: XverseAddressItem[] },
): XverseAddressItem[] {
  if (Array.isArray(result)) return result;
  return result.addresses ?? result.accounts ?? [];
}

/**
 * Adapter that implements `IBitcoinWallet` against the Xverse / Sats Connect surface.
 * Created on `enable()` after the user authorizes the dApp.
 */
export class XverseAdapter implements IBitcoinWallet {
  private connected = false;
  private cachedAddresses: BitcoinAddress[] | undefined;

  private constructor() {}

  static async enable(): Promise<XverseAdapter> {
    if (!isXverseInstalled()) {
      throw new Error(
        "[XverseAdapter] Xverse is not installed. Visit https://www.xverse.app to install.",
      );
    }
    const adapter = new XverseAdapter();
    await adapter.connect([AddressPurpose.Payment, AddressPurpose.Ordinals]);
    adapter.connected = true;
    return adapter;
  }

  /**
   * Establish a dApp connection per Sats Connect: `wallet_connect` grants read
   * permission and returns addresses. Older Xverse builds fall back to
   * `wallet_requestPermissions` + `getAddresses`.
   */
  private async connect(
    purposes: AddressPurpose[],
    message = DEFAULT_CONNECT_MESSAGE,
  ): Promise<void> {
    try {
      await this.connectViaWalletConnect(purposes, message);
      return;
    } catch (err) {
      if (
        err instanceof XverseRpcError &&
        err.code === -32601 /* METHOD_NOT_FOUND */
      ) {
        await this.connectViaPermissions(purposes, message);
        return;
      }
      throw err;
    }
  }

  private async connectViaWalletConnect(
    purposes: AddressPurpose[],
    message: string,
  ): Promise<void> {
    const result = await call<WalletConnectResult>("wallet_connect", {
      addresses: purposes,
      message,
    });
    const items = result.addresses ?? result.addressses ?? [];
    this.cachedAddresses = mapAddressItems(items);
  }

  private async connectViaPermissions(
    purposes: AddressPurpose[],
    message: string,
  ): Promise<void> {
    await call<unknown>("wallet_requestPermissions", null);
    await this.requestAddresses(purposes, message);
  }

  private async requestPermissions(): Promise<void> {
    await call<unknown>("wallet_requestPermissions", null);
  }

  private async requestAddresses(
    purposes: AddressPurpose[],
    message = DEFAULT_CONNECT_MESSAGE,
  ): Promise<BitcoinAddress[]> {
    try {
      return await this.fetchAddresses(purposes, message);
    } catch (err) {
      if (err instanceof XverseRpcError && err.code === XVERSE_ACCESS_DENIED) {
        await this.requestPermissions();
        return this.fetchAddresses(purposes, message);
      }
      throw err;
    }
  }

  private async fetchAddresses(
    purposes: AddressPurpose[],
    message: string,
  ): Promise<BitcoinAddress[]> {
    const result = await call<
      XverseAddressItem[] | { addresses: XverseAddressItem[] }
    >("getAddresses", { purposes, message });
    const list = mapAddressItems(parseAddressListResult(result));
    this.cachedAddresses = list;
    return list;
  }

  async getNetwork(): Promise<"Mainnet" | "Testnet4"> {
    // Sats Connect canonical method is `wallet_getNetwork`. Some older Xverse
    // builds also accept bare `getNetwork`; we try the canonical form first and
    // fall back so we don't break on either surface.
    type R = { bitcoin: { name: string } } | { name: string };
    let result: R;
    try {
      result = await call<R>("wallet_getNetwork");
    } catch (err) {
      if (
        err instanceof XverseRpcError &&
        err.code === -32601 /* METHOD_NOT_FOUND */
      ) {
        result = await call<R>("getNetwork");
      } else {
        throw err;
      }
    }
    const raw =
      (result as { name?: string }).name ??
      (result as { bitcoin?: { name?: string } }).bitcoin?.name;
    const lower = (raw ?? "").toLowerCase();
    if (lower === "mainnet") return "Mainnet";
    if (lower === "testnet4") return "Testnet4";
    // The IBitcoinWallet contract only models Mainnet/Testnet4. Signet,
    // Testnet3, Regtest etc. should surface loudly rather than silently
    // misreporting as Testnet4.
    throw new Error(
      `[XverseAdapter] Unsupported network from provider: ${raw}`,
    );
  }

  async getAddresses(
    addressPurposes: AddressPurpose[],
  ): Promise<BitcoinAddress[]> {
    if (!this.connected || !this.cachedAddresses) {
      return this.requestAddresses(addressPurposes);
    }
    const wanted = new Set(addressPurposes);
    return this.cachedAddresses.filter((a) => wanted.has(a.purpose));
  }

  async getAccounts(
    addressPurposes: AddressPurpose[],
  ): Promise<BitcoinAccount[]> {
    type AccountItem = XverseAddressItem;
    // Per the Sats Connect spec `getAccounts` returns a bare array, but older
    // Xverse builds wrapped the array under `accounts` / `addresses`. Handle
    // both shapes so the adapter remains compatible across provider versions.
    const result = await call<
      AccountItem[] | { addresses?: AccountItem[]; accounts?: AccountItem[] }
    >("getAccounts", {
      purposes: addressPurposes,
      message: "Connect to Mesh SDK",
    });
    const items: AccountItem[] = Array.isArray(result)
      ? result
      : (result.accounts ?? result.addresses ?? []);
    return items
      .map((a) => ({
        walletType: (a.walletType ?? "software") as
          | "software"
          | "ledger"
          | "keystone",
        address: a.address,
        publicKey: a.publicKey,
        purpose: normalizePurpose(a.purpose),
        addressType: normalizeAddressType(a.addressType),
      }))
      .filter(
        (
          a,
        ): a is typeof a & {
          addressType: NonNullable<typeof a.addressType>;
          purpose: NonNullable<typeof a.purpose>;
        } => a.addressType !== null && a.purpose !== null,
      );
  }

  async getBalance(): Promise<BitcoinBalance> {
    const result = await call<BitcoinBalance>("getBalance");
    if (
      result.confirmed == null ||
      result.unconfirmed == null ||
      result.total == null
    ) {
      throw new Error(
        "[XverseAdapter] getBalance returned an incomplete response from Xverse",
      );
    }
    return {
      confirmed: String(result.confirmed),
      unconfirmed: String(result.unconfirmed),
      total: String(result.total),
    };
  }

  async signMessage(
    address: string,
    message: string,
    protocol?: MessageSigningProtocols,
  ): Promise<BitcoinSignature> {
    // Per Sats Connect, when `protocol` is omitted Xverse picks the right one
    // for the address type (ECDSA for P2WPKH/P2SH, BIP-322 for Taproot).
    // Forcing a default here would break P2WPKH signing under BIP-322 enforcement.
    const params: Record<string, unknown> = { address, message };
    if (protocol) params.protocol = protocol;
    const result = await call<{
      signature: string;
      messageHash: string;
      address: string;
      protocol?: MessageSigningProtocols;
    }>("signMessage", params);
    return {
      signature: result.signature,
      messageHash: result.messageHash,
      address: result.address,
      protocol: result.protocol ?? protocol ?? MessageSigningProtocols.ECDSA,
    };
  }

  /**
   * Verify a Bitcoin signed-message locally. Trustless — does not call the extension.
   * Supports the ECDSA 65-byte BIP-137 compact format. Non-ECDSA signatures (e.g. the
   * BIP-322 format Xverse produces for Taproot addresses) return `{ valid: false }` rather
   * than throwing, so callers can safely check `result.valid`.
   */
  async verifyMessage(
    address: string,
    message: string,
    signature: string,
  ): Promise<VerifyMessageResult> {
    const decoded = Buffer.from(signature, "base64");
    // BIP-322 / non-ECDSA signatures are not yet verifiable here.
    if (decoded.length !== 65) {
      return {
        valid: false,
        reason: "Unsupported signature format (expected 65-byte BIP-137 ECDSA)",
      };
    }
    const networkName = await this.getNetwork();
    return verifyBitcoinMessage(
      address,
      message,
      signature,
      networkFromName(networkName),
    );
  }

  /**
   * Xverse's Sats Connect exposes `sendTransfer` which prompts the user to sign
   * AND broadcast in one step — there is no "sign-only" variant.
   * Returns the broadcast txid, satisfying the `IBitcoinWallet.signTransfer` contract.
   */
  async signTransfer(
    recipients: { address: string; amount: number }[],
  ): Promise<string> {
    const result = await call<{ txid: string }>("sendTransfer", {
      recipients: recipients.map((r) => ({
        address: r.address,
        amount: r.amount,
      })),
    });
    return result.txid;
  }

  async signPsbt(signConfig: {
    psbt: string;
    signInputs?: { [x: string]: number[] } | undefined;
    broadcast?: boolean | undefined;
  }): Promise<string> {
    const result = await call<{ psbt?: string; txid?: string }>("signPsbt", {
      psbt: signConfig.psbt,
      signInputs: signConfig.signInputs,
      broadcast: signConfig.broadcast ?? false,
    });
    if (signConfig.broadcast) {
      if (!result.txid) {
        throw new Error(
          "[XverseAdapter] signPsbt with broadcast=true did not return a txid",
        );
      }
      return result.txid;
    }
    if (!result.psbt) {
      throw new Error("[XverseAdapter] signPsbt did not return a signed PSBT");
    }
    return result.psbt;
  }

  /**
   * Fetch UTXOs for the connected wallet via Sats Connect.
   * Xverse exposes `wallet_getUtxos` on newer builds; for older builds that
   * don't support it this will throw a clear METHOD_NOT_FOUND error.
   */
  async fetchUTXOs(
    purposes: AddressPurpose[] = [
      AddressPurpose.Payment,
      AddressPurpose.Ordinals,
    ],
  ): Promise<(UTxO & { address: string; purpose: AddressPurpose })[]> {
    const addresses = await this.getAddresses(purposes);
    const results = await Promise.all(
      addresses.map(async (addr) => {
        const utxos = await call<UTxO[]>("wallet_getUtxos", {
          address: addr.address,
        });
        return utxos.map((u) => ({
          ...u,
          address: addr.address,
          purpose: addr.purpose,
        }));
      }),
    );
    return results.flat();
  }

  /**
   * Fetch transaction history for the connected wallet via Sats Connect.
   * Xverse exposes `wallet_getTransactions` on newer builds.
   */
  async getTransactionHistory(
    options: {
      purposes?: AddressPurpose[];
      lastSeenTxid?: string;
    } = {},
  ): Promise<
    (TransactionsInfo & { address: string; purpose: AddressPurpose })[]
  > {
    const purposes = options.purposes ?? [
      AddressPurpose.Payment,
      AddressPurpose.Ordinals,
    ];
    const addresses = await this.getAddresses(purposes);
    const results = await Promise.all(
      addresses.map(async (addr) => {
        const txs = await call<TransactionsInfo[]>("wallet_getTransactions", {
          address: addr.address,
          ...(options.lastSeenTxid ? { afterTxid: options.lastSeenTxid } : {}),
        });
        return txs.map((tx) => ({
          ...tx,
          address: addr.address,
          purpose: addr.purpose,
        }));
      }),
    );
    return results.flat().sort((a, b) => {
      if (!a.status.confirmed && b.status.confirmed) return -1;
      if (a.status.confirmed && !b.status.confirmed) return 1;
      return (b.status.block_height ?? 0) - (a.status.block_height ?? 0);
    });
  }
}
