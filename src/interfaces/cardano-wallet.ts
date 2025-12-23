import { DataSignature } from "@meshsdk/common";

export interface ICardanoWallet {
  getNetworkId(): Promise<number>;
  getUtxos(): Promise<string[]>;
  getCollateral(): Promise<string[]>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getRewardAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  signTx(data: string, partialSign: boolean): Promise<string>;
  signData(addressHex: string, data: string): Promise<DataSignature>;
  submitTx(tx: string): Promise<string>;
}
