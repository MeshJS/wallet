/**
 * Shared fixtures for the CIP-30 conformance suite (test/cardano/cip30/*).
 *
 * Single source of truth for: the "solution"x24 test mnemonic, its 6-UTxO
 * `OfflineFetcher` fixture (also used by test/wallet/cardano-headless-wallet.test.ts
 * and test/wallet/cip-30.test.ts, all deriving from the same mnemonic/base
 * address), a wallet factory, and the known-good signTx/signData fixtures
 * used for real cryptographic verification (not just shape checks).
 */
import { Cardano, Serialization } from "@cardano-sdk/core";
import { Hash28ByteBase16 } from "@cardano-sdk/crypto";
import { Cbor, CborNegInt, CborObj, CborUInt } from "@harmoniclabs/cbor";

import { UTxO } from "@meshsdk/common";
import { OfflineFetcher } from "@meshsdk/provider";

import { AddressType } from "../../../src/cardano/address/cardano-address";
import { CardanoHeadlessWallet } from "../../../src/cardano/wallet/mesh/cardano-headless-wallet";

export const MNEMONIC = "solution,".repeat(24).split(",").slice(0, 24);

// 6 UTxOs across the wallet's base address (4 pure-ADA) and its
// enterprise-shaped payment-part address (1 with a native asset, 1 pure-ADA
// >= the 5 ADA collateral floor) - same set as
// test/wallet/cardano-headless-wallet.test.ts and test/cardano/cip30/cip30-api.test.ts,
// giving 2 distinct used addresses and a mix of pure-ADA/multiasset UTxOs to
// select over. Exported as a plain array (in addition to the pre-loaded
// `offlineFetcher` below) so provider-attachment.test.ts can build a second,
// independent IFetcher implementation from the exact same data.
export const FIXTURE_UTXOS: UTxO[] = [
  {
    input: {
      txHash:
        "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023",
      outputIndex: 1,
    },
    output: {
      address:
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      amount: [{ unit: "lovelace", quantity: "977313882" }],
    },
  },
  {
    input: {
      txHash:
        "e6a99b6338fbacd1e411c7bf69d963d83975d8ad1336cb70cd600bdd049c4cae",
      outputIndex: 1,
    },
    output: {
      address:
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      amount: [{ unit: "lovelace", quantity: "977313882" }],
    },
  },
  {
    input: {
      txHash:
        "62e6bf27216633a367924fd9d94681f75609788fa8e6187c8a583a95d60fbbcd",
      outputIndex: 1,
    },
    output: {
      address:
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      amount: [{ unit: "lovelace", quantity: "954457687" }],
    },
  },
  {
    input: {
      txHash:
        "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999",
      outputIndex: 0,
    },
    output: {
      address:
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      amount: [{ unit: "lovelace", quantity: "954284486" }],
    },
  },
  {
    input: {
      txHash:
        "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999",
      outputIndex: 1,
    },
    output: {
      address:
        "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
      amount: [
        { unit: "lovelace", quantity: "500000000" },
        {
          unit: "0ba402c042775dfffedbd958cae3805a281bad34f46b5b6fd5c2c7714d657368546f6b656e",
          quantity: "1",
        },
      ],
    },
  },
  {
    input: {
      txHash:
        "ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999",
      outputIndex: 2,
    },
    output: {
      address:
        "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
      amount: [{ unit: "lovelace", quantity: "5000000" }],
    },
  },
];

export const offlineFetcher = new OfflineFetcher("preprod");
offlineFetcher.addUTxOs(FIXTURE_UTXOS);

/** Total lovelace + the single native asset quantity across all 6 fixture UTxOs. */
export const TOTAL_FIXTURE_COIN =
  977313882n + 977313882n + 954457687n + 954284486n + 500000000n + 5000000n;
export const FIXTURE_ASSET_ID = Cardano.AssetId(
  "0ba402c042775dfffedbd958cae3805a281bad34f46b5b6fd5c2c7714d657368546f6b656e",
);
export const FIXTURE_ASSET_QUANTITY = 1n;

/** Encodes a plain CBOR unsigned int, as used by `getCollateral({ amount })`'s `cbor<Coin>` shape. */
export function coinCbor(lovelace: bigint): string {
  return Buffer.from(Cbor.encode(new CborUInt(lovelace)).toBuffer()).toString(
    "hex",
  );
}

export async function createWallet(
  withFetcher = true,
): Promise<CardanoHeadlessWallet> {
  return CardanoHeadlessWallet.fromMnemonic({
    mnemonic: MNEMONIC,
    networkId: 0,
    walletAddressType: AddressType.Base,
    fetcher: withFetcher ? offlineFetcher : undefined,
  });
}

// The wallet's payment/stake credential hashes, embedded in its base address
// (addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9):
// header byte + 28-byte payment hash + 28-byte stake hash.
export const PAYMENT_CREDENTIAL_HASH =
  "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f";
