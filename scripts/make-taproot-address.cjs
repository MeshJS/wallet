#!/usr/bin/env node
// BIP32 derivation, secp256k1 ECC backend, and BIP39 mnemonic utilities
const bip32 = require('bip32');
const ecc = require('tiny-secp256k1');
const bip39 = require('bip39');
// Hash utilities for Taproot tweak (sha256) and P2WPKH (hash160)
const { sha256 } = require('@noble/hashes/sha256');
const { bech32, bech32m } = require('@scure/base');
const crypto = require('crypto');

// BIP340 tagged hash: SHA256(SHA256(tag) || SHA256(tag) || msg)
function taggedHash(tag, msg) {
  const tagHash = sha256(Buffer.from(tag));
  return sha256(Buffer.concat([Buffer.from(tagHash), Buffer.from(tagHash), Buffer.from(msg)]));
}

// HASH160 = RIPEMD160(SHA256(data)) for P2WPKH payload
function hash160(buf) {
  const sha = crypto.createHash('sha256').update(buf).digest();
  return crypto.createHash('ripemd160').update(sha).digest();
}

async function main() {
  const mnemonic = [
    'muscle',
    'urban',
    'donkey',
    'public',
    'summer',
    'recycle',
    'kitten',
    'silver',
    'pluck',
    'myth',
    'install',
    'useful',
  ];

  // 1) Mnemonic -> seed (BIP39)
  const seed = await bip39.mnemonicToSeed(mnemonic.join(' '));
  // 2) Seed -> BIP32 root
  const root = bip32.BIP32Factory(ecc).fromSeed(seed);

  // ===== Taproot (BIP86) =====
  // BIP86 path for native Taproot (testnet): m/86'/1'/0'/0/0
  const taprootPath = "m/86'/1'/0'/0/0";
  const taprootChild = root.derivePath(taprootPath);

  // 3) Compressed pubkey (33 bytes) -> x-only (32 bytes)
  const pubCompressed = taprootChild.publicKey; // Buffer (33)
  const xOnly = pubCompressed.slice(1); // 32 bytes

  // 4) Taproot tweak: tagged hash "TapTweak" with empty script tree
  const tweak = Uint8Array.from(taggedHash('TapTweak', xOnly));

  // 5) Apply x-only point add tweak (Q = P + t*G)
  if (!ecc.xOnlyPointAddTweak) throw new Error('ECC backend lacks xOnlyPointAddTweak');
  const res = ecc.xOnlyPointAddTweak(xOnly, tweak);
  if (!res || !res.xOnlyPubkey) throw new Error('Failed to tweak pubkey');

  const tweakedX = res.xOnlyPubkey; // Buffer/Uint8Array length 32

  // 6) Encode as bech32m: witness v1 + 32-byte program
  const taprootWords = bech32m.toWords(tweakedX);
  const taprootAddress = bech32m.encode('tb', [1, ...taprootWords]);

  // ===== SegWit v0 P2WPKH (BIP84) =====
  // BIP84 path for native SegWit (testnet): m/84'/1'/0'/0/0
  const segwitPath = "m/84'/1'/0'/0/0";
  const segwitChild = root.derivePath(segwitPath);
  // 3) HASH160(pubkey) to produce the 20-byte witness program
  const pubkeyHash = hash160(segwitChild.publicKey);
  // 4) Encode as bech32: witness v0 + 20-byte program
  const segwitWords = bech32.toWords(pubkeyHash);
  const segwitAddress = bech32.encode('tb', [0, ...segwitWords]);

  console.log('taproot address (BIP86):', taprootAddress);
  console.log('segwit v0 address (BIP84):', segwitAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
