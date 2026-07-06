import { MaestroProvider, ProviderHttpError } from "../../../src";

/**
 * Minimal Response-like object for mocking the platform `fetch`.
 * `requestJson` only touches `ok`, `status`, `statusText` and `text()`.
 */
function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("MaestroProvider", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function makeProvider(network: "mainnet" | "testnet" = "mainnet") {
    return new MaestroProvider({ network, apiKey: "test-key" });
  }

  /** URL of the nth fetch call. */
  function calledUrl(n = 0): string {
    return fetchMock.mock.calls[n]![0] as string;
  }

  // ---------------------------------------------------------------------------
  // constructor
  // ---------------------------------------------------------------------------
  describe("constructor", () => {
    it("builds the Maestro base URL from a network config", async () => {
      fetchMock.mockResolvedValue(mockResponse([]));
      await makeProvider("mainnet").fetchAddressUTxOs("addr");
      expect(calledUrl()).toBe(
        "https://xbt-mainnet.gomaestro-api.org/v0/esplora/address/addr/utxo",
      );
    });

    it("resolves network from the config", () => {
      expect(makeProvider("testnet").getNetwork()).toBe("testnet");
      expect(makeProvider("mainnet").getNetwork()).toBe("mainnet");
    });

    it("accepts a custom baseUrl + apiKey overload", async () => {
      const provider = new MaestroProvider(
        "https://proxy.example.com/btc",
        "k",
      );
      fetchMock.mockResolvedValue(mockResponse([]));
      await provider.fetchAddressUTxOs("addr");
      expect(calledUrl()).toBe(
        "https://proxy.example.com/btc/esplora/address/addr/utxo",
      );
    });

    it("detects testnet from a custom baseUrl", () => {
      const provider = new MaestroProvider(
        "https://xbt-testnet.example.com",
        "k",
      );
      expect(provider.getNetwork()).toBe("testnet");
    });

    it("sends the api-key header on every request", async () => {
      fetchMock.mockResolvedValue(mockResponse([]));
      await makeProvider().fetchAddressUTxOs("addr");
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect((init.headers as Record<string, string>)["api-key"]).toBe(
        "test-key",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // fetchAddressUTxOs / fetchAddressInfo
  // ---------------------------------------------------------------------------
  describe("address queries", () => {
    it("fetchAddressUTxOs returns the UTxO array as-is", async () => {
      const utxos = [
        {
          txid: "a".repeat(64),
          vout: 1,
          value: 50_000,
          status: {
            confirmed: true,
            block_height: 100,
            block_hash: "b".repeat(64),
            block_time: 1,
          },
        },
      ];
      fetchMock.mockResolvedValue(mockResponse(utxos));
      const result = await makeProvider().fetchAddressUTxOs("addr");
      expect(result).toEqual(utxos);
    });

    it("fetchAddressInfo hits the esplora address endpoint", async () => {
      const info = {
        address: "addr",
        chain_stats: { funded_txo_sum: 1, spent_txo_sum: 0 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
      };
      fetchMock.mockResolvedValue(mockResponse(info));
      const result = await makeProvider().fetchAddressInfo("addr");
      expect(result).toEqual(info);
      expect(calledUrl()).toContain("/esplora/address/addr");
    });

    it("fetchAddressTxs paginates with lastSeenTxid", async () => {
      fetchMock.mockResolvedValue(mockResponse([]));
      const provider = makeProvider();
      await provider.fetchAddressTxs("addr");
      expect(calledUrl(0)).toContain("/esplora/address/addr/txs");
      await provider.fetchAddressTxs("addr", "cursor-txid");
      expect(calledUrl(1)).toContain(
        "/esplora/address/addr/txs/chain/cursor-txid",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // fetchUTxO
  // ---------------------------------------------------------------------------
  describe("fetchUTxO", () => {
    const txid = "c".repeat(64);
    const status = {
      confirmed: true,
      block_height: 200,
      block_hash: "d".repeat(64),
      block_time: 2,
    };
    const tx = {
      txid,
      status,
      vout: [{ value: 1_000 }, { value: 2_000 }, { value: 3_000 }],
    };

    function mockTxAndOutspends(outspends: { spent: boolean }[]) {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith("/outspends")
            ? mockResponse(outspends)
            : mockResponse(tx),
        ),
      );
    }

    it("returns only unspent outputs", async () => {
      mockTxAndOutspends([{ spent: false }, { spent: true }, { spent: false }]);
      const result = await makeProvider().fetchUTxO(txid);
      expect(result).toEqual([
        { txid, vout: 0, value: 1_000, status },
        { txid, vout: 2, value: 3_000, status },
      ]);
    });

    it("restricts to a single vout when requested", async () => {
      mockTxAndOutspends([
        { spent: false },
        { spent: false },
        { spent: false },
      ]);
      const result = await makeProvider().fetchUTxO(txid, 1);
      expect(result).toEqual([{ txid, vout: 1, value: 2_000, status }]);
    });

    it("returns empty when the requested vout is spent", async () => {
      mockTxAndOutspends([{ spent: true }, { spent: true }, { spent: true }]);
      const result = await makeProvider().fetchUTxO(txid, 0);
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // fetchTxInfo / fee estimates
  // ---------------------------------------------------------------------------
  describe("tx status and fees", () => {
    it("fetchTxInfo returns the transaction status", async () => {
      const status = {
        confirmed: true,
        block_height: 1,
        block_hash: "e".repeat(64),
        block_time: 3,
      };
      fetchMock.mockResolvedValue(mockResponse(status));
      const result = await makeProvider().fetchTxInfo("txid");
      expect(result).toEqual(status);
      expect(calledUrl()).toContain("/esplora/tx/txid/status");
    });

    it("picks the closest confirmation target at or above `blocks`", async () => {
      fetchMock.mockResolvedValue(
        mockResponse({ "1": 30.5, "6": 12.2, "144": 1.5 }),
      );
      expect(await makeProvider().fetchFeeEstimates(6)).toBe(12.2);
      expect(await makeProvider().fetchFeeEstimates(3)).toBe(12.2);
      expect(await makeProvider().fetchFeeEstimates(1)).toBe(30.5);
    });

    it("falls back to the slowest target when `blocks` exceeds all targets", async () => {
      fetchMock.mockResolvedValue(mockResponse({ "1": 30.5, "6": 12.2 }));
      expect(await makeProvider().fetchFeeEstimates(500)).toBe(12.2);
    });

    it("returns 1 sat/vB on testnet when estimates are unavailable", async () => {
      fetchMock.mockResolvedValue(mockResponse({}));
      expect(await makeProvider("testnet").fetchFeeEstimates(6)).toBe(1);
    });

    it("throws on mainnet when estimates are unavailable", async () => {
      fetchMock.mockResolvedValue(mockResponse({}));
      await expect(
        makeProvider("mainnet").fetchFeeEstimates(6),
      ).rejects.toThrow(/Fee estimation unavailable/);
    });
  });

  // ---------------------------------------------------------------------------
  // submitTx
  // ---------------------------------------------------------------------------
  describe("submitTx", () => {
    it("posts the tx hex and returns the plain-text txid", async () => {
      fetchMock.mockResolvedValue(mockResponse("f".repeat(64)));
      const txid = await makeProvider().submitTx("020000000001...");
      expect(txid).toBe("f".repeat(64));
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(init.body).toBe("020000000001...");
      expect(calledUrl()).toContain("/esplora/tx");
    });

    it("accepts a JSON { txid } response shape", async () => {
      fetchMock.mockResolvedValue(mockResponse({ txid: "abc123" }));
      expect(await makeProvider().submitTx("00")).toBe("abc123");
    });

    it("surfaces broadcast rejection as ProviderHttpError with details", async () => {
      fetchMock.mockResolvedValue(
        mockResponse(
          "sendrawtransaction RPC error: min relay fee not met",
          400,
        ),
      );
      try {
        await makeProvider().submitTx("00");
        fail("expected submitTx to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderHttpError);
        expect((error as Error).message).toMatch(/min relay fee not met/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // errors + unsupported endpoints
  // ---------------------------------------------------------------------------
  describe("errors", () => {
    it("throws ProviderHttpError carrying status for non-2xx responses", async () => {
      fetchMock.mockResolvedValue(
        mockResponse({ message: "Address not found" }, 404),
      );
      try {
        await makeProvider().fetchAddressUTxOs("bad-addr");
        fail("expected fetchAddressUTxOs to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderHttpError);
        expect((error as ProviderHttpError).details.status).toBe(404);
      }
    });

    it("script endpoints throw a not-implemented error", async () => {
      const provider = makeProvider();
      await expect(provider.fetchScriptInfo("hash")).rejects.toThrow(
        /not implemented/,
      );
      await expect(provider.fetchScriptUTxOs("hash")).rejects.toThrow(
        /not implemented/,
      );
      await expect(provider.fetchScriptTxs("hash")).rejects.toThrow(
        /not implemented/,
      );
    });
  });
});
