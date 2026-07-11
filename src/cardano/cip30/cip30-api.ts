import { Cardano, Serialization } from "@cardano-sdk/core";
import { Cbor, CborUInt } from "@harmoniclabs/cbor";

import { ICardanoWallet } from "../interfaces/cardano-wallet";
import { mergeValue } from "../utils/value";
import {
  APIErrorCode,
  Cip30APIError,
  Cip30DataSignError,
  Cip30PaginateError,
  Cip30TxSendError,
  Cip30TxSignError,
  DataSignErrorCode,
  TxSendErrorCode,
  TxSignErrorCode,
} from "./errors";
import { Cip30Extension, CreateCip30WalletOptions, ICip30Api, ICip30InitialApi, Paginate } from "./types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs `fn`, mapping any error that isn't already one of our CIP-30 error
 * classes to `Cip30APIError(InternalError)`. Errors we've already classified
 * (thrown by validation below, or by a more specific wrapper) pass through
 * untouched.
 */
async function wrapApiErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      error instanceof Cip30APIError ||
      error instanceof Cip30TxSignError ||
      error instanceof Cip30TxSendError ||
      error instanceof Cip30DataSignError ||
      error instanceof Cip30PaginateError
    ) {
      throw error;
    }
    throw new Cip30APIError(APIErrorCode.InternalError, errorMessage(error));
  }
}

/**
 * Slices `items` into the requested page, throwing spec-exact errors for
 * invalid pagination input. Shared by `getUtxos()` and `getUsedAddresses()`.
 */
function paginateItems<T>(items: T[], paginate?: Paginate): T[] {
  if (!paginate) {
    return items;
  }
  const { page, limit } = paginate;
  if (!Number.isInteger(page) || page < 0) {
    throw new Cip30APIError(
      APIErrorCode.InvalidRequest,
      `Invalid paginate.page: ${page}`,
    );
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Cip30APIError(
      APIErrorCode.InvalidRequest,
      `Invalid paginate.limit: ${limit}`,
    );
  }
  const start = page * limit;
  if (page > 0 && start >= items.length) {
    throw new Cip30PaginateError(items.length);
  }
  return items.slice(start, start + limit);
}

/**
 * Checks whether `total` covers `target`: coin must be >= target's coin, and
 * every multiasset quantity in `target` must be met.
 */
