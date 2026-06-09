import type { BIP32Interface } from "bip32";
import type { Network } from "bitcoinjs-lib";
import bs58check from "bs58check";

import { AddressPurpose, AddressType } from "../interfaces/bitcoin-wallet";
import { bip32 } from "../wallet/core/bitcoin-core";
import {
  DerivedBitcoinAddress,
  deriveP2trAddress,
  deriveP2wpkhAddress,
} from "./bitcoin-address";

/**
 * Standard BIP derivation paths used by the Mesh Bitcoin wallet:
 *   - BIP-84 native SegWit (P2WPKH) for the `payment` purpose
 *   - BIP-86 single-key Taproot (P2TR) for the `ordinals` purpose
 *
 * `coinType` is 0 for mainnet, 1 for any testnet (including Testnet4).
 */
export function getCoinType(network: Network): 0 | 1 {
  return network.bech32 === "bc" ? 0 : 1;
}

export function paymentPath(
  network: Network,
  account = 0,
  change = 0,
  index = 0,
): string {
  return `m/84'/${getCoinType(network)}'/${account}'/${change}/${index}`;
}

export function ordinalsPath(
  network: Network,
  account = 0,
  change = 0,
  index = 0,
): string {
  return `m/86'/${getCoinType(network)}'/${account}'/${change}/${index}`;
}

export interface BitcoinAddressManagerConfig {
  network: Network;
  /**
   * BIP-32 root node (seed-derived). The manager owns derivation from this root.
   * Optional when the manager is used in read-only mode (no key material available).
   */
  root?: BIP32Interface;
  /**
   * Account index for hardened account derivation (defaults to 0).
   */
  account?: number;
}

/**
 * Centralises address derivation for the Bitcoin wallet across purposes.
 * Mirrors the role of Cardano's `AddressManager` — single source of truth for
 * which addresses correspond to which purposes.
 */
export class BitcoinAddressManager {
  private readonly network: Network;
  private readonly root?: BIP32Interface;
  private readonly account: number;

  constructor(config: BitcoinAddressManagerConfig) {
    this.network = config.network;
    this.root = config.root;
    this.account = config.account ?? 0;
  }

  static fromSeed(
    seed: Buffer,
    network: Network,
    account = 0,
  ): BitcoinAddressManager {
    const root = bip32.fromSeed(seed, network);
    return new BitcoinAddressManager({ network, root, account });
  }

  getNetwork(): Network {
    return this.network;
  }

  private requireRoot(): BIP32Interface {
    if (!this.root) {
      throw new Error("[BitcoinAddressManager] No BIP-32 root configured");
    }
    return this.root;
  }

  /**
   * Get the address for a single purpose, deriving fresh from the root.
   */
  getAddress(
    purpose: AddressPurpose,
    change = 0,
    index = 0,
  ): DerivedBitcoinAddress {
    if (purpose === AddressPurpose.Payment) {
      const path = paymentPath(this.network, this.account, change, index);
      const child = this.requireRoot().derivePath(path);
      const { address, publicKey } = deriveP2wpkhAddress(
        child.publicKey,
        this.network,
      );
      return new DerivedBitcoinAddress({
        address,
        publicKey,
        purpose,
        addressType: AddressType.p2wpkh,
        derivationPath: path,
        change,
        index,
      });
    }

    if (purpose === AddressPurpose.Ordinals) {
      const path = ordinalsPath(this.network, this.account, change, index);
      const child = this.requireRoot().derivePath(path);
      const { address, publicKey } = deriveP2trAddress(
        child.publicKey,
        this.network,
      );
      return new DerivedBitcoinAddress({
        address,
        publicKey,
        purpose,
        addressType: AddressType.p2tr,
        derivationPath: path,
        change,
        index,
      });
    }

    throw new Error(
      `[BitcoinAddressManager] Unsupported address purpose: ${purpose}`,
    );
  }

  /**
   * Get addresses for an array of purposes (default: payment + ordinals).
   * Skips unsupported purposes silently to remain forward-compatible with
   * non-Bitcoin Sats Connect purposes (`stacks`, `starknet`, `spark`).
   */
  getAddresses(purposes?: AddressPurpose[]): DerivedBitcoinAddress[] {
    const list =
      purposes && purposes.length > 0
        ? purposes
        : [AddressPurpose.Payment, AddressPurpose.Ordinals];

    const out: DerivedBitcoinAddress[] = [];
    for (const purpose of list) {
      if (
        purpose !== AddressPurpose.Payment &&
        purpose !== AddressPurpose.Ordinals
      ) {
        continue;
      }
      out.push(this.getAddress(purpose));
    }
    return out;
  }

