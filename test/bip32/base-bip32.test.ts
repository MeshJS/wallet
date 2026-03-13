import { Ed25519PublicKey, Ed25519PublicKeyHex } from "@cardano-sdk/crypto";

import { CardanoInMemoryBip32 } from "../../src/bip32/cardano-in-memory-bip32";
import { HARDENED_OFFSET } from "../../src/cardano/utils/constants";

describe("BaseBip32", () => {
  it("should create a BaseBip32 instance from mnemonic", async () => {
    const bip32 = await CardanoInMemoryBip32.fromMnemonic(
      "solution,".repeat(24).split(",").slice(0, 24),
    );

    expect(bip32).toBeInstanceOf(CardanoInMemoryBip32);

    const paymentSigner = await bip32.getSigner([
      1852 + HARDENED_OFFSET,
      1815 + HARDENED_OFFSET,
      0 + HARDENED_OFFSET,
      0,
      0,
    ]);

    expect(
      Ed25519PublicKey.fromHex(
        Ed25519PublicKeyHex(await paymentSigner.getPublicKey()),
      )
        .hash()
        .hex(),
    ).toBe("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f");
  });
});
