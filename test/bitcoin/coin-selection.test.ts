import {
  DUST_THRESHOLD_P2WPKH,
  selectUtxosLargestFirst,
} from "../../src/bitcoin/utils/coin-selection";

const makeUtxo = (value: number, i = 0) => ({
  txid: `${i}`.padStart(64, "0"),
  vout: i,
  value,
});

/**
 * vbyte model used by the selector (see coin-selection.ts):
 *   overhead 11 + 68/input + 31/output.
 * 1 input, 1 recipient, with change: 11 + 68 + 31 + 31 = 141 vB.
 * 1 input, 1 recipient, no change:  11 + 68 + 31      = 110 vB.
 */
describe("selectUtxosLargestFirst", () => {
  it("selects the largest UTxO first", () => {
    const utxos = [
      makeUtxo(10_000, 0),
      makeUtxo(90_000, 1),
      makeUtxo(50_000, 2),
    ];
    const { selectedUtxos } = selectUtxosLargestFirst(utxos, 20_000, 1, 1);
    expect(selectedUtxos).toHaveLength(1);
    expect(selectedUtxos[0]!.value).toBe(90_000);
  });

  it("accumulates multiple UTxOs until target plus fee is covered", () => {
    const utxos = [
      makeUtxo(30_000, 0),
      makeUtxo(30_000, 1),
      makeUtxo(30_000, 2),
    ];
    const { selectedUtxos, change } = selectUtxosLargestFirst(
      utxos,
      55_000,
      1,
      1,
    );
    expect(selectedUtxos).toHaveLength(2);
    // 2 inputs, with change: 11 + 2*68 + 31 + 31 = 209 vB → fee 209 sats.
    expect(change).toBe(60_000 - 55_000 - 209);
  });

  it("returns exact change matching the vbyte fee model", () => {
    const { change } = selectUtxosLargestFirst(
      [makeUtxo(100_000)],
      10_000,
      1,
      1,
    );
    // 1 input, with change: 141 vB → fee 141 sats.
    expect(change).toBe(100_000 - 10_000 - 141);
  });

  it("scales fee with the fee rate", () => {
    const { change } = selectUtxosLargestFirst(
      [makeUtxo(100_000)],
      10_000,
      10,
      1,
    );
    expect(change).toBe(100_000 - 10_000 - 1_410);
  });

  it("accounts for extra recipient outputs in the fee", () => {
    const { change } = selectUtxosLargestFirst(
      [makeUtxo(100_000)],
      10_000,
      1,
      3,
    );
    // 1 input, 3 recipients, with change: 11 + 68 + 3*31 + 31 = 203 vB.
    expect(change).toBe(100_000 - 10_000 - 203);
  });

  it("drops sub-dust change and absorbs it as fee", () => {
    // 10_700 - 10_500 - 141 = 59 → below dust; no-change fee 110 still covered.
    const { selectedUtxos, change } = selectUtxosLargestFirst(
      [makeUtxo(10_700)],
      10_500,
      1,
      1,
    );
    expect(selectedUtxos).toHaveLength(1);
    expect(change).toBe(0);
  });

  it("keeps change exactly at the dust threshold", () => {
    // Choose value so change is exactly 546: 10_000 + 141 + 546 = 10_687.
    const { change } = selectUtxosLargestFirst(
      [makeUtxo(10_687)],
      10_000,
      1,
      1,
    );
    expect(change).toBe(DUST_THRESHOLD_P2WPKH);
  });

  it("selects a no-change tx when value only covers the smaller fee", () => {
    // Covers target + no-change fee (110) but not with-change fee (141).
    const { change } = selectUtxosLargestFirst(
      [makeUtxo(10_120)],
      10_000,
      1,
      1,
    );
    expect(change).toBe(0);
  });

  it("throws when the UTxO set cannot cover target plus fee", () => {
    expect(() =>
      selectUtxosLargestFirst([makeUtxo(10_000)], 10_000, 1, 1),
    ).toThrow(/Insufficient funds/);
  });

  it("throws on an empty UTxO set", () => {
    expect(() => selectUtxosLargestFirst([], 1_000, 1, 1)).toThrow(
      /Insufficient funds/,
    );
  });

  it("does not mutate the input array", () => {
    const utxos = [makeUtxo(1_000, 0), makeUtxo(90_000, 1)];
    const snapshot = [...utxos];
    selectUtxosLargestFirst(utxos, 10_000, 1, 1);
    expect(utxos).toEqual(snapshot);
  });

  it("preserves extra properties on selected UTxOs (generic passthrough)", () => {
    const utxos = [{ ...makeUtxo(90_000), address: "tb1q..." }];
    const { selectedUtxos } = selectUtxosLargestFirst(utxos, 10_000, 1, 1);
    expect(selectedUtxos[0]!.address).toBe("tb1q...");
  });
});