export const STAKE_CREDENTIAL_HASH =
  "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6";

// Well-formed testnet enterprise address over an all-zero script hash
// (28 bytes), used to exercise the AddressNotPK signData path without
// needing a real script.
export const SCRIPT_ADDRESS_BECH32 =
  "addr_test1wqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqydhgrt";

// A reward/stake address whose credential is a script hash rather than a key
// hash - the other AddressNotPK case per spec ("script or reward address
// without a key"). See conformance-signing.test.ts for the adapter bug this
// fixture exposes (isScriptAddress() reads the wrong Address field for
// reward addresses).
export const SCRIPT_REWARD_ADDRESS_BECH32 = Cardano.RewardAddress.fromCredentials(
  0,
  { hash: "00".repeat(28), type: Cardano.CredentialType.ScriptHash },
)
  .toAddress()
  .toBech32();

/**
 * Three known-good tx CBOR -> witness-set CBOR pairs, reused verbatim from
 * test/wallet/cardano-headless-wallet.test.ts's "should sign with correct
 * witness" test. Fixture 1 requires only the payment signer; fixtures 2 and 3
 * additionally require the stake signer (a certificate and a withdrawal,
 * respectively), so each carries 2 vkey witnesses.
 */
export const SIGN_TX_FIXTURES: {
  tx: string;
  witnessSet: string;
  signerHashes: string[];
}[] = [
  {
    tx: "84a500d901028282582045703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc102301825820e6a99b6338fbacd1e411c7bf69d963d83975d8ad1336cb70cd600bdd049c4cae01018282583900fbbd5c9ecf59fb9ba10f723003d3a3ed6214fa71f03b85041ae5c2e34253771c046276f5eb6777961f972c7ef25abad3f3319ea69cad00e21a3b9aca00825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a38e3de57021a0002985d031a063659930801a100d9010281825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f9558402047ca362a5f5a9b2f9c5ad0c772c3be8eb1b66fe8e86faf96f5717fcc05b1340da85cbac4ba8d6182ac849a66792d70340a7ea3ff9bea76460d982ff5a46f0af5f6",
    witnessSet:
      "a100d9010281825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f9558402047ca362a5f5a9b2f9c5ad0c772c3be8eb1b66fe8e86faf96f5717fcc05b1340da85cbac4ba8d6182ac849a66792d70340a7ea3ff9bea76460d982ff5a46f0a",
    signerHashes: [PAYMENT_CREDENTIAL_HASH],
  },
  {
    tx: "84a600d901028182582062e6bf27216633a367924fd9d94681f75609788fa8e6187c8a583a95d60fbbcd010181825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a38e139c6021a0002a491031a063d0f2d04d901028183098200581c9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e68200581c9816db59cc3cefc2d41dd05fde9c04b4012afc74bb9d0072cae72f110801a100d9010282825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f955840ae75a2cc6cabda10b30849164457bddcbf0248f6afa1153dc03a7a136b177f6764757691335e1670aba2e26b3cc7d7ee82bebf1cfe7b9f6b9ba352c984c7b50382582002c9f4600bc90fcf09c7ef26346fd64dc3f39c3695ed986f53caad400ef419ad58403c58828bd5a4bcf0e6de64bc5bf1459dd3afaad1f3135d0f2d4309f867ffdf8f944a5ca98d35981024459a2eec9d9da28bfcb8c08d67f34c68ed95bb1501940df5f6",
    witnessSet:
      "a100d9010282825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f955840ae75a2cc6cabda10b30849164457bddcbf0248f6afa1153dc03a7a136b177f6764757691335e1670aba2e26b3cc7d7ee82bebf1cfe7b9f6b9ba352c984c7b50382582002c9f4600bc90fcf09c7ef26346fd64dc3f39c3695ed986f53caad400ef419ad58403c58828bd5a4bcf0e6de64bc5bf1459dd3afaad1f3135d0f2d4309f867ffdf8f944a5ca98d35981024459a2eec9d9da28bfcb8c08d67f34c68ed95bb1501940d",
    signerHashes: [PAYMENT_CREDENTIAL_HASH, STAKE_CREDENTIAL_HASH],
  },
  {
    tx: "84a600d9010281825820ad3ec70ffbc9a2d169fc6a4a9fdbae168ebad547f3939c97fc3bb41fa70c9999000181825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a75769bcf021a00029ee5031a063d111505a1581de09d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a3c9800ee0801a0f5f6",
    witnessSet:
      "a100d9010282825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f955840b71e7ffac89eac0dc051323fe30172b3c83d753f92c489478188ccbeed67b77bcc1af7d42c43d987ac767eeb3b0aea20697dbf87697de00487d16cbe2ff7750e82582002c9f4600bc90fcf09c7ef26346fd64dc3f39c3695ed986f53caad400ef419ad5840f40a8b338f56e958e65051178c9397e4c15c522aca5a0ff5639c5ee6f9a040280e7c5b15981504937978311c8763aedc164a89535f9fdcbb28089294efdc6b0e",
    signerHashes: [PAYMENT_CREDENTIAL_HASH, STAKE_CREDENTIAL_HASH],
  },
];

