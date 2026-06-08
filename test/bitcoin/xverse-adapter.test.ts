import {
  XverseAdapter,
  XverseRpcError,
  XVERSE_ACCESS_DENIED,
  isXverseInstalled,
} from "../../src/bitcoin/wallet/browser/adapters/xverse-adapter";
import {
  AddressPurpose,
  MessageSigningProtocols,
} from "../../src/bitcoin/interfaces/bitcoin-wallet";

/**
 * Install a synthetic Xverse `BitcoinProvider` on globalThis so the adapter
 * can be tested without a real browser. Each test installs a `request` mock
 * that returns the wire response shape under test.
 */
function installProvider(request: jest.Mock) {
  (globalThis as any).XverseProviders = {
    BitcoinProvider: { request },
  };
}

/** Default successful `wallet_connect` response for enable(). */
function connectOk(addresses: unknown[] = []) {
  return { status: "success", result: { addresses } };
}

afterEach(() => {
  delete (globalThis as any).XverseProviders;
  delete (globalThis as any).BitcoinProvider;
});

describe("isXverseInstalled", () => {
  it("returns false when neither provider key is on globalThis", () => {
    expect(isXverseInstalled()).toBe(false);
  });

  it("returns true when XverseProviders.BitcoinProvider is present", () => {
    installProvider(jest.fn());
    expect(isXverseInstalled()).toBe(true);
  });

  it("returns true when legacy window.BitcoinProvider is present", () => {
    (globalThis as any).BitcoinProvider = { request: jest.fn() };
    expect(isXverseInstalled()).toBe(true);
  });
});

describe("XverseAdapter.enable", () => {
  it("throws when Xverse is not installed", async () => {
    await expect(XverseAdapter.enable()).rejects.toThrow(/not installed/);
  });

  it("calls wallet_connect on enable and seeds the cache", async () => {
    const request = jest.fn().mockResolvedValue(
      connectOk([
        {
          address: "tb1qpayment",
          publicKey: "0203abcd",
          addressType: "p2wpkh",
          purpose: AddressPurpose.Payment,
          walletType: "software",
        },
      ]),
    );
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    expect(request).toHaveBeenCalledWith(
      "wallet_connect",
      expect.objectContaining({
        addresses: [AddressPurpose.Payment, AddressPurpose.Ordinals],
      }),
    );
    const addrs = await adapter.getAddresses([AddressPurpose.Payment]);
    expect(addrs).toHaveLength(1);
    expect(addrs[0]!.address).toBe("tb1qpayment");
  });
});

