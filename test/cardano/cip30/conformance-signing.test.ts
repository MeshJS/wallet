/**
 * CIP-30 conformance: signTx and signData, both verified with real
 * cryptography (not just shape checks).
 *
 * @see https://cips.cardano.org/cips/cip30/#dataschema
 */
import * as Crypto from "@cardano-sdk/crypto";
import { Cardano, Serialization } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import {
  CoseSign1,
  getPublicKeyFromCoseKey,
} from "../../../src/cardano/signer/cip-8";
import { createCip30Api } from "../../../src/cardano/cip30/cip30-api";
import {
  APIErrorCode,
  DataSignErrorCode,
  TxSignErrorCode,
} from "../../../src/cardano/cip30/errors";
import {
  buildForeignSignerTx,
  createWallet,
  decodeCoseKey,
  decodeCoseSign1Protected,
  ensureSodiumReady,
  PAYMENT_CREDENTIAL_HASH,
  SCRIPT_ADDRESS_BECH32,
  SCRIPT_REWARD_ADDRESS_BECH32,
  SIGN_TX_FIXTURES,
  STAKE_CREDENTIAL_HASH,
} from "./fixtures";

beforeAll(ensureSodiumReady);

describe("CIP-30 api.signTx(tx, partialSign)", () => {
  it.each(SIGN_TX_FIXTURES.map((f, i) => [i, f] as const))(
    "fixture %i: witness set parses and vkey pubkey hashes are a subset of the wallet's credentials",
    async (_i, fixture) => {
      const api = createCip30Api(await createWallet());
      const witnessSetCbor = await api.signTx(fixture.tx, false);
      const witnessSet = Serialization.TransactionWitnessSet.fromCbor(
        witnessSetCbor as any,
      );
      const vkeys = Array.from(witnessSet.vkeys()!.values());
      expect(vkeys.length).toBe(fixture.signerHashes.length);

      const knownHashes = new Set([
        PAYMENT_CREDENTIAL_HASH,
        STAKE_CREDENTIAL_HASH,
      ]);
      for (const vkey of vkeys) {
        const hash = Crypto.Ed25519PublicKey.fromHex(vkey.vkey())
          .hash()
          .hex();
        expect(knownHashes.has(hash)).toBe(true);
      }
    },
  );

  it.each(SIGN_TX_FIXTURES.map((f, i) => [i, f] as const))(
    "fixture %i: each vkey signature cryptographically verifies against the tx body hash",
    async (_i, fixture) => {
      const api = createCip30Api(await createWallet());
      const witnessSetCbor = await api.signTx(fixture.tx, false);
      const witnessSet = Serialization.TransactionWitnessSet.fromCbor(
        witnessSetCbor as any,
      );

      const bodyHash = Serialization.Transaction.fromCbor(
        Serialization.TxCBOR(fixture.tx),
      )
        .body()
        .hash();

      for (const vkey of Array.from(witnessSet.vkeys()!.values())) {
        const publicKey = Crypto.Ed25519PublicKey.fromHex(vkey.vkey());
        const signature = Crypto.Ed25519Signature.fromHex(vkey.signature());
        expect(publicKey.verify(signature, HexBlob(bodyHash.toString()))).toBe(
          true,
        );
      }
    },
  );

  it("known-good fixtures match the wallet's own signature byte-for-byte", async () => {
    const api = createCip30Api(await createWallet());
    for (const fixture of SIGN_TX_FIXTURES) {
      await expect(api.signTx(fixture.tx, false)).resolves.toBe(
        fixture.witnessSet,
      );
    }
  });

  it("partialSign=false rejects with Cip30TxSignError(ProofGeneration) when a foreign signer is required", async () => {
    const api = createCip30Api(await createWallet());
    const tx = buildForeignSignerTx();
    await expect(api.signTx(tx, false)).rejects.toMatchObject({
      code: TxSignErrorCode.ProofGeneration,
    });
  });

  it("partialSign=true succeeds, signing only with the resolvable signer", async () => {
    const api = createCip30Api(await createWallet());
    const tx = buildForeignSignerTx();
    const witnessSetCbor = await api.signTx(tx, true);
    const witnessSet = Serialization.TransactionWitnessSet.fromCbor(
      witnessSetCbor as any,
    );
    const vkeys = Array.from(witnessSet.vkeys()!.values());
    expect(vkeys).toHaveLength(1);
    expect(
      Crypto.Ed25519PublicKey.fromHex(vkeys[0]!.vkey()).hash().hex(),
    ).toBe(PAYMENT_CREDENTIAL_HASH);
  });

  it("Cip30TxSignError serializes to { code, info }", async () => {
    const api = createCip30Api(await createWallet());
    const tx = buildForeignSignerTx();
    try {
      await api.signTx(tx, false);
      throw new Error("expected signTx() to reject");
    } catch (error) {
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        code: TxSignErrorCode.ProofGeneration,
        info: expect.any(String),
      });
    }
  });
});

