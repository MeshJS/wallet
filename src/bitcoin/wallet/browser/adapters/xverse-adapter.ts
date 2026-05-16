import {
  AddressPurpose,
  AddressType,
  BitcoinAccount,
  BitcoinAddress,
  BitcoinBalance,
  BitcoinSignature,
  IBitcoinWallet,
  MessageSigningProtocols,
} from "../../../interfaces/bitcoin-wallet";

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
  | { jsonrpc: "2.0"; error: { code: number; message: string }; id?: string | number | null };

/**
 * Typed error preserving the RPC error code so callers can distinguish
 * `USER_REJECTION` (-32000) from `ACCESS_DENIED` (-32002), etc.
 */
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
  return Boolean(
    w?.XverseProviders?.BitcoinProvider ?? w?.BitcoinProvider,
  );
}

function getProvider(): XverseBitcoinProvider {
  const w = globalThis as unknown as Window;
  const provider =
    w?.XverseProviders?.BitcoinProvider ?? w?.BitcoinProvider;
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
  const response = (await getProvider().request<T>(method, params ?? null)) as
    | { status?: string; result?: T; error?: { code: number; message: string }; jsonrpc?: string };

  // sats-connect-normalised envelope: { status, result | error }
  if (response.status === "error" && response.error) {
    throw new XverseRpcError(method, response.error.code, response.error.message);
  }
  if (response.status === "success" && "result" in response) {
    return response.result as T;
  }
  // Raw JSON-RPC 2.0 envelope: { jsonrpc, result | error }
  if (response.jsonrpc === "2.0") {
    if (response.error) {
      throw new XverseRpcError(method, response.error.code, response.error.message);
    }
    if ("result" in response) {
      return response.result as T;
    }
  }
  // Some Xverse builds return the unwrapped result directly. Trust the type.
  if (response && !("status" in response) && !("jsonrpc" in response)) {
    return response as unknown as T;
  }
  throw new XverseRpcError(method, -1, "Unrecognised response envelope from Xverse");
}

type XverseAddressItem = {
  address: string;
  publicKey: string;
  addressType: string;
  purpose: AddressPurpose | string;
  walletType?: "software" | "ledger" | "keystone";
};

function normalizeAddressType(t: string): AddressType {
  const lower = t.toLowerCase();
  const known = Object.values(AddressType) as string[];
  if (known.includes(lower)) return lower as AddressType;
  // Xverse historically returns "p2sh" for nested-SegWit; map common aliases.
  if (lower === "p2sh-p2wpkh") return "p2sh" as AddressType;
  throw new Error(`[XverseAdapter] Unknown addressType from provider: ${t}`);
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
    await adapter.requestAddresses([
      AddressPurpose.Payment,
      AddressPurpose.Ordinals,
    ]);
    adapter.connected = true;
    return adapter;
  }

  private async requestAddresses(
    purposes: AddressPurpose[],
  ): Promise<BitcoinAddress[]> {
    const result = await call<{ addresses: XverseAddressItem[] }>(
      "getAddresses",
      { purposes, message: "Connect to Mesh SDK" },
    );
    const list = result.addresses.map((a) => ({
      address: a.address,
      publicKey: a.publicKey,
      purpose: a.purpose as AddressPurpose,
      addressType: normalizeAddressType(a.addressType),
      walletType: (a.walletType ?? "software") as
        | "software"
        | "ledger"
        | "keystone",
    }));
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
      if (err instanceof XverseRpcError && err.code === -32601 /* METHOD_NOT_FOUND */) {
        result = await call<R>("getNetwork");
      } else {
        throw err;
      }
    }
    const raw =
      (result as { name?: string }).name
      ?? ((result as { bitcoin?: { name?: string } }).bitcoin?.name);
    const lower = (raw ?? "").toLowerCase();
    if (lower === "mainnet") return "Mainnet";
    if (lower === "testnet4") return "Testnet4";
    // The IBitcoinWallet contract only models Mainnet/Testnet4. Signet,
    // Testnet3, Regtest etc. should surface loudly rather than silently
    // misreporting as Testnet4.
    throw new Error(`[XverseAdapter] Unsupported network from provider: ${raw}`);
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
    >("getAccounts", { purposes: addressPurposes, message: "Connect to Mesh SDK" });
    const items: AccountItem[] = Array.isArray(result)
      ? result
      : (result.accounts ?? result.addresses ?? []);
    return items.map((a) => ({
      walletType: (a.walletType ?? "software") as
        | "software"
        | "ledger"
        | "keystone",
      address: a.address,
      publicKey: a.publicKey,
      purpose: a.purpose as AddressPurpose,
      addressType: normalizeAddressType(a.addressType),
    }));
  }

  async getBalance(): Promise<BitcoinBalance> {
    const result = await call<BitcoinBalance>("getBalance");
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
   * Xverse's Sats Connect exposes `sendTransfer` which prompts the user to sign
   * AND broadcast in one step — there is no "sign-only" variant. We surface the
   * resulting txid, matching the contract that `signTransfer` returns a tx hex
   * or txid string.
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
    const result = await call<{ psbt: string; txid?: string }>("signPsbt", {
      psbt: signConfig.psbt,
      signInputs: signConfig.signInputs,
      broadcast: signConfig.broadcast,
    });
    return signConfig.broadcast && result.txid ? result.txid : result.psbt;
  }
}