  /**
   * Get the BIP-32 child node for a purpose — needed for signing.
   */
  getChild(purpose: AddressPurpose, change = 0, index = 0): BIP32Interface {
    const path =
      purpose === AddressPurpose.Payment
        ? paymentPath(this.network, this.account, change, index)
        : purpose === AddressPurpose.Ordinals
          ? ordinalsPath(this.network, this.account, change, index)
          : null;
    if (!path) {
      throw new Error(
        `[BitcoinAddressManager] Unsupported address purpose: ${purpose}`,
      );
    }
    return this.requireRoot().derivePath(path);
  }

  // ---------------------------------------------------------------------------
  // Address scanning
  // ---------------------------------------------------------------------------

  /**
   * Derive a contiguous range of addresses for a single purpose/change level.
   * Useful for gap-limit scanning: call with `start=0, count=20` to get the
   * first gap-limit window (BIP-84 / BIP-86), then advance `start` if any are used.
   *
   * @param purpose  Payment (BIP-84 P2WPKH) or Ordinals (BIP-86 P2TR).
   * @param start    First index in the range (default 0).
   * @param count    How many addresses to derive (default 20).
   * @param change   Change chain: 0 = external/receive, 1 = internal/change.
   */
  getAddressesByPurpose(
    purpose: AddressPurpose,
    start = 0,
    count = 20,
    change = 0,
  ): DerivedBitcoinAddress[] {
    if (count <= 0) return [];
    return Array.from({ length: count }, (_, i) =>
      this.getAddress(purpose, change, start + i),
    );
  }

  /**
   * Scan the derivation path for `address` up to `maxGap` indices, returning
   * the matching `DerivedBitcoinAddress` (with correct `change` and `index`)
   * or `undefined` if not found. Checks both the external (0) and internal (1)
   * change chains.
   *
   * BIP-32 recommends a gap limit of 20; use a higher value if you know the
   * wallet has been used extensively.
   */
  findAddress(
    address: string,
    purpose: AddressPurpose,
    maxGap = 20,
  ): DerivedBitcoinAddress | undefined {
    for (const change of [0, 1]) {
      for (let index = 0; index < maxGap; index++) {
        const derived = this.getAddress(purpose, change, index);
        if (derived.address === address) return derived;
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Account-level xpub / zpub export
  // ---------------------------------------------------------------------------

  /**
   * Return the BIP-32 account node (hardened, public-key-only) for the given
   * purpose. This is the xpub you would share with a watch-only wallet.
   *
   * BIP-84:  m/84'/coin_type'/account'
   * BIP-86:  m/86'/coin_type'/account'
   */
  private getAccountNode(purpose: AddressPurpose): BIP32Interface {
    if (
      purpose !== AddressPurpose.Payment &&
      purpose !== AddressPurpose.Ordinals
    ) {
      throw new Error(
        `[BitcoinAddressManager] getAccountNode: unsupported purpose "${purpose}". ` +
          `Use AddressPurpose.Payment (BIP-84) or AddressPurpose.Ordinals (BIP-86).`,
      );
    }
    const coinType = getCoinType(this.network);
    const path =
      purpose === AddressPurpose.Payment
        ? `m/84'/${coinType}'/${this.account}'`
        : `m/86'/${coinType}'/${this.account}'`;
    return this.requireRoot().derivePath(path).neutered();
  }

  /**
   * Export the BIP-84 (P2WPKH) account public key as a standard base58 xpub
   * (mainnet) or tpub (testnet).
   *
   * Example: `xpub6CQdKacu...`
   */
  getAccountXpub(): string {
    return this.getAccountNode(AddressPurpose.Payment).toBase58();
  }

  /**
   * Export the BIP-86 (P2TR / Taproot) account public key as a standard
   * base58 xpub (mainnet) or tpub (testnet).
   *
   * Example: `xpub6D5r3aJk...`
   */
  getTaprootXpub(): string {
    return this.getAccountNode(AddressPurpose.Ordinals).toBase58();
  }

  /**
   * Export the BIP-84 account public key with the **zpub** (mainnet) or
   * **vpub** (testnet) version prefix, as expected by wallet software that
   * distinguishes BIP-84 SegWit accounts from BIP-44/49 accounts by the
   * key prefix rather than the derivation path.
   *
   * Conversion: decode the xpub/tpub base58check bytes, replace the first
   * 4 version bytes, and re-encode. The 74 payload bytes are unchanged.
   */
  getAccountZpub(): string {
    const xpub = this.getAccountXpub();
    const payload = Buffer.from(bs58check.decode(xpub));

    // Version bytes:  xpub 0488b21e → zpub 04b24746
    //                 tpub 043587cf → vpub 045f1cf6
    const isMainnet = this.network.bech32 === "bc";
    const zpubVersion = isMainnet
      ? Buffer.from([0x04, 0xb2, 0x47, 0x46])
      : Buffer.from([0x04, 0x5f, 0x1c, 0xf6]);

    zpubVersion.copy(payload, 0);
    return bs58check.encode(payload);
  }
}
