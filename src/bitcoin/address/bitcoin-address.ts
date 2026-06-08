import type { Network } from "bitcoinjs-lib";

import {
  AddressPurpose,
  AddressType,
  BitcoinAccount,
  BitcoinAddress as BitcoinAddressInfo,
} from "../interfaces/bitcoin-wallet";
import { bitcoin } from "../wallet/core/bitcoin-core";

export type BitcoinNetworkName = "Mainnet" | "Testnet4";

/**
 * Map a friendly network name to a bitcoinjs `Network` object.
 *
 * NOTE: bitcoinjs-lib does not currently ship a dedicated Testnet4 network object.
 * Testnet4 and Testnet3 use identical address encoding (`tb` bech32/bech32m, same
 * version/HRP/script-hash formats), so reusing `bitcoin.networks.testnet` is safe
 * for address derivation and PSBT construction. Chain state differs, but that is
 * the provider's responsibility, not the encoder's.
 */
export function networkFromName(name: BitcoinNetworkName): Network {
  return name === "Mainnet"
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;
}

/**
 * Drop the parity prefix byte of a compressed secp256k1 pubkey (33 bytes -> 32 bytes).
 * Required for Taproot (BIP-340) which uses x-only public keys. Returns a copy so
 * callers cannot accidentally mutate the source buffer.
 */
export function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.length === 32
    ? Buffer.from(pubkey)
    : Buffer.from(pubkey.subarray(1, 33));
}

/**
 * Derive the P2WPKH (native SegWit) payment address from a compressed public key.
 */
export function deriveP2wpkhAddress(
  publicKey: Buffer | Uint8Array,
  network: Network,
): { address: string; publicKey: string } {
  const pubkey = Buffer.isBuffer(publicKey)
    ? publicKey
    : Buffer.from(publicKey);
  const payment = bitcoin.payments.p2wpkh({ pubkey, network });
  if (!payment.address) {
    throw new Error("[BitcoinAddress] Failed to derive P2WPKH address");
  }
  return {
    address: payment.address,
    publicKey: pubkey.toString("hex"),
  };
}

/**
 * Derive the P2TR (Taproot, ordinals) address from a compressed public key.
 * Uses the BIP-86 single-key spend path (no script tree).
 */
export function deriveP2trAddress(
  publicKey: Buffer | Uint8Array,
  network: Network,
): { address: string; publicKey: string } {
  const pubkey = Buffer.isBuffer(publicKey)
    ? publicKey
    : Buffer.from(publicKey);
  const internalPubkey = toXOnly(pubkey);
  const payment = bitcoin.payments.p2tr({ internalPubkey, network });
  if (!payment.address) {
    throw new Error("[BitcoinAddress] Failed to derive P2TR address");
  }
  return {
    address: payment.address,
    publicKey: internalPubkey.toString("hex"),
  };
}

/**
 * Internal derived-address record. Holds the public-facing fields plus the
 * derivation path so the manager can request signing from the right child node.
 * Public wallet methods convert this to plain `BitcoinAddress` / `BitcoinAccount`
 * shapes defined on `IBitcoinWallet`.
 */
export class DerivedBitcoinAddress {
  readonly address: string;
  readonly publicKey: string;
  readonly purpose: AddressPurpose;
  readonly addressType: AddressType;
  readonly walletType: "software" | "ledger" | "keystone";
  readonly derivationPath: string;
  readonly change: number;
  readonly index: number;

  constructor(args: {
    address: string;
    publicKey: string;
    purpose: AddressPurpose;
    addressType: AddressType;
    walletType?: "software" | "ledger" | "keystone";
    derivationPath: string;
    change: number;
    index: number;
  }) {
    this.address = args.address;
    this.publicKey = args.publicKey;
    this.purpose = args.purpose;
    this.addressType = args.addressType;
    this.walletType = args.walletType ?? "software";
    this.derivationPath = args.derivationPath;
    this.change = args.change;
    this.index = args.index;
  }

  toBitcoinAddress(): BitcoinAddressInfo {
    return {
      address: this.address,
      publicKey: this.publicKey,
      purpose: this.purpose,
      addressType: this.addressType,
      walletType: this.walletType,
    };
  }

  toBitcoinAccount(): BitcoinAccount {
    return {
      walletType: this.walletType,
      address: this.address,
      publicKey: this.publicKey,
      purpose: this.purpose,
      addressType: this.addressType,
    };
  }
}
