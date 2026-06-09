import { AddressInfo } from "../types/address-info";
import { ScriptInfo } from "../types/script-info";
import { TransactionsInfo } from "../types/transactions-info";
import { TransactionsStatus } from "../types/transactions-status";
import { UTxO } from "../types/utxo";

/**
 * Read-only chain data queries for Bitcoin addresses and scripts.
 * Mirrors the Mesh `IFetcher` interface shape for Cardano, adapted to Bitcoin.
 * Only the methods relevant to Bitcoin are included; script variants are optional
 * because P2SH/P2WSH usage is uncommon in most dApp workflows.
 */
export interface IBitcoinFetcher {
  fetchAddressInfo(address: string): Promise<AddressInfo>;
  fetchAddressUTxOs(address: string): Promise<UTxO[]>;
  fetchUTxO(txid: string, vout?: number): Promise<UTxO[]>;
  fetchAddressTxs(
    address: string,
    lastSeenTxid?: string,
  ): Promise<TransactionsInfo[]>;
  fetchTxInfo(txid: string): Promise<TransactionsStatus>;
  fetchFeeEstimates(blocks: number): Promise<number>;
  fetchScriptInfo?(hash: string): Promise<ScriptInfo>;
  fetchScriptUTxOs?(hash: string): Promise<UTxO[]>;
  fetchScriptTxs?(
    hash: string,
    lastSeenTxid?: string,
  ): Promise<TransactionsInfo[]>;
}

export interface IBitcoinSubmitter {
  submitTx(tx: string): Promise<string>;
}

export interface IBitcoinProvider extends IBitcoinFetcher, IBitcoinSubmitter {}