function valueCovers(
  total: Serialization.Value,
  target: Serialization.Value,
): boolean {
  if (total.coin() < target.coin()) {
    return false;
  }
  const targetMultiasset = target.multiasset();
  if (targetMultiasset) {
    const totalMultiasset = total.multiasset() ?? new Map();
    for (const [assetId, quantity] of targetMultiasset) {
      if ((totalMultiasset.get(assetId) ?? 0n) < quantity) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Greedily accumulates UTxOs (in the order returned by the wallet) until
 * their merged value covers `target`. Returns `null` if the full set of
 * UTxOs still isn't enough.
 */
function selectUtxosForAmount(
  utxosHex: string[],
  target: Serialization.Value,
): string[] | null {
  let total = new Serialization.Value(0n);
  const selected: string[] = [];
  for (const utxoHex of utxosHex) {
    if (valueCovers(total, target)) {
      break;
    }
    const utxo = Serialization.TransactionUnspentOutput.fromCbor(utxoHex);
    total = mergeValue(total, utxo.output().amount());
    selected.push(utxoHex);
  }
  return valueCovers(total, target) ? selected : null;
}

/**
 * Decodes a plain CBOR-encoded unsigned integer, as used for
 * `getCollateral({ amount })`'s `cbor<Coin>` shape (unlike `getUtxos`'
 * `amount`, this is not a full CBOR `Value`).
 */
function decodeCborCoin(hex: string): bigint {
  const decoded = Cbor.parse(hex);
  // CIP-30 `Coin` is non-negative — reject negative or non-integer CBOR.
  if (decoded instanceof CborUInt) {
    return decoded.num;
  }
  throw new Error(`Expected a plain CBOR unsigned int, got: ${hex}`);
}

const DEFAULT_COLLATERAL_LOVELACE = 5_000_000n;

function isScriptAddress(addressStr: string): boolean {
  let address: Cardano.Address | null = null;
  try {
    address = Cardano.Address.fromString(addressStr);
  } catch {
    // fall through to the InvalidRequest throw below
  }
  if (!address) {
    // Malformed input is an API error, not a signing failure.
    throw new Cip30APIError(
      APIErrorCode.InvalidRequest,
      `Invalid address: ${addressStr}`,
    );
  }
  const props = address.getProps();
  const credential =
    props.type === Cardano.AddressType.RewardKey ||
    props.type === Cardano.AddressType.RewardScript
      ? (props.paymentPart ?? props.delegationPart)
      : props.paymentPart;
  return credential?.type === Cardano.CredentialType.ScriptHash;
}

/**
 * Wraps an `ICardanoWallet` (e.g. `CardanoHeadlessWallet`) as a spec-exact
 * CIP-30 `ICip30Api`: amount-filtered/paginated `getUtxos`, pagination +
 * `PaginateError` on `getUsedAddresses`, amount-covering `getCollateral`,
 * and the full CIP-30 error taxonomy mapped from the wallet's plain `Error`s.
 *
 * Not exported for direct use by dApps — go through `createCip30Wallet()`,
 * which negotiates extensions via `enable()` first.
 */
export function createCip30Api(
  wallet: ICardanoWallet,
  opts?: { extensions?: Cip30Extension[] },
): ICip30Api {
  const grantedExtensions = opts?.extensions ?? [];

  return {
    async getExtensions() {
      return grantedExtensions;
    },

    async getNetworkId() {
      return wrapApiErrors(() => wallet.getNetworkId());
    },

    async getUtxos(amount, paginate) {
      return wrapApiErrors(async () => {
        const utxosHex = await wallet.getUtxos();

        let filtered: string[];
        if (amount !== undefined) {
          let target: Serialization.Value;
          try {
            target = Serialization.Value.fromCbor(amount);
          } catch (error) {
            throw new Cip30APIError(
              APIErrorCode.InvalidRequest,
              `Invalid amount CBOR: ${errorMessage(error)}`,
            );
          }
          const selected = selectUtxosForAmount(utxosHex, target);
          if (selected === null) {
            return null;
          }
          filtered = selected;
        } else {
          filtered = utxosHex;
        }

        return paginateItems(filtered, paginate);
      });
    },

    async getBalance() {
      return wrapApiErrors(() => wallet.getBalance());
    },

    async getUsedAddresses(paginate) {
      return wrapApiErrors(async () => {
        const used = await wallet.getUsedAddresses();
        return paginateItems(used, paginate);
      });
    },

    async getUnusedAddresses() {
      return wrapApiErrors(() => wallet.getUnusedAddresses());
    },

    async getChangeAddress() {
      return wrapApiErrors(() => wallet.getChangeAddress());
    },

    async getRewardAddresses() {
      return wrapApiErrors(() => wallet.getRewardAddresses());
    },

    async getCollateral(params) {
      return wrapApiErrors(async () => {
        let target = DEFAULT_COLLATERAL_LOVELACE;
        if (params?.amount !== undefined) {
          try {
            target = decodeCborCoin(params.amount);
          } catch (error) {
            throw new Cip30APIError(
              APIErrorCode.InvalidRequest,
              `Invalid amount CBOR: ${errorMessage(error)}`,
            );
          }
        }

        const utxosHex = await wallet.getUtxos();
        const pureAda = utxosHex
          .map((hex) => ({
            hex,
            utxo: Serialization.TransactionUnspentOutput.fromCbor(hex),
          }))
          .filter(
            ({ utxo }) => utxo.output().amount().multiasset() === undefined,
          )
          .sort(
            (a, b) =>
              Number(a.utxo.output().amount().coin()) -
              Number(b.utxo.output().amount().coin()),
          );

        let total = 0n;
        const selected: string[] = [];
        for (const { hex, utxo } of pureAda) {
          if (total >= target) {
            break;
          }
          total += utxo.output().amount().coin();
          selected.push(hex);
        }
        return total >= target ? selected : null;
      });
    },

    async signTx(tx, partialSign = false) {
      try {
        return await wallet.signTx(tx, partialSign);
      } catch (error) {
        if (errorMessage(error).includes("Not all required signers found")) {
          throw new Cip30TxSignError(
            TxSignErrorCode.ProofGeneration,
            errorMessage(error),
          );
        }
        throw new Cip30APIError(
          APIErrorCode.InternalError,
          errorMessage(error),
        );
      }
    },

    async signData(addr, payload) {
      if (isScriptAddress(addr)) {
        throw new Cip30DataSignError(
          DataSignErrorCode.AddressNotPK,
          `Address ${addr} is a script address; only payment-key addresses can sign data`,
        );
      }
      try {
        return await wallet.signData(addr, payload);
      } catch (error) {
        if (errorMessage(error).includes("No signer found")) {
          throw new Cip30DataSignError(
            DataSignErrorCode.ProofGeneration,
            errorMessage(error),
          );
        }
        throw new Cip30APIError(
          APIErrorCode.InternalError,
          errorMessage(error),
        );
      }
    },

    async submitTx(tx) {
      try {
        return await wallet.submitTx(tx);
      } catch (error) {
        // A wallet with no submitter configured is an internal setup error
        // (same category as getUtxos() without a fetcher), not a node
        // rejection — only actual submission failures map to TxSendError.
        if (errorMessage(error).includes("No submitter provided")) {
          throw new Cip30APIError(
            APIErrorCode.InternalError,
            errorMessage(error),
          );
        }
        throw new Cip30TxSendError(
          TxSendErrorCode.Failure,
          errorMessage(error),
        );
      }
    },
  };
}


/**
 * Wraps an `ICardanoWallet` as a simulated CIP-30 initial API
 * (`window.cardano.<name>`-shaped): `apiVersion`, `name`, `icon`,
 * `supportedExtensions`, `isEnabled()`, and `enable()` extension negotiation.
 */
export function createCip30Wallet(
  options: CreateCip30WalletOptions,
): ICip30InitialApi {
  const supportedExtensions = options.supportedExtensions ?? [];
  const autoApprove = options.autoApprove ?? true;

  let enabled = false;

  return {
    apiVersion: "1",
    name: options.name,
    icon: options.icon ?? "",
    supportedExtensions,

    async isEnabled() {
      return enabled;
    },

    async enable(args) {
      const requested = args?.extensions ?? [];
      const granted = requested.filter((requestedExt) =>
        supportedExtensions.some(
          (supportedExt) => supportedExt.cip === requestedExt.cip,
        ),
      );

      const approved = options.approve
        ? await options.approve(granted)
        : autoApprove;
      if (!approved) {
        throw new Cip30APIError(
          APIErrorCode.Refused,
          "The wallet refused to enable the requested API",
        );
      }

      enabled = true;
      return createCip30Api(options.wallet, { extensions: granted });
    },
  };
}
