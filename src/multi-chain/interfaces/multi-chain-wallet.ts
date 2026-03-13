import { IBitcoinWallet } from "../../bitcoin/interfaces/bitcoin-wallet";
import { ICardanoWallet } from "../../cardano/interfaces/cardano-wallet";

export interface IMultiChainWallet {
  cardanoWallet: ICardanoWallet;
  bitcoinWallet: IBitcoinWallet;
}