describe("CIP-30 api.signData(addr, payload)", () => {
  it("DataSignature.signature and .key both parse as CBOR", async () => {
    const api = createCip30Api(await createWallet());
    const address = await api.getChangeAddress();
    const { signature, key } = await api.signData(address, "68656c6c6f");
    expect(() => CoseSign1.fromCbor(signature)).not.toThrow();
    expect(() => getPublicKeyFromCoseKey(key)).not.toThrow();
  });

  it("COSE_Sign1 protected header has alg=-8 and the address bytes match the input address", async () => {
    const api = createCip30Api(await createWallet());
    const address = await api.getChangeAddress();
    const { signature } = await api.signData(address, "68656c6c6f");
    const { alg, address: addressBytes } =
      decodeCoseSign1Protected(signature);
    expect(alg).toBe(-8n);
    expect(Buffer.from(addressBytes).toString("hex")).toBe(address);
  });

  it("COSE_Key has kty=1 (OKP), alg=-8 (EdDSA), crv=6 (Ed25519), and a 32-byte x", async () => {
    const api = createCip30Api(await createWallet());
    const address = await api.getChangeAddress();
    const { key } = await api.signData(address, "68656c6c6f");
    const { kty, alg, crv, x } = decodeCoseKey(key);
    expect(kty).toBe(1n);
    expect(alg).toBe(-8n);
    expect(crv).toBe(6n);
    expect(x).toHaveLength(32);
  });

  it("signature cryptographically verifies via CoseSign1.verifySignature", async () => {
    const api = createCip30Api(await createWallet());
    const address = await api.getChangeAddress();
    const { signature, key } = await api.signData(address, "68656c6c6f");

    const coseSign1 = CoseSign1.fromCbor(signature);
    const publicKeyBuffer = getPublicKeyFromCoseKey(key);
    expect(coseSign1.verifySignature({ publicKeyBuffer })).toBe(true);
  });

  it("hex and bech32 input of the same address produce verifiable signatures with the same key", async () => {
    const api = createCip30Api(await createWallet());
    const hexAddress = await api.getChangeAddress();
    const bech32Address = Cardano.Address.fromBytes(
      hexAddress as any,
    )!.toBech32();

    const fromHex = await api.signData(hexAddress, "68656c6c6f");
    const fromBech32 = await api.signData(bech32Address, "68656c6c6f");

    expect(fromBech32.key).toBe(fromHex.key);

    const publicKeyBuffer = getPublicKeyFromCoseKey(fromHex.key);
    expect(
      CoseSign1.fromCbor(fromHex.signature).verifySignature({
        publicKeyBuffer,
      }),
    ).toBe(true);
    expect(
      CoseSign1.fromCbor(fromBech32.signature).verifySignature({
        publicKeyBuffer,
      }),
    ).toBe(true);
  });

  it("script address rejects with Cip30DataSignError(AddressNotPK)", async () => {
    const api = createCip30Api(await createWallet());
    await expect(
      api.signData(SCRIPT_ADDRESS_BECH32, "68656c6c6f"),
    ).rejects.toMatchObject({ code: DataSignErrorCode.AddressNotPK });
  });

  it("script reward address rejects with Cip30DataSignError(AddressNotPK)", async () => {
    const api = createCip30Api(await createWallet());
    await expect(
      api.signData(SCRIPT_REWARD_ADDRESS_BECH32, "68656c6c6f"),
    ).rejects.toMatchObject({ code: DataSignErrorCode.AddressNotPK });
  });

  it("malformed address input rejects with Cip30APIError(InvalidRequest)", async () => {
    const api = createCip30Api(await createWallet());
    await expect(
      api.signData("not-an-address", "68656c6c6f"),
    ).rejects.toMatchObject({ code: APIErrorCode.InvalidRequest });
  });

  it("Cip30DataSignError serializes to { code, info }", async () => {
    const api = createCip30Api(await createWallet());
    try {
      await api.signData(SCRIPT_ADDRESS_BECH32, "68656c6c6f");
      throw new Error("expected signData() to reject");
    } catch (error) {
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        code: DataSignErrorCode.AddressNotPK,
        info: expect.any(String),
      });
    }
  });
});
