import {
  APIErrorCode,
  Cip30APIError,
  Cip30DataSignError,
  Cip30PaginateError,
  Cip30TxSendError,
  Cip30TxSignError,
  DataSignErrorCode,
  isApiError,
  isDataSignError,
  isPaginateError,
  isTxSendError,
  isTxSignError,
  TxSendErrorCode,
  TxSignErrorCode,
} from "../../../src/cardano/cip30/errors";

describe("CIP-30 error codes", () => {
  it("APIErrorCode matches the spec's numeric codes", () => {
    expect(APIErrorCode.InvalidRequest).toBe(-1);
    expect(APIErrorCode.InternalError).toBe(-2);
    expect(APIErrorCode.Refused).toBe(-3);
    expect(APIErrorCode.AccountChange).toBe(-4);
  });

  it("TxSignErrorCode matches the spec's numeric codes", () => {
    expect(TxSignErrorCode.ProofGeneration).toBe(1);
    expect(TxSignErrorCode.UserDeclined).toBe(2);
  });

  it("TxSendErrorCode matches the spec's numeric codes", () => {
    expect(TxSendErrorCode.Refused).toBe(1);
    expect(TxSendErrorCode.Failure).toBe(2);
  });

  it("DataSignErrorCode matches the spec's numeric codes", () => {
    expect(DataSignErrorCode.ProofGeneration).toBe(1);
    expect(DataSignErrorCode.AddressNotPK).toBe(2);
    expect(DataSignErrorCode.UserDeclined).toBe(3);
  });
});

describe("Cip30APIError", () => {
  it("is an instanceof Error and Cip30APIError", () => {
    const error = new Cip30APIError(APIErrorCode.Refused, "user refused");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(Cip30APIError);
    expect(error.name).toBe("Cip30APIError");
  });

  it("carries code and info, and serializes to the spec's wire shape", () => {
    const error = new Cip30APIError(APIErrorCode.InvalidRequest, "bad request");
    expect(error.code).toBe(APIErrorCode.InvalidRequest);
    expect(error.info).toBe("bad request");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: APIErrorCode.InvalidRequest,
      info: "bad request",
    });
  });
});

describe("Cip30TxSignError", () => {
  it("is an instanceof Error and Cip30TxSignError", () => {
    const error = new Cip30TxSignError(
      TxSignErrorCode.UserDeclined,
      "user declined",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(Cip30TxSignError);
    expect(error.name).toBe("Cip30TxSignError");
  });

  it("carries code and info, and serializes to the spec's wire shape", () => {
    const error = new Cip30TxSignError(
      TxSignErrorCode.ProofGeneration,
      "could not derive key",
    );
    expect(error.code).toBe(TxSignErrorCode.ProofGeneration);
    expect(error.info).toBe("could not derive key");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: TxSignErrorCode.ProofGeneration,
      info: "could not derive key",
    });
  });
});

describe("Cip30TxSendError", () => {
  it("is an instanceof Error and Cip30TxSendError", () => {
    const error = new Cip30TxSendError(TxSendErrorCode.Failure, "node rejected tx");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(Cip30TxSendError);
    expect(error.name).toBe("Cip30TxSendError");
  });

  it("carries code and info, and serializes to the spec's wire shape", () => {
    const error = new Cip30TxSendError(TxSendErrorCode.Refused, "user refused");
    expect(error.code).toBe(TxSendErrorCode.Refused);
    expect(error.info).toBe("user refused");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: TxSendErrorCode.Refused,
      info: "user refused",
    });
  });
});

describe("Cip30DataSignError", () => {
  it("is an instanceof Error and Cip30DataSignError", () => {
    const error = new Cip30DataSignError(
      DataSignErrorCode.AddressNotPK,
      "address is not a payment key",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(Cip30DataSignError);
    expect(error.name).toBe("Cip30DataSignError");
  });

  it("carries code and info, and serializes to the spec's wire shape", () => {
    const error = new Cip30DataSignError(
      DataSignErrorCode.UserDeclined,
      "user declined",
    );
    expect(error.code).toBe(DataSignErrorCode.UserDeclined);
    expect(error.info).toBe("user declined");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: DataSignErrorCode.UserDeclined,
      info: "user declined",
    });
  });
});

describe("Cip30PaginateError", () => {
  it("is an instanceof Error and Cip30PaginateError", () => {
    const error = new Cip30PaginateError(10);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(Cip30PaginateError);
    expect(error.name).toBe("Cip30PaginateError");
  });

  it("carries maxSize and serializes to the spec's { maxSize } wire shape, with no code/info", () => {
    const error = new Cip30PaginateError(25);
    expect(error.maxSize).toBe(25);
    const wire = JSON.parse(JSON.stringify(error));
    expect(wire).toEqual({ maxSize: 25 });
    expect(wire.code).toBeUndefined();
    expect(wire.info).toBeUndefined();
  });
});

describe("type guards", () => {
  const apiError = new Cip30APIError(APIErrorCode.Refused, "refused");
  const txSignError = new Cip30TxSignError(TxSignErrorCode.UserDeclined, "declined");
  const txSendError = new Cip30TxSendError(TxSendErrorCode.Failure, "failed");
  const dataSignError = new Cip30DataSignError(
    DataSignErrorCode.ProofGeneration,
    "failed",
  );
  const paginateError = new Cip30PaginateError(5);
  const plainError = new Error("plain error");
  const notAnError = { code: -3, info: "looks like one but isn't" };

  it("isApiError matches only Cip30APIError", () => {
    expect(isApiError(apiError)).toBe(true);
    expect(isApiError(txSignError)).toBe(false);
    expect(isApiError(txSendError)).toBe(false);
    expect(isApiError(dataSignError)).toBe(false);
    expect(isApiError(paginateError)).toBe(false);
    expect(isApiError(plainError)).toBe(false);
    expect(isApiError(notAnError)).toBe(false);
  });

  it("isTxSignError matches only Cip30TxSignError", () => {
    expect(isTxSignError(txSignError)).toBe(true);
    expect(isTxSignError(apiError)).toBe(false);
    expect(isTxSignError(plainError)).toBe(false);
    expect(isTxSignError(notAnError)).toBe(false);
  });

  it("isTxSendError matches only Cip30TxSendError", () => {
    expect(isTxSendError(txSendError)).toBe(true);
    expect(isTxSendError(apiError)).toBe(false);
    expect(isTxSendError(plainError)).toBe(false);
    expect(isTxSendError(notAnError)).toBe(false);
  });

  it("isDataSignError matches only Cip30DataSignError", () => {
    expect(isDataSignError(dataSignError)).toBe(true);
    expect(isDataSignError(apiError)).toBe(false);
    expect(isDataSignError(plainError)).toBe(false);
    expect(isDataSignError(notAnError)).toBe(false);
  });

  it("isPaginateError matches only Cip30PaginateError", () => {
    expect(isPaginateError(paginateError)).toBe(true);
    expect(isPaginateError(apiError)).toBe(false);
    expect(isPaginateError(plainError)).toBe(false);
    expect(isPaginateError(notAnError)).toBe(false);
  });
});
