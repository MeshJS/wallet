import { DataSignature } from "@meshsdk/common";

import { ICardanoWallet } from "../interfaces/cardano-wallet";

export type DecodedAddress = {
  hex: string;
  bech32: string;
};

export type DecodedAsset = {
  policyId: string;
  assetName: string;
  quantity: bigint;
  unit: string;
};

export type DecodedBalance = {
  cbor: string;
  lovelace: bigint;
  assets: DecodedAsset[];
};


export type Paginate = {
  page: number;
  limit: number;
};

/**
 * A CIP-30 extension descriptor, e.g. `{ cip: 95 }` for the CIP-95 governance
 * extension. Named `Cip30Extension` (rather than `Extension`) to avoid
 * clashing with @meshsdk/common's own `Extension` export.
 */
export type Cip30Extension = {
  cip: number;
};

/**
 * The full CIP-30 API surface, returned by `ICip30InitialApi.enable()`.
 *
 * @see https://cips.cardano.org/cips/cip30/
 */
export interface ICip30Api {
  /**
   * @returns The extensions granted during `enable()`.
   */
  getExtensions(): Promise<Cip30Extension[]>;
  getNetworkId(): Promise<number>;
  /**
   * @param amount Optional `cbor<Value>` hex. If provided, only UTxOs whose
   *   merged value covers `amount` (coin and every multiasset quantity) are
   *   considered, and `null` is returned if no such set exists.
   * @param paginate Optional pagination window, applied after amount
   *   filtering.
   * @returns UTxOs in CBOR hex format, or `null` if `amount` can't be covered.
   */
  getUtxos(amount?: string, paginate?: Paginate): Promise<string[] | null>;
  getBalance(): Promise<string>;
  getUsedAddresses(paginate?: Paginate): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  /**
   * @param params Optional `{ amount }`, a `cbor<Coin>` hex (plain CBOR
   *   unsigned int of lovelace). Defaults to 5 ADA when omitted.
   * @returns Pure-ADA UTxOs in CBOR hex format covering the requested amount,
   *   or `null` if no such set exists.
   */
  getCollateral(params?: { amount: string }): Promise<string[] | null>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<DataSignature>;
  submitTx(tx: string): Promise<string>;
}

/**
 * The CIP-30 initial API, i.e. what a dApp sees at `window.cardano.<name>`
 * before calling `enable()`.
 */
export interface ICip30InitialApi {
  readonly apiVersion: "1";
  readonly name: string;
  readonly icon: string;
  readonly supportedExtensions: Cip30Extension[];
  isEnabled(): Promise<boolean>;
  enable(args?: { extensions?: Cip30Extension[] }): Promise<ICip30Api>;
}

/**
 * Options for creating a CIP-30 wallet.
 */
export interface CreateCip30WalletOptions {
  /** The underlying wallet to wrap. */
  wallet: ICardanoWallet;
  name: string;
  icon?: string;
  supportedExtensions?: Cip30Extension[];
  autoApprove?: boolean;
  approve?: (extensions: Cip30Extension[]) => boolean | Promise<boolean>;
}