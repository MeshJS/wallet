/**
 * Coin selection for Bitcoin transactions.
 *
 * Operates on the minimal outpoint shape (`txid`/`vout`/`value`) so it accepts
 * both full `UTxO` objects returned by an `IBitcoinProvider` and any
 * caller-constructed input set.
 */

/**
 * Minimal UTxO shape required for coin selection.
 */
export type SelectableUTxO = {
  txid: string;
  vout: number;
  value: number;
};

export type CoinSelectionResult<T extends SelectableUTxO> = {
  selectedUtxos: T[];
  change: number;
};

export type CoinSelectionStrategy = <T extends SelectableUTxO>(
  utxos: T[],
  targetAmount: number,
  feeRate: number,
  numRecipients: number,
) => CoinSelectionResult<T>;

/**
 * P2WPKH dust threshold under default relay policy (Bitcoin Core ~0.21+):
 * outputs below this value are non-standard and the tx will fail to relay.
 * 546 sats matches `GetDustThreshold` for a P2WPKH output at the default
 * 3000 sat/kvB dust feerate. Absorb anything below this into the miner fee.
 */
export const DUST_THRESHOLD_P2WPKH = 546;

/**
 * Largest-first UTXO selection with P2WPKH-realistic vbyte estimates.
 *
 * vbyte math (BIP-141 / BIP-144):
 *   - overhead: 10.5 vB (version 4 + locktime 4 + segwit marker/flag 0.5 + 2× varint <253)
 *   - per P2WPKH input: 68 vB (outpoint 41 + script_len 1 + sequence 0 + witness ~27)
 *   - per output: 31 vB (value 8 + script_len 1 + scriptPubKey 22)
 *
 * Tries with-change first; if change would be sub-dust, retries without a
 * change output (one fewer 31 vB output) so the dust is consumed as fee.
 *
 * @param utxos - Candidate UTxOs (e.g. from `IBitcoinProvider.fetchAddressUTxOs`).
 * @param targetAmount - Total amount to send across all recipients, in satoshis.
 * @param feeRate - Fee rate in satoshis per vByte.
 * @param numRecipients - Number of recipient outputs in the transaction.
 * @returns The selected UTxOs and the change value (0 when no change output).
 * @throws When the UTxO set cannot cover `targetAmount` plus fees.
 */
export function selectUtxosLargestFirst<T extends SelectableUTxO>(
  utxos: T[],
  targetAmount: number,
  feeRate: number,
  numRecipients: number,
): CoinSelectionResult<T> {
  const VB_OVERHEAD = 11;
  const VB_INPUT_P2WPKH = 68;
  const VB_OUTPUT = 31;
  const recipientsVb = numRecipients * VB_OUTPUT;

  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  let selectedValue = 0;
  const selected: T[] = [];

  for (const utxo of sorted) {
    selected.push(utxo);
    selectedValue += utxo.value;
    const inputsVb = selected.length * VB_INPUT_P2WPKH;
    const vbytesWithChange = VB_OVERHEAD + inputsVb + recipientsVb + VB_OUTPUT;
    const vbytesNoChange = VB_OVERHEAD + inputsVb + recipientsVb;
    const feeWithChange = Math.ceil(vbytesWithChange * feeRate);
    const feeNoChange = Math.ceil(vbytesNoChange * feeRate);

    if (selectedValue >= targetAmount + feeWithChange) {
      const change = selectedValue - targetAmount - feeWithChange;
      if (change >= DUST_THRESHOLD_P2WPKH) {
        return { selectedUtxos: selected, change };
      }
      // Change would be dust — drop the change output, absorb dust as fee.
      if (selectedValue >= targetAmount + feeNoChange) {
        return { selectedUtxos: selected, change: 0 };
      }
    } else if (selectedValue >= targetAmount + feeNoChange) {
      // Just enough for a no-change tx.
      return { selectedUtxos: selected, change: 0 };
    }
  }
  throw new Error("[CoinSelection] Insufficient funds for transaction");
}
