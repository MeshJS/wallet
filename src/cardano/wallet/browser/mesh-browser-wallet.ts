import { Asset, Extension, UTxO } from "@meshsdk/common";
import { ICardanoWallet } from "../../../interfaces/cardano-wallet";
import { CardanoBrowserWallet } from "./cardano-browser-wallet";
import { Serialization, Cardano } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";
import { fromTxUnspentOutput, fromValue } from "../../../utils/converter";

export class MeshBrowserWallet extends CardanoBrowserWallet {
  constructor(walletInstance: ICardanoWallet) {
    super(walletInstance);
  }

  static async enable(
    walletName: string,
    extensions: Extension[] = []
  ): Promise<MeshBrowserWallet> {
    const walletInstance = await super.enable(walletName, extensions);
    return new MeshBrowserWallet(walletInstance);
  }

  async getUtxosMesh(): Promise<UTxO[]> {
    const utxosCbor = await this.getUtxos();
    return utxosCbor.map((utxoCbor) =>
      fromTxUnspentOutput(
        Serialization.TransactionUnspentOutput.fromCbor(HexBlob(utxoCbor))
      )
    );
  }

  async getCollateralMesh(): Promise<UTxO[]> {
    const collateralCbor = await this.getCollateral();
    return collateralCbor.map((utxoCbor) =>
      fromTxUnspentOutput(
        Serialization.TransactionUnspentOutput.fromCbor(HexBlob(utxoCbor))
      )
    );
  }

  async getBalanceMesh(): Promise<Asset[]> {
    const balanceCbor = await this.getBalance();
    const value = Serialization.Value.fromCbor(HexBlob(balanceCbor));
    return fromValue(value);
  }

  async getUsedAddressesBech32(): Promise<string[]> {
    const addressesHex = await this.getUsedAddresses();
    return addressesHex.map((addr) => {
      const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addr));
      return cardanoAddr.toBech32();
    });
  }

  async getUnusedAddressesBech32(): Promise<string[]> {
    const addressesHex = await this.getUnusedAddresses();
    return addressesHex.map((addr) => {
      const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addr));
      return cardanoAddr.toBech32();
    });
  }

  async getChangeAddressBech32(): Promise<string> {
    const addressHex = await this.getChangeAddress();
    const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addressHex));
    return cardanoAddr.toBech32();
  }

  async getRewardAddressesBech32(): Promise<string[]> {
    const addresses = await this.getRewardAddresses();

    return addresses.map((addr) => {
      const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addr));
      return cardanoAddr.toBech32();
    });
  }

  async signTxReturnFullTx(
    tx: string,
    partialSign: boolean = false
  ): Promise<string> {
    const witnessCbor = await this.signTx(tx, partialSign);
    const addedWitnesses = Serialization.TransactionWitnessSet.fromCbor(
      HexBlob(witnessCbor)
    );
    const transaction = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(tx)
    );
    let witnessSet = transaction.witnessSet();
    let witnessSetVkeys = witnessSet.vkeys();
    let witnessSetVkeysValues: Serialization.VkeyWitness[] = witnessSetVkeys
      ? [
          ...witnessSetVkeys.values(),
          ...(addedWitnesses.vkeys()?.values() ?? []),
        ]
      : [...(addedWitnesses.vkeys()?.values() ?? [])];

    witnessSet.setVkeys(
      Serialization.CborSet.fromCore(
        witnessSetVkeysValues.map((vkw) => vkw.toCore()),
        Serialization.VkeyWitness.fromCore
      )
    );
    const signedTx = new Serialization.Transaction(
      transaction.body(),
      witnessSet,
      transaction.auxiliaryData()
    );
    return signedTx.toCbor();
  }
}
