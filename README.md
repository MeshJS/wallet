# @meshsdk/wallet

Cardano wallet library for signing transactions, managing keys, and interacting with browser wallets. Provides both headless (server-side / Node.js) and browser wallet support with a CIP-30 compatible interface.

```bash
npm install @meshsdk/wallet
```

> **Migrating from v1 (`MeshWallet` or `BrowserWallet`)?** This version has breaking changes. See:
> - [`mesh-wallet-migration.md`](./mesh-wallet-migration.md) — for `MeshWallet` to `MeshCardanoHeadlessWallet`
> - [`browser-wallet-migration.md`](./browser-wallet-migration.md) — for `BrowserWallet` to `MeshCardanoBrowserWallet`

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Exported Classes](#exported-classes)
- [Headless Wallet (Server-Side)](#headless-wallet-server-side)
- [Browser Wallet (Client-Side)](#browser-wallet-client-side)
- [Low-Level Components](#low-level-components)
- [CIP-30 Compatibility](#cip-30-compatibility)
- [CardanoHeadlessWallet vs MeshCardanoHeadlessWallet](#cardanoheadlesswallet-vs-meshcardanoheadlesswallet)
- [Migration from v1](#migration-from-v1)

---

## Architecture Overview

This package uses a two-tier class hierarchy for both headless and browser wallets:

- **Base classes** (`CardanoHeadlessWallet`, `CardanoBrowserWallet`) implement the CIP-30 interface strictly — all methods return raw hex/CBOR exactly as CIP-30 specifies.
- **Mesh classes** (`MeshCardanoHeadlessWallet`, `MeshCardanoBrowserWallet`) extend the base classes with convenience methods (`*Bech32()`, `*Mesh()`, `signTxReturnFullTx()`) that return human-friendly formats.

**For most use cases, use the Mesh classes.** The base classes are for advanced users who need raw CIP-30 output.

---

## Exported Classes

| Class | Purpose | Use When |
|-------|---------|----------|
| `MeshCardanoHeadlessWallet` | Full-featured headless wallet with convenience methods | Server-side signing, backend transaction building, testing |
| `CardanoHeadlessWallet` | CIP-30 strict headless wallet (raw hex/CBOR returns) | You need raw CIP-30 output without conversion |
| `MeshCardanoBrowserWallet` | Full-featured browser wallet wrapper with convenience methods | dApp frontend integration with browser wallets (Eternl, Nami, etc.) |
| `CardanoBrowserWallet` | CIP-30 strict browser wallet wrapper (raw hex/CBOR returns) | You need raw CIP-30 passthrough from browser wallets |
| `InMemoryBip32` | BIP32 key derivation from mnemonic (keys stored in memory) | Deriving payment/stake/DRep keys from a mnemonic |
| `BaseSigner` | Ed25519 signer from raw private keys | Signing with raw private keys (normal or extended) |
| `CardanoAddress` | Cardano address construction and utilities | Building addresses from credentials |
| `ICardanoWallet` | Interface definition for Cardano wallets | Type-checking and implementing custom wallets |

---

## Headless Wallet (Server-Side)

### Create from Mnemonic

```typescript
import { MeshCardanoHeadlessWallet, AddressType } from "@meshsdk/wallet";

const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic: "globe cupboard camera ...".split(" "),
  networkId: 0,
  walletAddressType: AddressType.Base,
  fetcher: fetcher,
});
```

The `fetcher` is needed for signing transactions — the wallet uses it to look up input information to determine which keys need to sign. Without a fetcher, signing will not work.

### Create from Raw Private Key

```typescript
import { MeshCardanoHeadlessWallet, AddressType, BaseSigner } from "@meshsdk/wallet";

const paymentSigner = BaseSigner.fromNormalKeyHex(
  "d4ffb1e83d44b66849b4f16183cbf2ba1358c491cfeb39f0b66b5f811a88f182"
);

const wallet = await MeshCardanoHeadlessWallet.fromCredentialSources({
  networkId: 0,
  walletAddressType: AddressType.Enterprise,
  paymentCredentialSource: {
    type: "signer",
    signer: paymentSigner,
  },
});
```

### Sign a Transaction

```typescript
// Returns the full signed transaction (ready to submit)
const signedTx = await wallet.signTxReturnFullTx(unsignedTxHex);

// Returns only the witness set CBOR (for partial signing workflows)
const witnessSet = await wallet.signTx(unsignedTxHex);
```

### Custom Derivation Paths

Use `InMemoryBip32` directly for custom key derivation:

```typescript
import { InMemoryBip32 } from "@meshsdk/wallet";

const HARDENED_OFFSET = 0x80000000;
const bip32 = await InMemoryBip32.fromMnemonic(
  "globe cupboard camera ...".split(" ")
);

const paymentSigner = await bip32.getSigner([
  1852 + HARDENED_OFFSET,
  1815 + HARDENED_OFFSET,
  0 + HARDENED_OFFSET,
  0,
  5, // key index 5
]);
```

### Blind Signing with CardanoSigner

For signing without wallet-level input resolution:

```typescript
import { CardanoSigner } from "@meshsdk/wallet";

// Returns witness set CBOR
const txWitnessSet = CardanoSigner.signTx(txHex, [paymentSigner]);

// Returns full signed transaction CBOR
const signedTx = CardanoSigner.signTx(txHex, [paymentSigner], true);
```

---

## Browser Wallet (Client-Side)

### Enable a Browser Wallet

```typescript
import { MeshCardanoBrowserWallet } from "@meshsdk/wallet";

const wallet = await MeshCardanoBrowserWallet.enable("eternl");
```

### List Installed Wallets

```typescript
const wallets = MeshCardanoBrowserWallet.getInstalledWallets();
// Returns: Array<{ id, name, icon, version }>
```

### Common Operations

```typescript
const balance = await wallet.getBalanceMesh();           // Asset[]
const address = await wallet.getChangeAddressBech32();   // bech32 string
const utxos = await wallet.getUtxosMesh();               // UTxO[]
const collateral = await wallet.getCollateralMesh();     // UTxO[]
const networkId = await wallet.getNetworkId();           // number
const rewards = await wallet.getRewardAddressesBech32(); // string[]

// Sign and get the full transaction back (ready to submit)
const signedTx = await wallet.signTxReturnFullTx(unsignedTxHex, partialSign);

// Sign data
const signature = await wallet.signData(addressBech32, hexPayload);
```

---

## Low-Level Components

### InMemoryBip32

Derives Ed25519 signing keys from a BIP39 mnemonic. Keys are held in memory. You can implement your own `Bip32` class (e.g., HSM-backed) as long as it satisfies the same interface.

### BaseSigner

Creates signers from raw Ed25519 private keys:

- `BaseSigner.fromNormalKeyHex(hex)` — from a 32-byte normal private key
- `BaseSigner.fromExtendedKeyHex(hex)` — from a 64-byte extended private key

### CardanoSigner

Signs Cardano transactions given an array of `ISigner` instances. Can return either a witness set or the full signed transaction.

---

## CIP-30 Compatibility

Both `MeshCardanoHeadlessWallet` and `MeshCardanoBrowserWallet` provide CIP-30 compatible methods: `getBalance`, `getChangeAddress`, `getNetworkId`, `getCollateral`, `getUtxos`, `getRewardAddresses`, `signTx`, `signData`, `submitTx`.

**Important caveat for headless wallets:** The headless wallet simulates CIP-30 using a data provider (e.g., Blockfrost). It does not perform key derivation across multiple indices — it only derives keys at index 0 on all derivation paths (payment, stake, DRep). This means `getBalance` or `getUtxos` may return different results than a real browser wallet using the same mnemonic, since real wallets index multiple key derivations.

---

## CardanoHeadlessWallet vs MeshCardanoHeadlessWallet

`CardanoHeadlessWallet` adheres strictly to CIP-30 return types — everything comes back as CBOR hex, which requires a serialization library to parse.

`MeshCardanoHeadlessWallet` extends it with convenience methods:

| Need | Base method (hex/CBOR) | Mesh method (parsed) |
|------|----------------------|---------------------|
| Balance | `getBalance()` → CBOR hex | `getBalanceMesh()` → `Asset[]` |
| Address | `getChangeAddress()` → hex | `getChangeAddressBech32()` → bech32 |
| UTxOs | `getUtxos()` → CBOR hex[] | `getUtxosMesh()` → `UTxO[]` |
| Sign tx | `signTx()` → witness set | `signTxReturnFullTx()` → full signed tx |

The same pattern applies to `CardanoBrowserWallet` vs `MeshCardanoBrowserWallet`.

---

## Migration from v1

This package (`@meshsdk/wallet` v2) has breaking changes from the previous `MeshWallet` and `BrowserWallet` classes.

**Do not attempt to upgrade without reading the migration guides.** Key breaking changes include renamed classes, swapped method parameters, changed return types, and removed methods. Many changes compile without errors but fail silently at runtime.

| Migrating from | Migrating to | Guide |
|----------------|-------------|-------|
| `MeshWallet` (from `@meshsdk/wallet` or `@meshsdk/core`) | `MeshCardanoHeadlessWallet` | [`mesh-wallet-migration.md`](./mesh-wallet-migration.md) |
| `BrowserWallet` (from `@meshsdk/wallet` or `@meshsdk/core`) | `MeshCardanoBrowserWallet` | [`browser-wallet-migration.md`](./browser-wallet-migration.md) |

The migration guides are written for both human developers and LLM agents — they contain deterministic SEARCH/REPLACE patterns that can be applied file-by-file.