describe("XverseAdapter — wire-format compatibility", () => {
  it("handles the sats-connect-normalised {status, result} envelope", async () => {
    const request = jest.fn().mockResolvedValue(connectOk([]));
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    expect(adapter).toBeDefined();
  });

  it("handles the raw JSON-RPC 2.0 envelope", async () => {
    const request = jest.fn().mockResolvedValue({
      jsonrpc: "2.0",
      result: { addresses: [] as unknown[] },
      id: 1,
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    expect(adapter).toBeDefined();
  });

  it("throws XverseRpcError on a normalised error envelope", async () => {
    const request = jest.fn().mockResolvedValue({
      status: "error",
      error: { code: -32000, message: "User rejected" },
    });
    installProvider(request);
    await expect(XverseAdapter.enable()).rejects.toThrow(/User rejected/);
  });

  it("falls back to wallet_requestPermissions + getAddresses when wallet_connect is missing", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce({
      status: "error",
      error: { code: -32601, message: "Method not found" },
    });
    request.mockResolvedValueOnce({ status: "success", result: null });
    request.mockResolvedValueOnce({
      status: "success",
      result: {
        addresses: [
          {
            address: "tb1qlegacy",
            publicKey: "0203abcd",
            addressType: "p2wpkh",
            purpose: AddressPurpose.Payment,
            walletType: "software",
          },
        ],
      },
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    expect(request.mock.calls.map((c) => c[0])).toEqual([
      "wallet_connect",
      "wallet_requestPermissions",
      "getAddresses",
    ]);
    const addrs = await adapter.getAddresses([AddressPurpose.Payment]);
    expect(addrs[0]!.address).toBe("tb1qlegacy");
  });

  it("retries getAddresses after ACCESS_DENIED when using the legacy connect path", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce({
      status: "error",
      error: { code: -32601, message: "Method not found" },
    });
    request.mockResolvedValueOnce({ status: "success", result: null });
    request.mockResolvedValueOnce({
      status: "error",
      error: { code: XVERSE_ACCESS_DENIED, message: "Access denied" },
    });
    request.mockResolvedValueOnce({ status: "success", result: null });
    request.mockResolvedValueOnce({
      status: "success",
      result: { addresses: [] },
    });
    installProvider(request);
    await expect(XverseAdapter.enable()).resolves.toBeDefined();
  });

  it("preserves the RPC error code on XverseRpcError", async () => {
    const request = jest.fn().mockResolvedValue({
      status: "error",
      error: { code: -32000, message: "User rejected" },
    });
    installProvider(request);
    try {
      await XverseAdapter.enable();
      fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(XverseRpcError);
      expect((err as XverseRpcError).code).toBe(-32000);
    }
  });
});

describe("XverseAdapter.getNetwork", () => {
  async function setupConnectedAdapter(networkResult: unknown) {
    const request = jest.fn();
    // First call: wallet_connect (from enable)
    request.mockResolvedValueOnce(connectOk([]));
    // Second call: wallet_getNetwork
    request.mockResolvedValueOnce({ status: "success", result: networkResult });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    return { adapter, request };
  }

  it("calls wallet_getNetwork (canonical Sats Connect method)", async () => {
    const { adapter, request } = await setupConnectedAdapter({
      bitcoin: { name: "Mainnet" },
    });
    const network = await adapter.getNetwork();
    expect(network).toBe("Mainnet");
    expect(request.mock.calls[1]![0]).toBe("wallet_getNetwork");
  });

  it("falls back to bare getNetwork if wallet_getNetwork returns METHOD_NOT_FOUND", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce(connectOk([]));
    request.mockResolvedValueOnce({
      status: "error",
      error: { code: -32601, message: "Method not found" },
    });
    request.mockResolvedValueOnce({
      status: "success",
      result: { name: "Testnet4" },
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    const network = await adapter.getNetwork();
    expect(network).toBe("Testnet4");
    expect(request.mock.calls.map((c: any[]) => c[0])).toEqual([
      "wallet_connect",
      "wallet_getNetwork",
      "getNetwork",
    ]);
  });

  it("throws on unsupported networks (e.g. Signet) instead of silently misreporting", async () => {
    const { adapter } = await setupConnectedAdapter({ bitcoin: { name: "Signet" } });
    await expect(adapter.getNetwork()).rejects.toThrow(/Unsupported network/);
  });

  it("accepts the flat {name} response shape", async () => {
    const { adapter } = await setupConnectedAdapter({ name: "Mainnet" });
    expect(await adapter.getNetwork()).toBe("Mainnet");
  });
});

describe("XverseAdapter.getAccounts", () => {
  async function connected(request: jest.Mock) {
    installProvider(request);
    request.mockResolvedValueOnce(connectOk([]));
    return XverseAdapter.enable();
  }

  it("handles the bare-array result shape (modern Sats Connect)", async () => {
    const request = jest.fn();
    const adapter = await connected(request);
    request.mockResolvedValueOnce({
      status: "success",
      result: [
        {
          address: "tb1qabc",
          publicKey: "0203aa",
          addressType: "p2wpkh",
          purpose: AddressPurpose.Payment,
          walletType: "software",
        },
      ],
    });
    const accts = await adapter.getAccounts([AddressPurpose.Payment]);
    expect(accts).toHaveLength(1);
    expect(accts[0]!.address).toBe("tb1qabc");
  });

  it("handles the wrapped {accounts: [...]} result shape (legacy)", async () => {
    const request = jest.fn();
    const adapter = await connected(request);
    request.mockResolvedValueOnce({
      status: "success",
      result: {
        accounts: [
          {
            address: "tb1qold",
            publicKey: "0203bb",
            addressType: "p2wpkh",
            purpose: AddressPurpose.Payment,
            walletType: "software",
          },
        ],
      },
    });
    const accts = await adapter.getAccounts([AddressPurpose.Payment]);
    expect(accts).toHaveLength(1);
    expect(accts[0]!.address).toBe("tb1qold");
  });
});

describe("XverseAdapter address-type validation", () => {
  it("silently drops addresses with unknown addressType values (forward-compat)", async () => {
    const request = jest.fn().mockResolvedValue(
      connectOk([
        {
          address: "tb1qmystery",
          publicKey: "0203",
          addressType: "not-a-real-type",
          purpose: AddressPurpose.Payment,
          walletType: "software",
        },
      ]),
    );
    installProvider(request);
    // Should NOT throw — unknown types are filtered out to stay compatible with
    // future Xverse releases that introduce new address types.
    const adapter = await XverseAdapter.enable();
    const addrs = await adapter.getAddresses([AddressPurpose.Payment]);
    expect(addrs).toHaveLength(0);
  });

  it("maps the legacy p2sh-p2wpkh alias to p2sh", async () => {
    const request = jest.fn().mockResolvedValue(
      connectOk([
        {
          address: "2N...",
          publicKey: "0203",
          addressType: "p2sh-p2wpkh",
          purpose: AddressPurpose.Payment,
          walletType: "software",
        },
      ]),
    );
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    const addrs = await adapter.getAddresses([AddressPurpose.Payment]);
    expect(addrs[0]!.addressType).toBe("p2sh");
  });
});

describe("XverseAdapter.signMessage", () => {
  async function connected(request: jest.Mock) {
    installProvider(request);
    request.mockResolvedValueOnce(connectOk([]));
    return XverseAdapter.enable();
  }

  it("omits the protocol field when caller does not specify one", async () => {
    const request = jest.fn();
    const adapter = await connected(request);
    request.mockResolvedValueOnce({
      status: "success",
      result: {
        signature: "sig",
        messageHash: "hash",
        address: "tb1q...",
        protocol: MessageSigningProtocols.ECDSA,
      },
    });
    await adapter.signMessage("tb1q...", "hello");
    const params = request.mock.calls[1]![1] as Record<string, unknown>;
    expect("protocol" in params).toBe(false);
    expect(params.address).toBe("tb1q...");
    expect(params.message).toBe("hello");
  });

  it("forwards the protocol when caller specifies one", async () => {
    const request = jest.fn();
    const adapter = await connected(request);
    request.mockResolvedValueOnce({
      status: "success",
      result: {
        signature: "sig",
        messageHash: "hash",
        address: "tb1q...",
        protocol: MessageSigningProtocols.BIP322,
      },
    });
    await adapter.signMessage("tb1q...", "hi", MessageSigningProtocols.BIP322);
    const params = request.mock.calls[1]![1] as Record<string, unknown>;
    expect(params.protocol).toBe(MessageSigningProtocols.BIP322);
  });
});

describe("XverseAdapter.signTransfer", () => {
  it("calls sendTransfer and returns the txid string", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce(connectOk([]));
    request.mockResolvedValueOnce({
      status: "success",
      result: { txid: "abcd1234" },
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    const txid = await adapter.signTransfer([
      { address: "tb1qrecip", amount: 1000 },
    ]);
    expect(txid).toBe("abcd1234");
    expect(request.mock.calls[1]![0]).toBe("sendTransfer");
  });
});

describe("XverseAdapter.signPsbt", () => {
  it("returns psbt base64 when broadcast=false", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce(connectOk([]));
    request.mockResolvedValueOnce({
      status: "success",
      result: { psbt: "cHNidP-signed" },
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    const out = await adapter.signPsbt({ psbt: "cHNidP-unsigned", broadcast: false });
    expect(out).toBe("cHNidP-signed");
  });

  it("returns txid when broadcast=true and provider returns one", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce(connectOk([]));
    request.mockResolvedValueOnce({
      status: "success",
      result: { psbt: "cHNidP-signed", txid: "broadcast-txid" },
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    const out = await adapter.signPsbt({ psbt: "cHNidP-unsigned", broadcast: true });
    expect(out).toBe("broadcast-txid");
  });

  it("throws when broadcast=true but txid is missing from response", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce(connectOk([]));
    request.mockResolvedValueOnce({
      status: "success",
      result: { psbt: "cHNidP-signed" }, // no txid
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    await expect(
      adapter.signPsbt({ psbt: "cHNidP-unsigned", broadcast: true }),
    ).rejects.toThrow(/did not return a txid/);
  });

  it("throws when broadcast=false but psbt is missing from response", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce(connectOk([]));
    request.mockResolvedValueOnce({
      status: "success",
      result: {}, // neither psbt nor txid
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    await expect(
      adapter.signPsbt({ psbt: "cHNidP-unsigned", broadcast: false }),
    ).rejects.toThrow(/did not return a signed PSBT/);
  });
});

describe("XverseAdapter.getBalance", () => {
  it("coerces numeric values to strings", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce(connectOk([]));
    request.mockResolvedValueOnce({
      status: "success",
      result: { confirmed: 1234, unconfirmed: 0, total: 1234 },
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    const bal = await adapter.getBalance();
    expect(bal).toEqual({ confirmed: "1234", unconfirmed: "0", total: "1234" });
  });

  it("throws when the provider response is missing fields (guards against undefined strings)", async () => {
    const request = jest.fn();
    request.mockResolvedValueOnce(connectOk([]));
    request.mockResolvedValueOnce({
      status: "success",
      result: { confirmed: 100 }, // unconfirmed and total missing
    });
    installProvider(request);
    const adapter = await XverseAdapter.enable();
    await expect(adapter.getBalance()).rejects.toThrow(/incomplete response/);
  });
});

describe("XverseAdapter.verifyMessage", () => {
  async function connected(request: jest.Mock) {
    installProvider(request);
    request.mockResolvedValueOnce(connectOk([]));
    // getNetwork is called inside verifyMessage
    request.mockResolvedValueOnce({
      status: "success",
      result: { bitcoin: { name: "Testnet4" } },
    });
    return XverseAdapter.enable();
  }

  it("returns valid:false (not throw) when signature is not 65 bytes (e.g. BIP-322)", async () => {
    const request = jest.fn();
    const adapter = await connected(request);
    // A non-65-byte base64 string simulates a BIP-322 or malformed signature.
    const nonEcdsaSig = Buffer.alloc(80).toString("base64");
    const result = await adapter.verifyMessage("tb1q...", "hello", nonEcdsaSig);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/65-byte/i);
  });
});
