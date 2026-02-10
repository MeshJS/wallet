import { createHash } from "crypto";
import { bech32 } from "@scure/base";

import { BitcoinInMemoryBip32 } from "../../src";

const hash160 = (hexPubkey: string): Buffer => {
  const pubkey = Buffer.from(hexPubkey, "hex");
  const sha = createHash("sha256").update(pubkey).digest();
  return createHash("ripemd160").update(sha).digest();
};

describe("Bitcoin Headless Wallet", () => {
  it("should derive a v0 segwit address", async () => {
    const bip32 = await BitcoinInMemoryBip32.fromMnemonic([
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

    const pubkeyHex = bip32.getPublicKey("m/84'/1'/0'/0/0");
    const pubkeyHash = hash160(pubkeyHex);
    const words = bech32.toWords(pubkeyHash);
    const address = bech32.encode("tb", [0, ...words]);

    expect(address).toBe("tb1qq6km6823v806scer3feqx2xcyrdhgcgw7y80us");
  });
});
