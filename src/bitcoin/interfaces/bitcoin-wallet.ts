export enum AddressPurpose {
  Ordinals = "ordinals",
  Payment = "payment",
  Stacks = "stacks",
  Starknet = "starknet",
  Spark = "spark",
}

export enum AddressType {
  p2pkh = "p2pkh",
  p2sh = "p2sh",
  p2wpkh = "p2wpkh",
  p2wsh = "p2wsh",
  p2tr = "p2tr",
  stacks = "stacks",
  starknet = "starknet",
  spark = "spark",
}

export type BitcoinAddress = {
  address: string;
  publicKey: string;
  purpose: AddressPurpose;
  addressType: AddressType;
  walletType: "software" | "ledger" | "keystone";
};

export type BitcoinAccount = {
  walletType: "software" | "ledger" | "keystone";
  address: string;
  publicKey: string;
  purpose: AddressPurpose;
  addressType: AddressType;
};

export type BitcoinBalance = {
  confirmed: string;
  unconfirmed: string;
  total: string;
};

export enum MessageSigningProtocols {
  ECDSA = "ECDSA",
  BIP322 = "BIP322",
}

export type BitcoinSignature = {
  signature: string;
  messageHash: string;
  address: string;
  protocol: MessageSigningProtocols;
};

export interface IBitcoinWallet {
  getNetwork(): Promise<"Mainnet" | "Testnet4">;
  getAddresses(addressPurposes: AddressPurpose[]): Promise<BitcoinAddress[]>;
  getAccounts(addressPurposes: AddressPurpose[]): Promise<BitcoinAccount[]>;
  getBalance(): Promise<BitcoinBalance>;
  signMessage(
    address: string,
    message: string,
    protocol?: MessageSigningProtocols,
  ): Promise<BitcoinSignature>;
  signTransfer(
    recipients: {
      address: string;
      amount: number;
    }[],
  ): Promise<string>;
  signPsbt(signConfig: {
    psbt: string;
    signInputs?:
      | {
          [x: string]: number[];
        }
      | undefined;
    broadcast?: boolean | undefined;
  }): Promise<string>;
}
