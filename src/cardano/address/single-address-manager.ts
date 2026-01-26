import { setInConwayEra } from "@cardano-sdk/core";

import { ISecretManager } from "../../interfaces/secret-manager";
import { ISigner } from "../../interfaces/signer";
import {
  DEFAULT_DREP_KEY_DERIVATION_PATH,
  DEFAULT_PAYMENT_KEY_DERIVATION_PATH,
  DEFAULT_STAKE_KEY_DERIVATION_PATH,
} from "../utils/constants";
import {
  AddressType,
  CardanoAddress,
  Credential,
  CredentialType,
} from "./cardano-address";

export type CredentialSource =
  | {
      type: "signer";
      signer: ISigner;
    }
  | {
      type: "scriptHash";
      scriptHash: string;
    };

export interface AddressManagerConfig {
  addressSource: AddressSource;
  networkId: number;
}

export type AddressSource =
  | {
      type: "secretManager";
      secretManager: ISecretManager;
    }
  | {
      type: "credentials";
      paymentCredential: CredentialSource;
      stakeCredential?: CredentialSource;
      drepCredential?: CredentialSource;
    };

export class AddressManager {
  private readonly paymentCredential: Credential;
  private readonly stakeCredential: Credential;
  private readonly drepCredential: Credential;

  private readonly paymentSigner: ISigner;
  private readonly stakeSigner?: ISigner;
  private readonly drepSigner?: ISigner;

  private readonly networkId: number;

  static async create(config: AddressManagerConfig): Promise<AddressManager> {
    let paymentSigner: ISigner;
    let paymentCredential: Credential;

    if (config.addressSource.type === "credentials") {
      if (config.addressSource.paymentCredential.type === "scriptHash") {
        throw new Error(
          "Payment credential cannot be a script hash. Payment credentials must be key hashes that can sign transactions."
        );
      } else {
        paymentSigner = config.addressSource.paymentCredential.signer;
        paymentCredential = {
          type: CredentialType.KeyHash,
          hash: await paymentSigner.getPublicKeyHash(),
        };
      }
    } else {
      paymentSigner = await config.addressSource.secretManager.getSigner([
        ...DEFAULT_PAYMENT_KEY_DERIVATION_PATH,
        0,
      ]);
      paymentCredential = {
        type: CredentialType.KeyHash,
        hash: await paymentSigner.getPublicKeyHash(),
      };
    }

    let stakeSigner: ISigner | undefined = undefined;
    let stakeCredential: Credential;

    if (
      config.addressSource.type === "credentials" &&
      config.addressSource.stakeCredential
    ) {
      if (config.addressSource.stakeCredential.type === "scriptHash") {
        stakeCredential = {
          type: CredentialType.ScriptHash,
          hash: config.addressSource.stakeCredential.scriptHash,
        };
      } else {
        stakeSigner = config.addressSource.stakeCredential.signer;
        stakeCredential = {
          type: CredentialType.KeyHash,
          hash: await stakeSigner.getPublicKeyHash(),
        };
      }
    } else if (config.addressSource.type === "secretManager") {
      stakeSigner = await config.addressSource.secretManager.getSigner([
        ...DEFAULT_STAKE_KEY_DERIVATION_PATH,
        0,
      ]);
      stakeCredential = {
        type: CredentialType.KeyHash,
        hash: await stakeSigner.getPublicKeyHash(),
      };
    }

    let drepSigner: ISigner | undefined = undefined;
    let drepCredential: Credential;

    if (
      config.addressSource.type === "credentials" &&
      config.addressSource.drepCredential
    ) {
      if (config.addressSource.drepCredential.type === "scriptHash") {
        drepCredential = {
          type: CredentialType.ScriptHash,
          hash: config.addressSource.drepCredential.scriptHash,
        };
      } else {
        drepSigner = config.addressSource.drepCredential.signer;
        drepCredential = {
          type: CredentialType.KeyHash,
          hash: await drepSigner.getPublicKeyHash(),
        };
      }
    } else if (config.addressSource.type === "secretManager") {
      drepSigner = await config.addressSource.secretManager.getSigner([
        ...DEFAULT_DREP_KEY_DERIVATION_PATH,
        0,
      ]);
      drepCredential = {
        type: CredentialType.KeyHash,
        hash: await drepSigner.getPublicKeyHash(),
      };
    }

    const networkId = config.networkId;
    return new AddressManager(
      paymentCredential,
      stakeCredential,
      drepCredential,
      paymentSigner,
      networkId,
      stakeSigner,
      drepSigner
    );
  }

  private constructor(
    paymentCredential: Credential,
    stakeCredential: Credential,
    drepCredential: Credential,
    paymentSigner: ISigner,
    networkId: number,
    stakeSigner?: ISigner,
    drepSigner?: ISigner
  ) {
    setInConwayEra(true);
    this.paymentCredential = paymentCredential;
    this.stakeCredential = stakeCredential;
    this.drepCredential = drepCredential;
    this.paymentSigner = paymentSigner;
    this.stakeSigner = stakeSigner;
    this.drepSigner = drepSigner;
    this.networkId = networkId;
  }

  async getNextAddress(addressType: AddressType): Promise<CardanoAddress> {
    return new CardanoAddress(
      addressType,
      this.networkId,
      this.paymentCredential,
      this.stakeCredential
    );
  }

  async getChangeAddress(addressType: AddressType): Promise<CardanoAddress> {
    return new CardanoAddress(
      addressType,
      this.networkId,
      this.paymentCredential,
      this.stakeCredential
    );
  }

  async getRewardAccount(): Promise<CardanoAddress> {
    return new CardanoAddress(
      AddressType.Reward,
      this.networkId,
      this.paymentCredential,
      this.stakeCredential
    );
  }

  asyncGetAllUsedAddresses(): Promise<CardanoAddress[]> {
    return Promise.all([
      this.getNextAddress(AddressType.Base),
      this.getNextAddress(AddressType.Enterprise),
    ]);
  }

  //TODO: Implement getDrepId
  //async getDrepId(): Promise<string> {
  //}

  async getCredentialsSigners(
    pubkeyHashes: Set<string>
  ): Promise<Map<string, ISigner>> {
    const signersMap = new Map<string, ISigner>();

    if (
      this.paymentCredential.type === CredentialType.KeyHash &&
      pubkeyHashes.has(this.paymentCredential.hash)
    ) {
      signersMap.set(this.paymentCredential.hash, this.paymentSigner);
    }

    if (
      this.stakeCredential &&
      this.stakeCredential.type === CredentialType.KeyHash &&
      pubkeyHashes.has(this.stakeCredential.hash) &&
      this.stakeSigner
    ) {
      signersMap.set(this.stakeCredential.hash, this.stakeSigner);
    }

    if (
      this.drepCredential &&
      this.drepCredential.type === CredentialType.KeyHash &&
      pubkeyHashes.has(this.drepCredential.hash) &&
      this.drepSigner
    ) {
      signersMap.set(this.drepCredential.hash, this.drepSigner);
    }

    return signersMap;
  }
}
