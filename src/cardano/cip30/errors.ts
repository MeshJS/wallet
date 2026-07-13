/**
 * CIP-30 error taxonomy.
 *
 * The CIP-30 spec defines a handful of plain-object error shapes that dApps
 * pattern-match on over the wire (postMessage / injected API boundary), so
 * every error class here carries exactly the fields the spec requires and
 * serializes to exactly the spec's wire shape via `toJSON()`.
 *
 * @see https://cips.cardano.org/cips/cip30/#errortypes
 */

/**
 * Error codes for the general `APIError`, returned by most CIP-30 endpoints
 * once the initial API has been negotiated via `enable()`.
 */
export enum APIErrorCode {
  InvalidRequest = -1,
  InternalError = -2,
  Refused = -3,
  AccountChange = -4,
}

/**
 * Error codes for `TxSignError`, returned by `signTx()`.
 */
export enum TxSignErrorCode {
  ProofGeneration = 1,
  UserDeclined = 2,
}

/**
 * Error codes for `TxSendError`, returned by `submitTx()`.
 */
export enum TxSendErrorCode {
  Refused = 1,
  Failure = 2,
}

/**
 * Error codes for `DataSignError`, returned by `signData()`.
 */
export enum DataSignErrorCode {
  ProofGeneration = 1,
  AddressNotPK = 2,
  UserDeclined = 3,
}

/**
 * General CIP-30 API error, thrown by `enable()` and most wallet-facing
 * endpoints. Wire shape: `{ code, info }`.
 */
export class Cip30APIError extends Error {
  readonly code: APIErrorCode;
  readonly info: string;

  constructor(code: APIErrorCode, info: string) {
    super(`[Cip30APIError] (${code}) ${info}`);
    this.name = "Cip30APIError";
    this.code = code;
    this.info = info;
  }

  toJSON(): { code: APIErrorCode; info: string } {
    return { code: this.code, info: this.info };
  }
}

/**
 * Thrown by `signTx()` when the wallet fails or refuses to sign a transaction.
 * Wire shape: `{ code, info }`.
 */
export class Cip30TxSignError extends Error {
  readonly code: TxSignErrorCode;
  readonly info: string;

  constructor(code: TxSignErrorCode, info: string) {
    super(`[Cip30TxSignError] (${code}) ${info}`);
    this.name = "Cip30TxSignError";
    this.code = code;
    this.info = info;
  }

  toJSON(): { code: TxSignErrorCode; info: string } {
    return { code: this.code, info: this.info };
  }
}

/**
 * Thrown by `submitTx()` when the wallet fails or refuses to submit a
 * transaction. Wire shape: `{ code, info }`.
 */
export class Cip30TxSendError extends Error {
  readonly code: TxSendErrorCode;
  readonly info: string;

  constructor(code: TxSendErrorCode, info: string) {
    super(`[Cip30TxSendError] (${code}) ${info}`);
    this.name = "Cip30TxSendError";
    this.code = code;
    this.info = info;
  }

  toJSON(): { code: TxSendErrorCode; info: string } {
    return { code: this.code, info: this.info };
  }
}

/**
 * Thrown by `signData()` when the wallet fails or refuses to sign data.
 * Wire shape: `{ code, info }`.
 */
export class Cip30DataSignError extends Error {
  readonly code: DataSignErrorCode;
  readonly info: string;

  constructor(code: DataSignErrorCode, info: string) {
    super(`[Cip30DataSignError] (${code}) ${info}`);
    this.name = "Cip30DataSignError";
    this.code = code;
    this.info = info;
  }

  toJSON(): { code: DataSignErrorCode; info: string } {
    return { code: this.code, info: this.info };
  }
}

/**
 * Thrown by paginated endpoints (`getUtxos()`, `getUsedAddresses()`, ...)
 * when the caller requests a page size larger than the wallet supports.
 * Unlike the other CIP-30 errors, this one carries no `code`/`info` — its
 * wire shape is `{ maxSize }`.
 */
export class Cip30PaginateError extends Error {
  readonly maxSize: number;

  constructor(maxSize: number) {
    super(`[Cip30PaginateError] page size exceeds maxSize (${maxSize})`);
    this.name = "Cip30PaginateError";
    this.maxSize = maxSize;
  }

  toJSON(): { maxSize: number } {
    return { maxSize: this.maxSize };
  }
}

export function isApiError(error: unknown): error is Cip30APIError {
  return error instanceof Cip30APIError;
}

export function isTxSignError(error: unknown): error is Cip30TxSignError {
  return error instanceof Cip30TxSignError;
}

export function isTxSendError(error: unknown): error is Cip30TxSendError {
  return error instanceof Cip30TxSendError;
}

export function isDataSignError(error: unknown): error is Cip30DataSignError {
  return error instanceof Cip30DataSignError;
}

export function isPaginateError(error: unknown): error is Cip30PaginateError {
  return error instanceof Cip30PaginateError;
}