/** Credential hash injected via `requiredExtraSignatures` that the wallet can never resolve. */
export const FOREIGN_CREDENTIAL_HASH =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8";

/**
 * Builds a tx (spending the fixture's first UTxO) whose `requiredExtraSignatures`
 * includes both a real wallet signer (the payment credential, via the input)
 * and `FOREIGN_CREDENTIAL_HASH`, which no wallet can ever resolve. Used to
 * exercise `signTx`'s `partialSign` semantics: `partialSign=false` must
 * reject (not all required signers found), `partialSign=true` must succeed
 * with only the resolvable signer's witness.
 */
export function buildForeignSignerTx(): string {
  const coreTx = {
    inputs: [
      {
        txId: Cardano.TransactionId(
          "45703dfd724f8bc92ebabdbff28b54d3434b126f31d31b2fffa5e3ed1edc1023",
        ),
        index: 1,
      },
    ],
    outputs: [
      {
        address: Cardano.PaymentAddress(
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        ),
        value: { coins: 900_000_000n },
      },
    ],
    requiredExtraSignatures: [Hash28ByteBase16(FOREIGN_CREDENTIAL_HASH)],
    fee: 200_000n,
  };
  const body = Serialization.TransactionBody.fromCore(coreTx as any);
  const witnessSet = new Serialization.TransactionWitnessSet();
  return new Serialization.Transaction(body, witnessSet).toCbor();
}

/**
 * `Ed25519PublicKey.hash()`/`.verify()` (used throughout the signTx/signData
 * conformance tests for real cryptographic assertions) call into
 * libsodium-wrappers-sumo's WASM build, which initializes asynchronously.
 * Call this from a `beforeAll` before using either method.
 */
export async function ensureSodiumReady(): Promise<void> {
  const sodium = await import("libsodium-wrappers-sumo");
  await sodium.ready;
}

// -- COSE decoding helpers, for structural signData assertions ------------
//
// `CardanoSigner.signData` (src/cardano/signer/cip-8.ts) builds its
// protected header and COSE_Key by hand with @harmoniclabs/cbor primitives;
// these helpers decode them back out the same way, independent of the
// `CoseSign1` class (which doesn't expose the protected map directly), so
// tests can assert on the exact wire fields the CIP-8 spec requires.

function cborMapEntries(map: {
  map: { k: CborObj; v: CborObj }[];
}): Map<string | bigint, CborObj> {
  const entries = new Map<string | bigint, CborObj>();
  for (const { k, v } of map.map) {
    if (k instanceof CborUInt || k instanceof CborNegInt) {
      entries.set(k.num, v);
    } else if ("text" in k) {
      entries.set(k.text, v);
    }
  }
  return entries;
}

/** Decodes a COSE_Sign1 signature's protected header map: `{ 1: alg, "address": bytes }`. */
export function decodeCoseSign1Protected(signatureHex: string): {
  alg: bigint;
  address: Uint8Array;
} {
  const array = Cbor.parse(signatureHex);
  if (!("array" in array)) {
    throw new Error("Expected a COSE_Sign1 CBOR array");
  }
  const protectedBytes = array.array[0];
  if (!("bytes" in protectedBytes)) {
    throw new Error("Expected protected header to be a CBOR bstr");
  }
  const protectedMap = Cbor.parse(protectedBytes.bytes);
  if (!("map" in protectedMap)) {
    throw new Error("Expected protected header to decode to a CBOR map");
  }
  const entries = cborMapEntries(protectedMap);
  const alg = entries.get(1n);
  const address = entries.get("address");
  if (!alg || !("num" in alg) || !address || !("bytes" in address)) {
    throw new Error("Malformed COSE_Sign1 protected header");
  }
  return { alg: alg.num, address: address.bytes };
}

/** Decodes a COSE_Key: `{ 1: kty, 3: alg, -1: crv, -2: x }`. */
export function decodeCoseKey(keyHex: string): {
  kty: bigint;
  alg: bigint;
  crv: bigint;
  x: Uint8Array;
} {
  const keyMap = Cbor.parse(keyHex);
  if (!("map" in keyMap)) {
    throw new Error("Expected a COSE_Key CBOR map");
  }
  const entries = cborMapEntries(keyMap);
  const kty = entries.get(1n);
  const alg = entries.get(3n);
  const crv = entries.get(-1n);
  const x = entries.get(-2n);
  if (
    !kty ||
    !("num" in kty) ||
    !alg ||
    !("num" in alg) ||
    !crv ||
    !("num" in crv) ||
    !x ||
    !("bytes" in x)
  ) {
    throw new Error("Malformed COSE_Key");
  }
  return { kty: kty.num, alg: alg.num, crv: crv.num, x: x.bytes };
}
