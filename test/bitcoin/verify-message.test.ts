import {
  BitcoinHeadlessWallet,
  verifyBitcoinMessage,
} from "../../src/bitcoin/wallet/mesh/bitcoin-headless-wallet";
import { bitcoin } from "../../src/bitcoin/wallet/core/bitcoin-core";

const TEST_MNEMONIC = [
  "muscle", "urban", "donkey", "public", "summer", "recycle",
  "kitten", "silver", "pluck", "myth", "install", "useful",
];

const TESTNET_P2WPKH = "tb1qq6km6823v806scer3feqx2xcyrdhgcgw7y80us";
const TESTNET_P2TR = "tb1ptc3m295wnrt8e2sw3q3mcshqc4v9w9hfuq7eenhm5dsymj6w2xysn7vgx7";

async function makeWallet() {
  return BitcoinHeadlessWallet.fromMnemonic({
    network: "Testnet4",
    mnemonic: TEST_MNEMONIC,
  });
}

describe("verifyBitcoinMessage / BitcoinHeadlessWallet.verifyMessage", () => {
  describe("roundtrip", () => {
    it("instance verifyMessage returns true for a sig produced by signMessage", async () => {
      const wallet = await makeWallet();
      const { signature } = await wallet.signMessage(TESTNET_P2WPKH, "hello world");
      const ok = await wallet.verifyMessage(TESTNET_P2WPKH, "hello world", signature);
      expect(ok).toBe(true);
    });

    it("free function returns valid:true with recoveredPublicKey hex", async () => {
      const wallet = await makeWallet();
      const { signature } = await wallet.signMessage(TESTNET_P2WPKH, "hello world");
      const result = verifyBitcoinMessage(
        TESTNET_P2WPKH,
        "hello world",
        signature,
        bitcoin.networks.testnet,
      );
      expect(result.valid).toBe(true);
      expect(result.recoveredPublicKey).toMatch(/^[0-9a-f]{66}$/);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("rejection paths", () => {
    it("returns false for a tampered message", async () => {
      const wallet = await makeWallet();
      const { signature } = await wallet.signMessage(TESTNET_P2WPKH, "hello world");
      const ok = await wallet.verifyMessage(TESTNET_P2WPKH, "hello WORLD", signature);
      expect(ok).toBe(false);
    });

    it("returns false when verifying against an unrelated address", async () => {
      const wallet = await makeWallet();
      const { signature } = await wallet.signMessage(TESTNET_P2WPKH, "hello");
      // Valid testnet P2WPKH address from a different key — fixed string from bitcoinjs-lib test vectors.
      const unrelated = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
      const ok = await wallet.verifyMessage(unrelated, "hello", signature);
      expect(ok).toBe(false);
    });

    it("free function flags malformed signatures with a reason", () => {
      const result = verifyBitcoinMessage(
        TESTNET_P2WPKH,
        "hello",
        Buffer.from("too-short").toString("base64"),
        bitcoin.networks.testnet,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/65 bytes/);
    });

    it("free function flags non-base64 signature input", () => {
      const result = verifyBitcoinMessage(
        TESTNET_P2WPKH,
        "hello",
        "not-a-real-signature!!",
        bitcoin.networks.testnet,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("free function flags out-of-range header byte", () => {
      // Build a 65-byte buffer with header=0 (outside 27..42).
      const bogus = Buffer.alloc(65, 0);
      const result = verifyBitcoinMessage(
        TESTNET_P2WPKH,
        "hello",
        bogus.toString("base64"),
        bitcoin.networks.testnet,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/header byte/);
    });
  });

  describe("cross-type acceptance", () => {
    it("accepts the same signature against the P2TR address derived from the same payment pubkey path", async () => {
      // signMessage only manages addresses the wallet knows about — Payment (P2WPKH) and Ordinals (P2TR)
      // share the wallet's seed but live on different BIP paths and therefore different pubkeys.
      // The cross-type check that's meaningful here: a single recovered pubkey must verify against
      // any of *its own* standard address forms. We sign with the P2WPKH key and verify against the
      // legacy P2PKH address derived from the same recovered pubkey.
      const wallet = await makeWallet();
      const { signature } = await wallet.signMessage(TESTNET_P2WPKH, "cross-type");

      // Re-derive the same pubkey from the signature, build its P2PKH form, verify.
      const decoded = Buffer.from(signature, "base64");
      const header = decoded[0]!;
      const recoveryId = ((header - 27) & 3) as 0 | 1;
      const rawSig = decoded.subarray(1);
      const { ecc } = await import("../../src/bitcoin/wallet/core/bitcoin-core");
      const hash = bitcoin.crypto.hash256(
        Buffer.concat([
          Buffer.from([0x18]),
          Buffer.from("Bitcoin Signed Message:\n", "utf8"),
          Buffer.from([10]),
          Buffer.from("cross-type", "utf8"),
        ]),
      );
      const recovered = ecc.recover(hash, rawSig, recoveryId, true)!;
      const p2pkh = bitcoin.payments.p2pkh({
        pubkey: Buffer.from(recovered),
        network: bitcoin.networks.testnet,
      }).address!;

      const result = verifyBitcoinMessage(
        p2pkh,
        "cross-type",
        signature,
        bitcoin.networks.testnet,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects a P2TR address derived from a different pubkey (different BIP path)", async () => {
      // The wallet's P2TR address uses a different derivation path (BIP-86) than the P2WPKH (BIP-84).
      // signing as P2WPKH should NOT verify against the wallet's P2TR address because the pubkey differs.
      const wallet = await makeWallet();
      const { signature } = await wallet.signMessage(TESTNET_P2WPKH, "different paths");
      const ok = await wallet.verifyMessage(TESTNET_P2TR, "different paths", signature);
      expect(ok).toBe(false);
    });
  });
});
