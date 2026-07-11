import { Cardano, Serialization } from "@cardano-sdk/core";
import { Asset, UTxO } from "@meshsdk/common";
import { DecodedAddress, DecodedAsset, DecodedBalance } from "./types";

/**
 *
 * @example
 * const addr = deserializeWalletAddressFromHex(await api.getChangeAddress());
 *
 * const used = (await api.getUsedAddresses()).map(deserializeWalletAddressFromHex);
 */
export function deserializeWalletAddressFromHex(hex: string): DecodedAddress {
  return {
    hex,
    bech32: Cardano.Address.fromBytes(hex as any).toBech32() as string,
  };
}

/**
 * Flattens a `multiasset` map into `DecodedAsset[]`.
 * The AssetId key is `policyId (56 hex chars) + assetName`.
 *
 * @example
 * const { Value } = Serialization;
 * const value = Value.fromCbor(await api.getBalance() as any);
 * const assets = deserializeWalletMultiasset(value.multiasset());
 * // [{ policyId, assetName, quantity, unit }, ...]
 */
export function deserializeWalletMultiasset(multiasset?: Map<Cardano.AssetId, bigint>): DecodedAsset[] {
  if (!multiasset) return [];
  return Array.from(multiasset.entries()).map(([assetId, quantity]) => {
    const policyId  = assetId.slice(0, 56);
    const assetName = assetId.slice(56);
    return { policyId, assetName, quantity, unit: policyId + assetName };
  });
}

/**
 *
 * @example
 * const balance = deserializeWalletBalanceFromCbor(await api.getBalance());
 */
export function deserializeWalletBalanceFromCbor(cbor: string): DecodedBalance {
  const v = Serialization.Value.fromCbor(cbor as any);
  return { cbor, lovelace: v.coin(), assets: deserializeWalletMultiasset(v.multiasset()) };
}

/**
 * @example
 * const utxo = deserializeWalletUtxoFromCbor((await api.getUtxos())![0]);
 * txBuilder.txIn(utxo.input.txHash, utxo.input.outputIndex, utxo.output.amount, utxo.output.address);
 */
export function deserializeWalletUtxoFromCbor(cbor: string): UTxO {
  const u      = Serialization.TransactionUnspentOutput.fromCbor(cbor as any);
  const input  = u.input();
  const output = u.output();

  const amount: Asset[] = [
    { unit: "lovelace", quantity: String(output.amount().coin()) },
    ...Array.from(output.amount().multiasset()?.entries() ?? []).map(
      ([assetId, qty]) => ({ unit: assetId as string, quantity: String(qty) }),
    ),
  ];

  const utxo: UTxO = {
    input: {
      txHash:      input.transactionId() as string,
      outputIndex: Number(input.index()),
    },
    output: {
      address: output.address().toBech32() as string,
      amount,
    },
  };

  const datum = output.datum();
  if (datum !== undefined) {
    const dataHash = datum.asDataHash();
    if (dataHash !== undefined) {
      utxo.output.dataHash = dataHash as string;
    } else {
      // Inline PlutusData — serialize to CBOR hex
      utxo.output.plutusData = datum.asInlineData()!.toCbor();
    }
  }

  const scriptRef = output.scriptRef();
  if (scriptRef !== undefined) {
    utxo.output.scriptHash = scriptRef.hash() as string;
  }

  return utxo;
}

/**
 * @example
 * const utxos      = deserializeWalletUtxosFromCbor(await api.getUtxos());
 * const collateral = deserializeWalletUtxosFromCbor(await api.getCollateral());
 */
export function deserializeWalletUtxosFromCbor(cbors: string[]): UTxO[];
export function deserializeWalletUtxosFromCbor(cbors: string[] | null): UTxO[] | null;
export function deserializeWalletUtxosFromCbor(cbors: string[] | null): UTxO[] | null {
  return cbors === null ? null : cbors.map(deserializeWalletUtxoFromCbor);
}
