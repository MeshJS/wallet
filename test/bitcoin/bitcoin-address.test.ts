import {
  deriveP2trAddress,
  deriveP2wpkhAddress,
  networkFromName,
  toXOnly,
} from "../../src/bitcoin/address/bitcoin-address";

// BIP-86 test vector (mainnet, m/86'/0'/0'/0/0):
// https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki#test-vectors
const BIP86_PUBKEY_HEX =
  "03cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
const BIP86_EXPECTED_P2TR_MAINNET =
  "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";

// BIP-84 test vector (mainnet, m/84'/0'/0'/0/0):
// https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki#test-vectors
const BIP84_PUBKEY_HEX =
  "0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c";
const BIP84_EXPECTED_P2WPKH_MAINNET =
  "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";

describe("BitcoinAddress derivation primitives", () => {
  describe("toXOnly()", () => {
    it("strips the parity byte from a 33-byte compressed pubkey", () => {
      const compressed = Buffer.from(BIP86_PUBKEY_HEX, "hex");
      expect(compressed.length).toBe(33);
      const xonly = toXOnly(compressed);
      expect(xonly.length).toBe(32);
      expect(xonly.toString("hex")).toBe(BIP86_PUBKEY_HEX.slice(2));
    });

    it("is a no-op for an already 32-byte key", () => {
      const xonly = Buffer.from(BIP86_PUBKEY_HEX.slice(2), "hex");
      expect(toXOnly(xonly).toString("hex")).toBe(xonly.toString("hex"));
    });
  });

  describe("deriveP2wpkhAddress()", () => {
    it("matches the BIP-84 mainnet test vector", () => {
      const network = networkFromName("Mainnet");
      const result = deriveP2wpkhAddress(Buffer.from(BIP84_PUBKEY_HEX, "hex"), network);
      expect(result.address).toBe(BIP84_EXPECTED_P2WPKH_MAINNET);
      expect(result.publicKey).toBe(BIP84_PUBKEY_HEX);
    });

    it("accepts Uint8Array pubkey input", () => {
      const network = networkFromName("Mainnet");
      const pubkey = new Uint8Array(Buffer.from(BIP84_PUBKEY_HEX, "hex"));
      const result = deriveP2wpkhAddress(pubkey, network);
      expect(result.address).toBe(BIP84_EXPECTED_P2WPKH_MAINNET);
    });

    it("produces testnet bech32 'tb1q' addresses on Testnet4", () => {
      const network = networkFromName("Testnet4");
      const result = deriveP2wpkhAddress(Buffer.from(BIP84_PUBKEY_HEX, "hex"), network);
      expect(result.address.startsWith("tb1q")).toBe(true);
    });
  });

  describe("deriveP2trAddress()", () => {
    it("matches the BIP-86 mainnet test vector", () => {
      const network = networkFromName("Mainnet");
      const result = deriveP2trAddress(Buffer.from(BIP86_PUBKEY_HEX, "hex"), network);
      expect(result.address).toBe(BIP86_EXPECTED_P2TR_MAINNET);
    });

    it("stores publicKey as the 32-byte x-only key (hex)", () => {
      const network = networkFromName("Mainnet");
      const result = deriveP2trAddress(Buffer.from(BIP86_PUBKEY_HEX, "hex"), network);
      expect(result.publicKey).toBe(BIP86_PUBKEY_HEX.slice(2));
      expect(result.publicKey.length).toBe(64);
    });

    it("produces testnet bech32m 'tb1p' addresses on Testnet4", () => {
      const network = networkFromName("Testnet4");
      const result = deriveP2trAddress(Buffer.from(BIP86_PUBKEY_HEX, "hex"), network);
      expect(result.address.startsWith("tb1p")).toBe(true);
    });
  });

  describe("networkFromName()", () => {
    it("returns the bitcoinjs mainnet network for 'Mainnet'", () => {
      const network = networkFromName("Mainnet");
      expect(network.bech32).toBe("bc");
    });

    it("returns the bitcoinjs testnet network for 'Testnet4'", () => {
      const network = networkFromName("Testnet4");
      expect(network.bech32).toBe("tb");
    });
  });
});
