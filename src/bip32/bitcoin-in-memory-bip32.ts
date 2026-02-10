import * as bip32 from "bip32";
import * as ecc from 'tiny-secp256k1';
import { mnemonicToSeed } from "bip39";

import {
  DerivationPath,
  derivationPathVectorFromString,
  derivationPathStringFromVector,
} from "../interfaces/secret-manager";

export class BitcoinInMemoryBip32 {
  private root: bip32.BIP32Interface;

  private constructor(root: bip32.BIP32Interface) {
    this.root = root;
  }

  static async fromMnemonic(
    mnemonic: string[],
    password?: string,
  ): Promise<BitcoinInMemoryBip32> {
    const seed = await mnemonicToSeed(mnemonic.join(" "), password || "");
    const root = bip32.BIP32Factory(ecc).fromSeed(seed);
    return new BitcoinInMemoryBip32(root);
  }

  /**
   * Get the private key (hex) for the provided derivation path.
   */
  getPrivateKey(derivationPath: DerivationPath): string {
    const path: string = Array.isArray(derivationPath)
      ? `m/${derivationPathStringFromVector(derivationPath)}`
      : derivationPath;

    const child = this.root.derivePath(path);
    if (!child?.privateKey) throw new Error("No private key at path");
    return Buffer.from(child.privateKey).toString("hex");
  }

  /**
   * Get the public key (hex) for the provided derivation path.
   */
  getPublicKey(derivationPath: DerivationPath): string {
    const path: string = Array.isArray(derivationPath)
      ? `m/${derivationPathStringFromVector(derivationPath)}`
      : derivationPath;
    const child = this.root.derivePath(path);
    return Buffer.from(child.publicKey).toString("hex");
  }
}
