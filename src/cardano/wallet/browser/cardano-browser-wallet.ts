import { DataSignature } from "@meshsdk/common";
import { ICardanoWallet } from "../../interfaces/cardano-wallet";

type Wallet = {
  id: string;
  name: string;
  icon: string;
  version: string;
};

export type Cardano = {
  [key: string]: {
    name: string;
    icon: string;
    apiVersion: string;
    enable: (extensions?: {
      extensions: { cip: number }[];
    }) => Promise<ICardanoWallet>;
    supportedExtensions?: { cip: number }[];
  };
};

type Extension = {
  cip: number;
};

export class CardanoBrowserWallet implements ICardanoWallet {
  walletInstance: ICardanoWallet;

  constructor(walletInstance: ICardanoWallet) {
    this.walletInstance = walletInstance;
  }
  async getNetworkId(): Promise<number> {
    return this.walletInstance.getNetworkId();
  }
  async getUtxos(): Promise<string[]> {
    return this.walletInstance.getUtxos();
  }
  async getCollateral(): Promise<string[]> {
    return this.walletInstance.getCollateral();
  }
  async getBalance(): Promise<string> {
    return this.walletInstance.getBalance();
  }
  async getUsedAddresses(): Promise<string[]> {
    return this.walletInstance.getUsedAddresses();
  }
  async getUnusedAddresses(): Promise<string[]> {
    return this.walletInstance.getUnusedAddresses();
  }
  async getRewardAddresses(): Promise<string[]> {
    return this.walletInstance.getRewardAddresses();
  }
  async getChangeAddress(): Promise<string> {
    return this.walletInstance.getChangeAddress();
  }
  async signTx(data: string, partialSign: boolean): Promise<string> {
    return this.walletInstance.signTx(data, partialSign);
  }
  async signData(addressBech32: string, data: string): Promise<DataSignature> {
    return this.walletInstance.signData(addressBech32, data);
  }
  async submitTx(tx: string): Promise<string> {
    return this.walletInstance.submitTx(tx);
  }

  /**
   * Returns a list of wallets installed on user's device. Each wallet is an object with the following properties:
   * - A name is provided to display wallet's name on the user interface.
   * - A version is provided to display wallet's version on the user interface.
   * - An icon is provided to display wallet's icon on the user interface.
   *
   * @returns a list of wallet names
   */
  static getInstalledWallets(): Wallet[] {
    if (globalThis === undefined) return [];
    if (globalThis.cardano === undefined) return [];

    let wallets: Wallet[] = [];
    for (const key in globalThis.cardano) {
      try {
        const _wallet = globalThis.cardano[key];
        if (_wallet === undefined) continue;
        if (_wallet.name === undefined) continue;
        if (_wallet.icon === undefined) continue;
        if (_wallet.apiVersion === undefined) continue;
        wallets.push({
          id: key,
          name: key == "nufiSnap" ? "MetaMask" : _wallet.name,
          icon: _wallet.icon,
          version: _wallet.apiVersion,
        });
      } catch (e) {}
    }

    return wallets;
  }

  /**
   * This is the entrypoint to start communication with the user's wallet. The wallet should request the user's permission to connect the web page to the user's wallet, and if permission has been granted, the wallet will be returned and exposing the full API for the app to use.
   *
   * Query BrowserWallet.getInstalledWallets() to get a list of available wallets, then provide the wallet name for which wallet the user would like to connect with.
   *
   * @param walletName - the name of the wallet to enable (e.g. "eternl", "begin")
   * @param extensions - optional, a list of CIPs that the wallet should support
   * @returns WalletInstance
   */
  static async enable(
    walletName: string,
    extensions: Extension[] = []
  ): Promise<ICardanoWallet> {
    try {
      const walletInstance =
        extensions.length > 0
          ? await globalThis.cardano[walletName].enable({
              extensions: extensions,
            })
          : await globalThis.cardano[walletName].enable();

      if (walletInstance !== undefined)
        return new CardanoBrowserWallet(walletInstance);

      throw new Error(`Couldn't create an instance of wallet: ${walletName}`);
    } catch (error) {
      throw new Error(
        `[BrowserWallet] An error occurred during enable: ${JSON.stringify(
          error
        )}.`
      );
    }
  }
}
