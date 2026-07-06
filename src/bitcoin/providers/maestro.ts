import { IBitcoinProvider } from "../interfaces/bitcoin-provider";
import { AddressInfo } from "../types/address-info";
import { ScriptInfo } from "../types/script-info";
import { TransactionsInfo } from "../types/transactions-info";
import { TransactionsStatus } from "../types/transactions-status";
import { UTxO } from "../types/utxo";
import { requestJson } from "./common";

export type MaestroSupportedNetworks = "mainnet" | "testnet";

export interface MaestroConfig {
  network: MaestroSupportedNetworks;
  apiKey: string;
}

/**
 * Esplora `/tx/:txid/outspends` entry — spending status of one output.
 */
type OutspendStatus = {
  spent: boolean;
  txid?: string;
  vin?: number;
  status?: TransactionsStatus;
};

/**
 * Maestro data provider for Bitcoin.
 *
 * Implements `IBitcoinProvider` (fetcher + submitter) against the Maestro
 * Bitcoin API's Esplora-compatible endpoints, mirroring the shape of the Mesh
 * Cardano providers. Uses the platform `fetch` — no HTTP client dependency.
 *
 * @see https://docs.gomaestro.org/bitcoin
 */
export class MaestroProvider implements IBitcoinProvider {
  private readonly _baseUrl: string;
  private readonly _headers: Record<string, string>;
  private readonly _network: MaestroSupportedNetworks;

  /**
   * Create provider with custom base URL (for proxy endpoints).
   * @param baseUrl - The base URL of the proxy endpoint.
   * @param apiKey - The API key for the proxy.
   */
  constructor(baseUrl: string, apiKey: string);

  /**
   * Create provider with Maestro configuration.
   * @param config - The Maestro configuration object.
   */
  constructor(config: MaestroConfig);

  constructor(...args: unknown[]) {
    if (
      typeof args[0] === "string" &&
      (args[0].startsWith("http") || args[0].startsWith("/"))
    ) {
      this._baseUrl = args[0];
      this._headers = { "api-key": args[1] as string };
      this._network = args[0].includes("testnet") ? "testnet" : "mainnet";
    } else {
      const { network, apiKey } = args[0] as MaestroConfig;
      this._baseUrl = `https://xbt-${network}.gomaestro-api.org/v0`;
      this._headers = { "api-key": apiKey };
      this._network = network;
    }
  }

  /**
   * Get information about an address: chain and mempool funded/spent sums.
   * @param address - The address.
   * @returns AddressInfo
   */
  async fetchAddressInfo(address: string): Promise<AddressInfo> {
    return this.get<AddressInfo>(`/esplora/address/${address}`);
  }

  /**
   * Get the list of unspent transaction outputs associated with the address.
   * @param address - The address.
   * @returns UTxO[]
   */
  async fetchAddressUTxOs(address: string): Promise<UTxO[]> {
    return this.get<UTxO[]>(`/esplora/address/${address}/utxo`);
  }

  /**
   * Get the unspent outputs of a transaction, optionally restricted to a
   * single output index. Composes the Esplora transaction and outspends
   * endpoints: an output is returned only if it has not been spent.
   * @param txid - The transaction ID.
   * @param vout - Restrict the result to this output index (optional).
   * @returns UTxO[] — the transaction's unspent outputs.
   */
  async fetchUTxO(txid: string, vout?: number): Promise<UTxO[]> {
    const [tx, outspends] = await Promise.all([
      this.get<TransactionsInfo>(`/esplora/tx/${txid}`),
      this.get<OutspendStatus[]>(`/esplora/tx/${txid}/outspends`),
    ]);

    return tx.vout
      .map((output, index) => ({
        txid,
        vout: index,
        value: output.value,
        status: tx.status,
      }))
      .filter(
        (utxo) =>
          (vout === undefined || utxo.vout === vout) &&
          !outspends[utxo.vout]?.spent,
      );
  }

  /**
   * Get transaction history for the specified address, sorted with newest
   * first. Returns mempool transactions plus the first 25 confirmed
   * transactions; request more confirmed transactions using `lastSeenTxid`.
   * @param address - The address.
   * @param lastSeenTxid - The last seen transaction ID (optional).
   * @returns TransactionsInfo[]
   */
  async fetchAddressTxs(
    address: string,
    lastSeenTxid?: string,
  ): Promise<TransactionsInfo[]> {
    const path = lastSeenTxid
      ? `/esplora/address/${address}/txs/chain/${lastSeenTxid}`
      : `/esplora/address/${address}/txs`;
    return this.get<TransactionsInfo[]>(path);
  }

