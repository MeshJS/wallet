# @meshsdk/wallet

Cardano wallet library for signing transactions, managing keys, and interacting with browser wallets. Provides both headless (server-side / Node.js) and browser wallet support with a CIP-30 compatible interface.

```bash
npm install @meshsdk/wallet
```

> **Migrating from v1 (`MeshWallet` or `BrowserWallet`)?** This version has breaking changes. See:
>
> - [`mesh-wallet-migration.md`](./mesh-wallet-migration.md) — for `MeshWallet` to `MeshCardanoHeadlessWallet`
> - [`browser-wallet-migration.md`](./browser-wallet-migration.md) — for `BrowserWallet` to `MeshCardanoBrowserWallet`

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Exported Classes](#exported-classes)
- [Headless Wallet (Server-Side)](#headless-wallet-server-side)
- [Simulated CIP-30 API (headless)](#simulated-cip-30-api-headless)
- [Browser Wallet (Client-Side)](#browser-wallet-client-side)
- [Bitcoin Headless Wallet](#bitcoin-headless-wallet)
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

| Class                                                                                               | Purpose                                                                                                                                | Use When                                                                                            |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `MeshCardanoHeadlessWallet`                                                                         | Full-featured headless wallet with convenience methods                                                                                 | Server-side signing, backend transaction building, testing                                          |
| `CardanoHeadlessWallet`                                                                             | CIP-30 strict headless wallet (raw hex/CBOR returns)                                                                                   | You need raw CIP-30 output without conversion                                                       |
| `MeshCardanoBrowserWallet`                                                                          | Full-featured browser wallet wrapper with convenience methods                                                                          | dApp frontend integration with browser wallets (Eternl, Nami, etc.)                                 |
| `CardanoBrowserWallet`                                                                              | CIP-30 strict browser wallet wrapper (raw hex/CBOR returns)                                                                          | You need raw CIP-30 passthrough from browser wallets                                                |
| `CardanoInMemoryBip32`                                                                              | BIP32 key derivation from mnemonic (keys stored in memory)                                                                             | Deriving payment/stake/DRep keys from a mnemonic                                                    |
| `BaseSigner`                                                                                        | Ed25519 signer from raw private keys                                                                                                   | Signing with raw private keys (normal or extended)                                                  |
| `CardanoAddress`                                                                                    | Cardano address construction and utilities                                                                                             | Building addresses from credentials                                                                 |
| `ICardanoWallet`                                                                                    | Interface definition for Cardano wallets                                                                                               | Type-checking and implementing custom wallets                                                       |
| `createCip30Wallet`                                                                                 | Wraps an `ICardanoWallet` as a simulated CIP-30 initial API (`window.cardano.<name>`-shaped), with `enable()` extension negotiation  | dApp integration tests / server-side agents that need a real `window.cardano`-shaped API, no browser |
| `createCip30Api`                                                                                    | Wraps an `ICardanoWallet` as a spec-exact `ICip30Api` directly, without extension negotiation                                        | Advanced: you already have your own `enable()` gating and just need the spec-exact endpoints        |
| `ICip30Api` / `ICip30InitialApi`                                                                    | Interface definitions for the CIP-30 API surface                                                                                       | Type-checking and implementing custom CIP-30 adapters                                               |
| `Cip30APIError`, `Cip30PaginateError`, `Cip30TxSignError`, `Cip30DataSignError`, `Cip30TxSendError` | CIP-30 error classes (spec-exact wire shapes: `{code, info}` or `{maxSize}`)                                                           | Catching and pattern-matching on typed CIP-30 errors instead of plain `Error`                     |

---

## Headless Wallet (Server-Side)

### Create from Mnemonic

```typescript
import { AddressType, MeshCardanoHeadlessWallet } from "@meshsdk/wallet";

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
import {
  AddressType,
  BaseSigner,
  MeshCardanoHeadlessWallet,
} from "@meshsdk/wallet";

const paymentSigner = BaseSigner.fromNormalKeyHex(
  "d4ffb1e83d44b66849b4f16183cbf2ba1358c491cfeb39f0b66b5f811a88f182",
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

Use `CardanoInMemoryBip32` directly for custom key derivation:

```typescript
import { CardanoInMemoryBip32 } from "@meshsdk/wallet";

const HARDENED_OFFSET = 0x80000000;
const bip32 = await CardanoInMemoryBip32.fromMnemonic(
  "globe cupboard camera ...".split(" "),
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

## Simulated CIP-30 API (headless)

`createCip30Wallet()` wraps any `ICardanoWallet` (e.g. `MeshCardanoHeadlessWallet`) as a full simulated CIP-30 API — the same shape a dApp sees at `window.cardano.<name>` in a browser, but driven by a real signing wallet with zero browser and zero extension. This is the use case for dApp integration tests or server-side agents that need to exercise a genuine CIP-30 flow (`enable()` → `getUtxos()` → `signTx()` → ...) without a browser wallet extension in the loop.

```typescript
import { MeshCardanoHeadlessWallet, AddressType, createCip30Wallet } from "@meshsdk/wallet";
import { OfflineFetcher } from "@meshsdk/provider";

const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic: "globe cupboard camera ...".split(" "),
  networkId: 0,
  walletAddressType: AddressType.Base,
  fetcher: new OfflineFetcher("preprod"),
});

// Wrap the wallet as a full simulated CIP-30 wallet — exactly what a dApp
// sees from window.cardano.<name>.
const cip30 = createCip30Wallet({ wallet, name: "mesh-headless" });

await cip30.isEnabled();          // false, until enable() is called
const api = await cip30.enable(); // negotiates extensions, auto-approves by default

// Spec-exact endpoints: amount filtering, pagination, null semantics.
const utxos = await api.getUtxos(amountCbor, { page: 0, limit: 10 }); // null if amount unmet
const collateral = await api.getCollateral({ amount: coinCbor });

try {
  await api.signTx(txCbor);
} catch (error) {
  // error is a Cip30TxSignError: { code: 1 | 2, info: string } — not a bare Error
  console.error(error.code, error.info);
}
```

`enable()` auto-approves by default, since a headless wallet has no UI to prompt with. Pass `autoApprove: false` or a custom `approve` hook to exercise the `Refused(-3)` path (e.g. in tests).

### Provider attachment (A3)

Because `createCip30Wallet` / `createCip30Api` only depend on the wallet's `ICardanoWallet` interface, swapping the underlying `IFetcher` (or `ISubmitter`) is a one-line change — nothing in the adapter or wallet code needs to know which provider it's talking to:

```typescript
import { BlockfrostProvider } from "@meshsdk/provider";

const provider = new BlockfrostProvider("<key>");

const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic: "globe cupboard camera ...".split(" "),
  networkId: 0,
  walletAddressType: AddressType.Base,
  fetcher: provider,   // swapped from OfflineFetcher — same code, real network
  submitter: provider,
});

const cip30 = createCip30Wallet({ wallet, name: "mesh-headless" });
```

See [`test/cardano/cip30/provider-attachment.test.ts`](./test/cardano/cip30/provider-attachment.test.ts) for the proof: two independently-built `IFetcher` implementations fed identical fixture data produce identical `getUtxos()` / `getBalance()` / `getCollateral()` results.

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
const balance = await wallet.getBalanceMesh(); // Asset[]
const address = await wallet.getChangeAddressBech32(); // bech32 string
const utxos = await wallet.getUtxosMesh(); // UTxO[]
const collateral = await wallet.getCollateralMesh(); // UTxO[]
const networkId = await wallet.getNetworkId(); // number
const rewards = await wallet.getRewardAddressesBech32(); // string[]

// Sign and get the full transaction back (ready to submit)
const signedTx = await wallet.signTxReturnFullTx(unsignedTxHex, partialSign);

// Sign data
const signature = await wallet.signData(addressBech32, hexPayload);
```

---

## Bitcoin Headless Wallet

`BitcoinHeadlessWallet` is the Bitcoin counterpart of the Cardano headless wallet: a server-side / Node.js wallet driven by a pluggable `IBitcoinProvider` data provider — the same fetcher/submitter pattern used on the Cardano side.

### Create from Mnemonic with the Maestro provider

```typescript
import { BitcoinHeadlessWallet, MaestroProvider } from "@meshsdk/wallet";

const provider = new MaestroProvider({
  network: "testnet", // or "mainnet"
  apiKey: "<your-maestro-api-key>",
});

const wallet = await BitcoinHeadlessWallet.fromMnemonic({
  network: "Testnet4", // or "Mainnet"
  mnemonic: "muscle urban donkey ...".split(" "),
  provider,
});
```

`MaestroProvider` implements `IBitcoinProvider` against the [Maestro Bitcoin API](https://docs.gomaestro.org/bitcoin)'s Esplora-compatible endpoints. Any other `IBitcoinProvider` implementation can be swapped in — the wallet code doesn't change.

### Query UTXOs

```typescript
// All UTXOs across the payment (P2WPKH) and ordinals (P2TR) addresses,
// each annotated with the address and purpose it belongs to.
const utxos = await wallet.fetchUTXOs();

// Or query the provider directly for any address.
const addressUtxos = await provider.fetchAddressUTxOs("tb1q...");
```

### Coin selection

`signTransfer` selects inputs automatically, but the algorithm is also exported for standalone use — largest-first selection with BIP-141 vbyte-accurate fee estimation and automatic sub-dust change handling:

```typescript
import { selectUtxosLargestFirst } from "@meshsdk/wallet";

const { selectedUtxos, change } = selectUtxosLargestFirst(
  utxos, // from fetchAddressUTxOs
  50_000, // target amount (sats)
  2, // fee rate (sats/vB)
  1, // number of recipients
);
```

### Send a transfer

```typescript
// Queries UTXOs, selects coins, builds + signs a PSBT (RBF-enabled),
// broadcasts through the provider, and returns the txid.
const txid = await wallet.signTransfer([
  { address: "tb1q...", amount: 10_000 },
]);
```

### Other operations

```typescript
const balance = await wallet.getBalance(); // { confirmed, unconfirmed, total } in sats
const history = await wallet.getTransactionHistory(); // newest first
const signature = await wallet.signMessage("tb1q...", "hello"); // BIP-137 ECDSA
const psbtBase64 = await wallet.signPsbt({ psbt, signInputs }); // P2WPKH + P2TR inputs
```

---

## Low-Level Components

### CardanoInMemoryBip32

Derives Ed25519 signing keys from a BIP39 mnemonic. Keys are held in memory. You can implement your own `Bip32` class (e.g., HSM-backed) as long as it satisfies the same interface.

### BaseSigner

Creates signers from raw Ed25519 private keys:

- `BaseSigner.fromNormalKeyHex(hex)` — from a 32-byte normal private key
- `BaseSigner.fromExtendedKeyHex(hex)` — from a 64-byte extended private key

### CardanoSigner

Signs Cardano transactions given an array of `ISigner` instances. Can return either a witness set or the full signed transaction.

---

## CIP-30 Compatibility

Both `MeshCardanoHeadlessWallet` and `MeshCardanoBrowserWallet` provide CIP-30 compatible methods: `getBalance`, `getChangeAddress`, `getNetworkId`, `getCollateral`, `getUtxos`, `getRewardAddresses`, `signTx`, `signData`, `submitTx`. For the headless side, `createCip30Wallet()` (see [Simulated CIP-30 API (headless)](#simulated-cip-30-api-headless)) wraps these into a spec-exact adapter — params, null semantics, and typed errors matching [CIP-30](https://cips.cardano.org/cips/cip30/) exactly.

**Important caveat for headless wallets:** The headless wallet simulates CIP-30 using a data provider (e.g., Blockfrost). It does not perform key derivation across multiple indices — it only derives keys at index 0 on all derivation paths (payment, stake, DRep). This means `getBalance` or `getUtxos` may return different results than a real browser wallet using the same mnemonic, since real wallets index multiple key derivations. This is the "stateless single-address wallet" caveat referenced throughout the conformance matrix below.

### Conformance matrix

Endpoints implemented by the `createCip30Wallet()` / `createCip30Api()` adapter (`src/cardano/cip30/`), checked against the CIP-30 spec:

**Initial API** (`window.cardano.<name>`, before `enable()`):

| Endpoint | Status | Notes |
|---|---|---|
| `apiVersion` | ✅ Conformant (adapter) | Always `"1"` |
| `name` | ✅ Conformant (adapter) | Set via `createCip30Wallet({ name })` |
| `icon` | ✅ Conformant (adapter) | Data URI or URL; defaults to `""` |
| `supportedExtensions` | ✅ Conformant (adapter) | Defaults to `[]` — only lists extensions *beyond* the base CIP-30 API (e.g. CIP-95) |
| `isEnabled()` | ✅ Conformant (adapter) | Reflects whether `enable()` has previously succeeded |
| `enable(extensions?)` | ✅ Conformant (adapter) | Extension negotiation (requested ∩ supported → granted). Auto-approves by default — a headless wallet has no UI to prompt with — configurable via `autoApprove`/`approve` to exercise `Refused(-3)` |

**Full API** (returned by `enable()`):

| Endpoint | Status | Notes |
|---|---|---|
| `getExtensions()` | ✅ Conformant (adapter) | Returns the extensions granted during `enable()` |
| `getNetworkId()` | ✅ Conformant (adapter) | |
| `getUtxos(amount?, paginate?)` | ✅ Conformant (adapter) | `amount` is `cbor<Value>`; UTxOs are selected until the merged value covers it, `null` if unmet. `paginate` throws `PaginateError{maxSize}` past the last page |
| `getBalance()` | ✅ Conformant (adapter) | |
| `getUsedAddresses(paginate?)` | ✅ Conformant (adapter)* | *Stateless single-address wallet — see caveat above. Paginated with `PaginateError{maxSize}` |
| `getUnusedAddresses()` | ✅ Conformant (adapter)* | *Same single-address caveat: the wallet is stateless and cannot track usage, so this always returns the one derived address (never empty) — a deviation from real used/unused semantics |
| `getChangeAddress()` | ✅ Conformant (adapter) | |
| `getRewardAddresses()` | ✅ Conformant (adapter) | |
| `getCollateral(params?)` | ✅ Conformant (adapter) | `params.amount` is `cbor<Coin>`, defaults to 5 ADA. Pure-ADA UTxOs only, `null` if unmet. Deprecated in the CIP-30 spec (superseded by CIP-40) but implemented since wallets still call it |
| `signTx(tx, partialSign?)` | ✅ Conformant (adapter) | Throws `TxSignError(ProofGeneration = 1)` when signers can't be resolved. `UserDeclined(2)` is unreachable — the headless wallet has no decline hook for signing (only `enable()` does) |
| `signData(addr, payload)` | ✅ Conformant (adapter) | Accepts bech32 **or** hex address; throws `DataSignError(ProofGeneration = 1)` / `AddressNotPK(2)`. `UserDeclined(3)` is unreachable — no decline hook for signing |
| `submitTx(tx)` | ✅ Conformant (adapter) | Throws `TxSendError(2)` on node rejection. `Refused(1)` is unreachable — `ISubmitter` has no refusal signal, only success or throw |

---

## CardanoHeadlessWallet vs MeshCardanoHeadlessWallet

`CardanoHeadlessWallet` adheres strictly to CIP-30 return types — everything comes back as CBOR hex, which requires a serialization library to parse.

`MeshCardanoHeadlessWallet` extends it with convenience methods:

| Need    | Base method (hex/CBOR)     | Mesh method (parsed)                    |
| ------- | -------------------------- | --------------------------------------- |
| Balance | `getBalance()` → CBOR hex  | `getBalanceMesh()` → `Asset[]`          |
| Address | `getChangeAddress()` → hex | `getChangeAddressBech32()` → bech32     |
| UTxOs   | `getUtxos()` → CBOR hex[]  | `getUtxosMesh()` → `UTxO[]`             |
| Sign tx | `signTx()` → witness set   | `signTxReturnFullTx()` → full signed tx |

The same pattern applies to `CardanoBrowserWallet` vs `MeshCardanoBrowserWallet`.

---

## Migration from v1

This package (`@meshsdk/wallet` v2) has breaking changes from the previous `MeshWallet` and `BrowserWallet` classes.

**Do not attempt to upgrade without reading the migration guides.** Key breaking changes include renamed classes, swapped method parameters, changed return types, and removed methods. Many changes compile without errors but fail silently at runtime.

| Migrating from                                              | Migrating to                | Guide                                                          |
| ----------------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `MeshWallet` (from `@meshsdk/wallet` or `@meshsdk/core`)    | `MeshCardanoHeadlessWallet` | [`mesh-wallet-migration.md`](./mesh-wallet-migration.md)       |
| `BrowserWallet` (from `@meshsdk/wallet` or `@meshsdk/core`) | `MeshCardanoBrowserWallet`  | [`browser-wallet-migration.md`](./browser-wallet-migration.md) |

The migration guides are written for both human developers and LLM agents — they contain deterministic SEARCH/REPLACE patterns that can be applied file-by-file.
