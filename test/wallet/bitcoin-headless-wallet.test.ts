import { createHash } from "crypto";
import { bech32, bech32m } from "@scure/base";
import * as ecc from "tiny-secp256k1";

import { BitcoinInMemoryBip32 } from "../../src";

const hash160 = (hexPubkey: string): Buffer => {
  const pubkey = Buffer.from(hexPubkey, "hex");
  const sha = createHash("sha256").update(pubkey).digest();
  return createHash("ripemd160").update(sha).digest();
};

const taggedHash = (tag: string, data: Buffer): Buffer => {
  const tagHash = createHash("sha256").update(tag).digest();
  return createHash("sha256")
    .update(Buffer.concat([tagHash, tagHash, data]))
    .digest();
};

describe("Bitcoin Headless Wallet", () => {
  let bip32: BitcoinInMemoryBip32;

  beforeAll(async () => {
    bip32 = await BitcoinInMemoryBip32.fromMnemonic([
      "muscle",
      "urban",
      "donkey",
      "public",
      "summer",
      "recycle",
      "kitten",
      "silver",
      "pluck",
      "myth",
      "install",
      "useful",
    ]);
  });

  it("should derive a v0 segwit address", () => {

    const pubkeyHex = bip32.getPublicKey("m/84'/1'/0'/0/0");
    const pubkeyHash = hash160(pubkeyHex);
    const words = bech32.toWords(pubkeyHash);
    const address = bech32.encode("tb", [0, ...words]);

    expect(address).toBe("tb1qq6km6823v806scer3feqx2xcyrdhgcgw7y80us");
  });

  it("should derive an ordinals taproot address that matches sats-connect", () => {

    const pubkeyHex = bip32.getPublicKey("m/86'/1'/0'/0/0");
    const pubkey = Buffer.from(pubkeyHex, "hex");
    const internalXOnlyPubkey = pubkey.subarray(1, 33);
    const tweak = taggedHash("TapTweak", internalXOnlyPubkey);
    const tweaked = ecc.xOnlyPointAddTweak(internalXOnlyPubkey, tweak);

    if (!tweaked) {
      throw new Error("Failed to derive taproot output key");
    }

    const words = bech32m.toWords(Buffer.from(tweaked.xOnlyPubkey));
    const address = bech32m.encode("tb", [1, ...words]);

    expect(address).toBe(
      "tb1ptc3m295wnrt8e2sw3q3mcshqc4v9w9hfuq7eenhm5dsymj6w2xysn7vgx7",
    );
  });
});
