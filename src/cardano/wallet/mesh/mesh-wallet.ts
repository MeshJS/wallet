import { Cardano, Serialization } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import { Asset, UTxO } from "@meshsdk/common";

import { InMemoryBip32 } from "../../../bip32/in-memory-bip32";
import {
  AddressManager,
  CredentialSource,
} from "../../address/single-address-manager";
import {
  CardanoHeadlessWallet,
  CardanoHeadlessWalletConfig,
} from "./cardano-headless-wallet";

/**
 * MeshCardanoHeadlessWallet provides additional convenience methods on top of CardanoHeadlessWallet,
 * such as returning results in Mesh-compatible formats and Bech32 addresses.
 */
export class MeshCardanoHeadlessWallet extends CardanoHeadlessWallet {
  static async create(config: CardanoHeadlessWalletConfig): Promise<MeshCardanoHeadlessWallet> {
    const addressManager = await AddressManager.create({
      addressSource: config.addressSource,
      networkId: config.networkId,
    });

    return new MeshCardanoHeadlessWallet(
      config.networkId,
      addressManager,
      config.walletAddressType,
      config.fetcher,
      config.submitter
    );
  }

  static async fromMnemonic(
    config: Omit<CardanoHeadlessWalletConfig, "addressSource"> & {
      mnemonic: string[];
      password?: string;
    }
  ): Promise<MeshCardanoHeadlessWallet> {
    const bip32 = await InMemoryBip32.fromMnemonic(
      config.mnemonic,
      config.password
    );
    return MeshCardanoHeadlessWallet.create({
      addressSource: { type: "secretManager", secretManager: bip32 },
      networkId: config.networkId,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  static async fromBip32Root(
    config: Omit<CardanoHeadlessWalletConfig, "addressSource"> & {
      bech32: string;
    }
  ): Promise<MeshCardanoHeadlessWallet> {
    const bip32 = InMemoryBip32.fromBech32(config.bech32);
    return MeshCardanoHeadlessWallet.create({
      addressSource: { type: "secretManager", secretManager: bip32 },
      networkId: config.networkId,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  static async fromBip32RootHex(
    config: Omit<CardanoHeadlessWalletConfig, "addressSource"> & {
      hex: string;
    }
  ): Promise<MeshCardanoHeadlessWallet> {
    const bip32 = InMemoryBip32.fromKeyHex(config.hex);
    return MeshCardanoHeadlessWallet.create({
      addressSource: { type: "secretManager", secretManager: bip32 },
      networkId: config.networkId,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  static async fromCredentialSources(
    config: Omit<CardanoHeadlessWalletConfig, "addressSource"> & {
      paymentCredentialSource: CredentialSource;
      stakeCredentialSource?: CredentialSource;
      drepCredentialSource?: CredentialSource;
    }
  ): Promise<MeshCardanoHeadlessWallet> {
    return MeshCardanoHeadlessWallet.create({
      addressSource: {
        type: "credentials",
        paymentCredential: config.paymentCredentialSource,
        stakeCredential: config.stakeCredentialSource,
        drepCredential: config.drepCredentialSource,
      },
      networkId: config.networkId,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  /**
   * Get the UTxOs for the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getUtxos, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means that there
   * will be overlap between getUtxos() and getCollateral() results. This can result in the collateral being
   * spent between transactions.
   *
   * The method also does not perform pagination, nor is there a coin selection mechanism.
   * @returns {Promise<UTxO[]>} A promise that resolves to an array of UTxOs in the Mesh UTxO format
   */
  async getUtxosMesh(): Promise<UTxO[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    return await this.fetchAccountUtxos();
  }

  /**
   * Get the collateral UTxOs for the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getCollateral, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means that there
   * will be overlap between getUtxos() and getCollateral() results.
   *
   * The basic strategy is to return the smallest pure ADA UTxO that is at least 5 ADA belonging to the wallet.
   * @returns {Promise<UTxO[]>} A promise that resolves to an array of UTxOs in the Mesh UTxO format
   */
  async getCollateralMesh(): Promise<UTxO[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    const getUtxoLovelaceValue = (utxo: UTxO) => {
      const value = utxo.output.amount;
      let lovelace = 0;
      for (const asset of value) {
        if (asset.unit === "lovelace" || asset.unit === "") {
          lovelace = parseInt(asset.quantity);
        }
      }
      return lovelace;
    };
    // sort utxos by lovelace value ascending
    const sortedUtxos = utxos.sort(
      (a, b) => getUtxoLovelaceValue(a) - getUtxoLovelaceValue(b)
    );

    // return the smallest utxo with at least 5 ADA
    for (const utxo of sortedUtxos) {
      if (getUtxoLovelaceValue(utxo) >= 5_000_000) {
        return [utxo];
      }
    }
    return [];
  }

  /**
   * Get the balance of the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getBalance, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means the balance
   * returned includes all UTxOs, including those that may be used as collateral.
   * @returns {Promise<Asset[]>} A promise that resolves to the balance in the Mesh Asset format
   */
  async getBalanceMesh(): Promise<Asset[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    return utxos.map((utxo) => utxo.output.amount).flat();
  }

  /**
   * Get the used addresses for the wallet.
   *
   * NOTE: This method completely deviates from CIP-30 getUsedAddresses, as this wallet is stateless
   * it is impossible to track which addresses have been used. This method simply returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string[]>} A promise that resolves to an array of used addresses in Bech32 format
   */
  async getUsedAddressesBech32(): Promise<string[]> {
    const addresses = await this.getUsedAddresses();
    return addresses.map((addr) => {
      const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addr));
      return cardanoAddr.toBech32();
    });
  }

  /**
   * Get the unused addresses for the wallet.
   *
   * NOTE: This method completely deviates from CIP-30 getUnusedAddresses, as this wallet is stateless
   * it is impossible to track which addresses have been used. This method simply returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string[]>} A promise that resolves to an array of unused addresses in Bech32 format
   */
  async getUnusedAddressesBech32(): Promise<string[]> {
    const addresses = await this.getUnusedAddresses();
    return addresses.map((addr) => {
      const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addr));
      return cardanoAddr.toBech32();
    });
  }

  /**
   * Get the change address for the wallet.
   * NOTE: This method deviates from CIP-30 getChangeAddress, as this wallet is stateless
   * it does not track which addresses has been previously used as change address. This method simply
   * returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string>} A promise that resolves to the change address in Bech32 format
   */
  async getChangeAddressBech32(): Promise<string> {
    const address = await this.getChangeAddress();
    const cardanoAddr = Cardano.Address.fromBytes(HexBlob(address));
    return cardanoAddr.toBech32();
  }

  /**
   * Get the reward address for the wallet.
   * @returns {Promise<string[]>} A promise that resolves an array of reward addresses in Bech32 format
   */
  async getRewardAddressesBech32(): Promise<string[]> {
    const addresses = await this.getRewardAddresses();

    return addresses.map((addr) => {
      const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addr));
      return cardanoAddr.toBech32();
    });
  }

  /**
   * Sign a transaction with the wallet.
   *
   * NOTE: This method requires a fetcher to resolve input UTxOs for determining required signers.
   *
   * It is also only an approximation to CIP-30 signTx, as this wallet is stateless and does not repeatedly
   * derive keys, it is unable to sign for multiple derived key indexes.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @param tx The transaction in CBOR hex format
   * @returns A promise that resolves to a full transaction with extra vkey witnesses added from the wallet
   * to the witness set in CBOR hex format
   */
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
