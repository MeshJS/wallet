import {
  BitcoinAddressManager,
  paymentPath,
  ordinalsPath,
  getCoinType,
} from "../../src/bitcoin/address/bitcoin-address-manager";
import { networkFromName } from "../../src/bitcoin/address/bitcoin-address";
import { AddressPurpose, AddressType } from "../../src/bitcoin/interfaces/bitcoin-wallet";
import { bip39 } from "../../src/bitcoin/wallet/core/bitcoin-core";

const TEST_MNEMONIC = [
  "muscle", "urban", "donkey", "public", "summer", "recycle",
  "kitten", "silver", "pluck", "myth", "install", "useful",
];

const expectedTestnetP2WPKH = "tb1qq6km6823v806scer3feqx2xcyrdhgcgw7y80us";
const expectedTestnetP2TR = "tb1ptc3m295wnrt8e2sw3q3mcshqc4v9w9hfuq7eenhm5dsymj6w2xysn7vgx7";

async function makeManager(network: "Mainnet" | "Testnet4") {
  const seed = await bip39.mnemonicToSeed(TEST_MNEMONIC.join(" "), "");
  const btcNetwork = networkFromName(network);
  return BitcoinAddressManager.fromSeed(seed, btcNetwork, 0);
}

describe("BitcoinAddressManager", () => {
  describe("getCoinType()", () => {
    it("returns 0 for Mainnet (bech32 hrp = 'bc')", () => {
      const network = networkFromName("Mainnet");
      expect(getCoinType(network)).toBe(0);
    });

    it("returns 1 for Testnet4 (bech32 hrp = 'tb')", () => {
      const network = networkFromName("Testnet4");
      expect(getCoinType(network)).toBe(1);
    });
  });

  describe("derivation paths", () => {
    it("paymentPath uses BIP-84 with correct coinType for Mainnet", () => {
      const network = networkFromName("Mainnet");
      expect(paymentPath(network, 0, 0, 0)).toBe("m/84'/0'/0'/0/0");
      expect(paymentPath(network, 1, 0, 5)).toBe("m/84'/0'/1'/0/5");
    });

    it("paymentPath uses BIP-84 with correct coinType for Testnet4", () => {
      const network = networkFromName("Testnet4");
      expect(paymentPath(network, 0, 0, 0)).toBe("m/84'/1'/0'/0/0");
    });

    it("ordinalsPath uses BIP-86 with correct coinType for Mainnet", () => {
      const network = networkFromName("Mainnet");
      expect(ordinalsPath(network, 0, 0, 0)).toBe("m/86'/0'/0'/0/0");
    });

    it("ordinalsPath uses BIP-86 with correct coinType for Testnet4", () => {
      const network = networkFromName("Testnet4");
      expect(ordinalsPath(network, 0, 0, 0)).toBe("m/86'/1'/0'/0/0");
    });
  });

  describe("getAddress()", () => {
    it("derives the canonical BIP-84 P2WPKH address on testnet", async () => {
      const manager = await makeManager("Testnet4");
      const addr = manager.getAddress(AddressPurpose.Payment);
      expect(addr.address).toBe(expectedTestnetP2WPKH);
      expect(addr.addressType).toBe(AddressType.p2wpkh);
      expect(addr.purpose).toBe(AddressPurpose.Payment);
      expect(addr.derivationPath).toBe("m/84'/1'/0'/0/0");
    });

    it("derives the canonical BIP-86 P2TR address on testnet", async () => {
      const manager = await makeManager("Testnet4");
      const addr = manager.getAddress(AddressPurpose.Ordinals);
      expect(addr.address).toBe(expectedTestnetP2TR);
      expect(addr.addressType).toBe(AddressType.p2tr);
      expect(addr.purpose).toBe(AddressPurpose.Ordinals);
      expect(addr.derivationPath).toBe("m/86'/1'/0'/0/0");
    });

    it("derives mainnet bech32 addresses starting with 'bc1'", async () => {
      const manager = await makeManager("Mainnet");
      const payment = manager.getAddress(AddressPurpose.Payment);
      const ordinals = manager.getAddress(AddressPurpose.Ordinals);
      expect(payment.address.startsWith("bc1q")).toBe(true);
      expect(ordinals.address.startsWith("bc1p")).toBe(true);
    });

    it("derived publicKey for payment is 33-byte compressed (66 hex chars)", async () => {
      const manager = await makeManager("Testnet4");
      const addr = manager.getAddress(AddressPurpose.Payment);
      expect(addr.publicKey.length).toBe(66);
    });

    it("derived publicKey for ordinals is 32-byte x-only (64 hex chars)", async () => {
      const manager = await makeManager("Testnet4");
      const addr = manager.getAddress(AddressPurpose.Ordinals);
      expect(addr.publicKey.length).toBe(64);
    });

    it("throws for unsupported purpose (stacks/starknet/spark)", async () => {
      const manager = await makeManager("Testnet4");
      expect(() => manager.getAddress(AddressPurpose.Stacks)).toThrow(/Unsupported/);
    });

    it("derives different addresses at different indexes", async () => {
      const manager = await makeManager("Testnet4");
      const a = manager.getAddress(AddressPurpose.Payment, 0, 0);
      const b = manager.getAddress(AddressPurpose.Payment, 0, 1);
      expect(a.address).not.toBe(b.address);
    });
  });

  describe("getAddresses()", () => {
    it("defaults to [Payment, Ordinals] when called with empty array", async () => {
      const manager = await makeManager("Testnet4");
      const addrs = manager.getAddresses([]);
      expect(addrs).toHaveLength(2);
      expect(addrs[0]!.purpose).toBe(AddressPurpose.Payment);
      expect(addrs[1]!.purpose).toBe(AddressPurpose.Ordinals);
    });

    it("returns only the requested purposes", async () => {
      const manager = await makeManager("Testnet4");
      const addrs = manager.getAddresses([AddressPurpose.Ordinals]);
      expect(addrs).toHaveLength(1);
      expect(addrs[0]!.purpose).toBe(AddressPurpose.Ordinals);
    });

    it("skips unsupported purposes silently", async () => {
      const manager = await makeManager("Testnet4");
      const addrs = manager.getAddresses([
        AddressPurpose.Payment,
        AddressPurpose.Stacks,
        AddressPurpose.Starknet,
      ]);
      expect(addrs).toHaveLength(1);
      expect(addrs[0]!.purpose).toBe(AddressPurpose.Payment);
    });
  });

  describe("getChild()", () => {
    it("returns a BIP-32 child node for payment purpose", async () => {
      const manager = await makeManager("Testnet4");
      const child = manager.getChild(AddressPurpose.Payment);
      expect(child.privateKey).toBeDefined();
      expect(child.publicKey).toBeDefined();
    });

    it("returns a BIP-32 child node for ordinals purpose", async () => {
      const manager = await makeManager("Testnet4");
      const child = manager.getChild(AddressPurpose.Ordinals);
      expect(child.privateKey).toBeDefined();
      expect(child.publicKey).toBeDefined();
    });
  });

  describe("read-only mode (no root)", () => {
    it("throws when calling getAddress without a root", () => {
      const network = networkFromName("Testnet4");
      const manager = new BitcoinAddressManager({ network });
      expect(() => manager.getAddress(AddressPurpose.Payment)).toThrow(/root/);
    });
  });
});