  /**
   * Get the confirmation status of a transaction.
   * @param txid - The transaction ID.
   * @returns TransactionsStatus
   */
  async fetchTxInfo(txid: string): Promise<TransactionsStatus> {
    return this.get<TransactionsStatus>(`/esplora/tx/${txid}/status`);
  }

  /**
   * Get the estimated fee rate for confirmation within `blocks` blocks.
   * Reads the Esplora fee-estimates map (sat/vB keyed by confirmation
   * target) and picks the closest available target at or above `blocks`.
   * @param blocks - The confirmation target in blocks (default: 6).
   * @returns The estimated fee rate in satoshis per vByte.
   */
  async fetchFeeEstimates(blocks: number = 6): Promise<number> {
    const estimates = await this.get<Record<string, number>>(
      "/esplora/fee-estimates",
    );

    const targets = Object.keys(estimates)
      .map(Number)
      .sort((a, b) => a - b);
    const closest =
      targets.find((target) => target >= blocks) ?? targets[targets.length - 1];
    const feeRate = closest !== undefined ? estimates[closest.toString()] : 0;

    if (!feeRate || feeRate <= 0) {
      if (this._network === "testnet") {
        return 1; // 1 sat/vByte fallback for testnet (low activity expected)
      }
      throw new Error("[MaestroProvider] Fee estimation unavailable");
    }

    return feeRate;
  }

  /**
   * Get information about a script hash.
   * @param hash - The script hash.
   * @returns ScriptInfo
   * @note Maestro does not have any endpoint available for this yet
   */
  async fetchScriptInfo(hash: string): Promise<ScriptInfo> {
    return this.notImplemented("fetchScriptInfo");
  }

  /**
   * Get the list of unspent transaction outputs associated with the script hash.
   * @param hash - The script hash.
   * @returns UTxO[]
   * @note Maestro does not have any endpoint available for this yet
   */
  async fetchScriptUTxOs(hash: string): Promise<UTxO[]> {
    return this.notImplemented("fetchScriptUTxOs");
  }

  /**
   * Get transaction history for the specified script hash.
   * @param hash - The script hash.
   * @param lastSeenTxid - The last seen transaction ID (optional).
   * @returns TransactionsInfo[]
   * @note Maestro does not have any endpoint available for this yet
   */
  async fetchScriptTxs(
    hash: string,
    lastSeenTxid?: string,
  ): Promise<TransactionsInfo[]> {
    return this.notImplemented("fetchScriptTxs");
  }

  private notImplemented(method: string): never {
    throw new Error(
      `[MaestroProvider] ${method} is not implemented - Maestro does not have any endpoint available for this yet`,
    );
  }

  /**
   * Broadcast a raw transaction to the network.
   * @param tx - The raw transaction in hexadecimal format.
   * @returns The transaction ID.
   */
  async submitTx(tx: string): Promise<string> {
    const data = await this.post<{ txid?: string } | string>("/esplora/tx", tx);
    if (typeof data === "string") return data;
    if (data?.txid) return data.txid;
    throw new Error(
      `[MaestroProvider] submitTx: unexpected response ${JSON.stringify(data)}`,
    );
  }

  /**
   * Get the network this provider is configured for.
   * @returns The network configuration (mainnet or testnet).
   */
  getNetwork(): MaestroSupportedNetworks {
    return this._network;
  }

  /**
   * Generic GET request against the Maestro API.
   * @param path - The API endpoint path.
   * @returns The parsed response data.
   */
  async get<T>(path: string): Promise<T> {
    return requestJson<T>(this._baseUrl, path, {
      method: "GET",
      headers: this._headers,
    });
  }

  /**
   * Generic POST request against the Maestro API.
   * @param path - The API endpoint path.
   * @param body - The request body (objects are JSON-encoded, strings sent raw).
   * @returns The parsed response data.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const isRaw = typeof body === "string";
    return requestJson<T>(this._baseUrl, path, {
      method: "POST",
      headers: {
        ...this._headers,
        "Content-Type": isRaw ? "text/plain" : "application/json",
      },
      body: isRaw ? body : JSON.stringify(body),
    });
  }
}
