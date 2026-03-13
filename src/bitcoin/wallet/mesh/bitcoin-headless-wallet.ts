import { AddressPurpose, BitcoinAccount, BitcoinAddress, BitcoinBalance, BitcoinSignature, IBitcoinWallet, MessageSigningProtocols } from "../../interfaces/bitcoin-wallet";

export interface BitcoinHeadlessWalletConfig {
  // Configuration options for the headless wallet can be added here
}

export class BitcoinHeadlessWallet implements IBitcoinWallet {
  constructor() {
    // Implementation for headless Bitcoin wallet
  }
  getNetwork(): Promise<"Mainnet" | "Testnet4"> {
    throw new Error("Method not implemented.");
  }
  getAddresses(addressPurposes: AddressPurpose[]): Promise<BitcoinAddress[]> {
    throw new Error("Method not implemented.");
  }
  getAccounts(addressPurposes: AddressPurpose[]): Promise<BitcoinAccount[]> {
    throw new Error("Method not implemented.");
  }
  getBalance(): Promise<BitcoinBalance> {
    throw new Error("Method not implemented.");
  }
  signMessage(address: string, message: string, protocol?: MessageSigningProtocols): Promise<BitcoinSignature> {
    throw new Error("Method not implemented.");
  }
  signTransfer(recipients: { address: string; amount: number; }[]): Promise<string> {
    throw new Error("Method not implemented.");
  }
  signPsbt(signConfig: { psbt: string; signInputs?: { [x: string]: number[]; } | undefined; broadcast?: boolean | undefined; }): Promise<string> {
    throw new Error("Method not implemented.");
  }
}
