import type { BIP32Interface } from "bip32";
import type { Network } from "bitcoinjs-lib";

import {
  AddressPurpose,
  AddressType,
} from "../interfaces/bitcoin-wallet";
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
  // bitcoinjs-lib doesn't expose a clean network-id check; use the bech32 hrp.
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

  static fromSeed(seed: Buffer, network: Network, account = 0): BitcoinAddressManager {
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
  getAddress(purpose: AddressPurpose, change = 0, index = 0): DerivedBitcoinAddress {
    if (purpose === AddressPurpose.Payment) {
      const path = paymentPath(this.network, this.account, change, index);
      const child = this.requireRoot().derivePath(path);
      const { address, publicKey } = deriveP2wpkhAddress(child.publicKey, this.network);
      return new DerivedBitcoinAddress({
        address,
        publicKey,
        purpose,
        addressType: AddressType.p2wpkh,
        derivationPath: path,
      });
    }

    if (purpose === AddressPurpose.Ordinals) {
      const path = ordinalsPath(this.network, this.account, change, index);
      const child = this.requireRoot().derivePath(path);
      const { address, publicKey } = deriveP2trAddress(child.publicKey, this.network);
      return new DerivedBitcoinAddress({
        address,
        publicKey,
        purpose,
        addressType: AddressType.p2tr,
        derivationPath: path,
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
    const list = purposes && purposes.length > 0
      ? purposes
      : [AddressPurpose.Payment, AddressPurpose.Ordinals];

    const out: DerivedBitcoinAddress[] = [];
    for (const purpose of list) {
      if (purpose !== AddressPurpose.Payment && purpose !== AddressPurpose.Ordinals) {
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
    const path = purpose === AddressPurpose.Payment
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
}
