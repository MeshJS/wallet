/**
 * A3 evidence: the CIP-30 adapter is provider-agnostic. It's driven purely
 * through `ICardanoWallet`'s `IFetcher`/`ISubmitter` dependencies, so any
 * conforming implementation of those interfaces can be swapped in without
 * touching the adapter or wallet code.
 *
 * Proven here with two independently-built `IFetcher`s - the SDK's
 * `OfflineFetcher` and a ~10-line hand-rolled fetcher backed by a plain
 * array - fed the *same* fixture data, plus an `ISubmitter` swap.
 */
import { AddressType } from "../../../src/cardano/address/cardano-address";
import { createCip30Api } from "../../../src/cardano/cip30/cip30-api";
import { CardanoHeadlessWallet } from "../../../src/cardano/wallet/mesh/cardano-headless-wallet";

import { IFetcher, ISubmitter, UTxO } from "@meshsdk/common";

import { FIXTURE_UTXOS, MNEMONIC, offlineFetcher } from "./fixtures";

/**
 * Minimal hand-rolled `IFetcher`: implements only the one method the wallet
 * actually calls (`fetchAddressUTxOs`), backed by a plain in-memory array
 * instead of any SDK machinery - deliberately not `OfflineFetcher` under the
 * hood, to prove the adapter has no implicit dependency on it.
 */
class ArrayFetcher implements Partial<IFetcher> {
  constructor(private readonly utxos: UTxO[]) {}

  async fetchAddressUTxOs(address: string): Promise<UTxO[]> {
    return this.utxos.filter((utxo) => utxo.output.address === address);
  }
}

async function walletWithFetcher(
  fetcher: IFetcher,
): Promise<CardanoHeadlessWallet> {
  return CardanoHeadlessWallet.fromMnemonic({
    mnemonic: MNEMONIC,
    networkId: 0,
    walletAddressType: AddressType.Base,
    fetcher,
  });
}

describe("A3: provider swappability (IFetcher)", () => {
  it("OfflineFetcher and a hand-rolled ArrayFetcher yield identical getUtxos() results given identical data", async () => {
    const offlineApi = createCip30Api(await walletWithFetcher(offlineFetcher));
    const arrayApi = createCip30Api(
      await walletWithFetcher(new ArrayFetcher(FIXTURE_UTXOS) as unknown as IFetcher),
    );

    const [offlineUtxos, arrayUtxos] = await Promise.all([
      offlineApi.getUtxos(),
      arrayApi.getUtxos(),
    ]);

    expect(arrayUtxos).toEqual(offlineUtxos);
    expect(arrayUtxos).toHaveLength(6);
  });

  it("agree on getBalance() and getCollateral() too", async () => {
    const offlineApi = createCip30Api(await walletWithFetcher(offlineFetcher));
    const arrayApi = createCip30Api(
      await walletWithFetcher(new ArrayFetcher(FIXTURE_UTXOS) as unknown as IFetcher),
    );

    await expect(arrayApi.getBalance()).resolves.toBe(
      await offlineApi.getBalance(),
    );
    await expect(arrayApi.getCollateral()).resolves.toEqual(
      await offlineApi.getCollateral(),
    );
  });
});

describe("A3: provider swappability (ISubmitter)", () => {
  it("submitTx() passes through whichever ISubmitter the wallet is constructed with", async () => {
    const submitterA: ISubmitter = { submitTx: async () => "txid-from-a" };
    const submitterB: ISubmitter = { submitTx: async () => "txid-from-b" };

    const walletA = await walletWithFetcher(offlineFetcher);
    Object.assign(walletA, { submitter: submitterA });
    const walletB = await walletWithFetcher(offlineFetcher);
    Object.assign(walletB, { submitter: submitterB });

    const apiA = createCip30Api(walletA);
    const apiB = createCip30Api(walletB);

    await expect(apiA.submitTx("84a0")).resolves.toBe("txid-from-a");
    await expect(apiB.submitTx("84a0")).resolves.toBe("txid-from-b");
  });
});
