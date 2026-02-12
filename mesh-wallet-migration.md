# MeshWallet Migration Guide: @meshsdk/wallet Breaking Changes

> **Purpose:** This document is written for LLM agents (Claude, etc.) to read and deterministically apply all required code changes when migrating from the OLD `MeshWallet` (from `@meshsdk/wallet` or `@meshsdk/core`) to the NEW `MeshCardanoHeadlessWallet` (from `@meshsdk/wallet`).
>
> **Instructions to agent:** Read this entire document before making any changes. Apply changes file-by-file. Each section contains SEARCH patterns and REPLACE rules. Follow them exactly.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Import Changes](#2-import-changes)
3. [Construction Pattern Migration](#3-construction-pattern-migration)
4. [Address Methods: bech32 to hex Default](#4-address-methods-bech32-to-hex-default)
5. [signTx Split Into Two Methods](#5-signtx-split-into-two-methods)
6. [Return Type Changes: High-Level to CBOR Hex](#6-return-type-changes-high-level-to-cbor-hex)
7. [signData Parameter Order Change](#7-signdata-parameter-order-change)
8. [Removed Methods and Replacements](#8-removed-methods-and-replacements)
9. [Type Reference Updates](#9-type-reference-updates)
10. [Static Method Changes](#10-static-method-changes)
11. [Quick Reference: Method Migration Map](#11-quick-reference-method-migration-map)
12. [Gotchas and Silent Failures](#12-gotchas-and-silent-failures)

---

## 1. Architecture Overview

### OLD Architecture
- **Class:** `MeshWallet` implements `IWallet`
- **Package:** `@meshsdk/wallet` or re-exported from `@meshsdk/core`
- **Internal engine:** `EmbeddedWallet`
- **Initialization:** `new MeshWallet(options)` then `await wallet.init()`
- **Address format default:** bech32 (e.g., `addr_test1qz...`)
- **Dependencies:** `@meshsdk/core-cst`

### NEW Architecture
- **Base class:** `CardanoHeadlessWallet` implements `ICardanoWallet`
- **Convenience class:** `MeshCardanoHeadlessWallet` extends `CardanoHeadlessWallet`
- **Package:** `@meshsdk/wallet`
- **Internal engine:** `AddressManager` + `CardanoSigner`
- **Initialization:** Static async factory methods (no constructor, no init)
- **Address format default:** hex (raw bytes)
- **Dependencies:** `@cardano-sdk/core` + `@cardano-sdk/util`

### Key Principle
The base class (`CardanoHeadlessWallet`) follows CIP-30 strictly — all methods return raw hex/CBOR. The convenience class (`MeshCardanoHeadlessWallet`) adds `*Bech32()` and `*Mesh()` methods that return human-friendly formats matching the OLD behavior.

**IMPORTANT:** You almost certainly want to use `MeshCardanoHeadlessWallet`, not `CardanoHeadlessWallet`, as it provides the convenience methods that match old `MeshWallet` behavior.

---

## 2. Import Changes

### Rule: Update all MeshWallet imports

**SEARCH** for any of these import patterns:
```typescript
import { MeshWallet } from "@meshsdk/wallet";
import { MeshWallet } from "@meshsdk/core";
import { MeshWallet, ... } from "@meshsdk/core";
import { MeshWallet, ... } from "@meshsdk/wallet";
```

**REPLACE** with:
```typescript
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
```

**IMPORTANT NOTES:**
- If the old import was from `@meshsdk/core`, change the package to `@meshsdk/wallet`
- If other items were imported alongside `MeshWallet` from `@meshsdk/core` (like `BlockfrostProvider`, `OfflineFetcher`), keep those imports separate:
  ```typescript
  import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
  import { BlockfrostProvider, OfflineFetcher } from "@meshsdk/core";
  ```
- You may also need to import `AddressType` for the construction changes:
  ```typescript
  import { MeshCardanoHeadlessWallet, AddressType } from "@meshsdk/wallet";
  ```

---

## 3. Construction Pattern Migration

### Rule: Replace `new MeshWallet()` + `init()` with static factory methods

The OLD pattern used a constructor with a `key` object and required calling `init()` afterward. The NEW pattern uses static async factory methods that handle initialization internally.

**NEW required config field:** `walletAddressType` — must be either `AddressType.Base` (includes staking) or `AddressType.Enterprise` (no staking). If the old code did not specify `accountType` or used `"payment"`, use `AddressType.Base`.

### 3a. Mnemonic-based wallets

**SEARCH:**
```typescript
const wallet = new MeshWallet({
  networkId: <NETWORK_ID>,
  fetcher: <FETCHER>,
  submitter: <SUBMITTER>,
  key: {
    type: "mnemonic",
    words: <MNEMONIC_WORDS>,
  },
});
await wallet.init();
```

**REPLACE:**
```typescript
const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic: <MNEMONIC_WORDS>,
  networkId: <NETWORK_ID>,
  walletAddressType: AddressType.Base,
  fetcher: <FETCHER>,
  submitter: <SUBMITTER>,
});
```

**NOTES:**
- `<MNEMONIC_WORDS>` must be `string[]` (same as before).
- If the old code had `mnemonic.split(" ")`, keep that — the type is still `string[]`.
- Remove any standalone `await wallet.init()` calls — initialization is handled by the factory.
- If `fetcher` or `submitter` were `undefined`, you can omit them.

### 3b. Root key (bech32 private key) wallets

**SEARCH:**
```typescript
new MeshWallet({
  networkId: <NETWORK_ID>,
  key: {
    type: "root",
    bech32: <BECH32_KEY>,
  },
  ...
});
```

**REPLACE:**
```typescript
await MeshCardanoHeadlessWallet.fromBip32Root({
  bech32: <BECH32_KEY>,
  networkId: <NETWORK_ID>,
  walletAddressType: AddressType.Base,
  fetcher: <FETCHER>,
  submitter: <SUBMITTER>,
});
```

### 3c. BIP32 bytes wallets

**SEARCH:**
```typescript
new MeshWallet({
  networkId: <NETWORK_ID>,
  key: {
    type: "bip32Bytes",
    bip32Bytes: <BYTES>,
  },
  ...
});
```

**REPLACE:**
```typescript
await MeshCardanoHeadlessWallet.fromBip32RootHex({
  hex: <HEX_STRING>,  // NOTE: now expects hex string, not Uint8Array
  networkId: <NETWORK_ID>,
  walletAddressType: AddressType.Base,
  fetcher: <FETCHER>,
  submitter: <SUBMITTER>,
});
```

**NOTE:** If the old code passed `Uint8Array`, convert to hex string first.

### 3d. CLI key wallets

**SEARCH:**
```typescript
new MeshWallet({
  networkId: <NETWORK_ID>,
  key: {
    type: "cli",
    payment: <PAYMENT_KEY>,
    stake: <STAKE_KEY>,
  },
  ...
});
```

**REPLACE:**
```typescript
await MeshCardanoHeadlessWallet.fromCredentialSources({
  paymentCredentialSource: <PAYMENT_CREDENTIAL_SOURCE>,
  stakeCredentialSource: <STAKE_CREDENTIAL_SOURCE>,
  networkId: <NETWORK_ID>,
  walletAddressType: AddressType.Base,
  fetcher: <FETCHER>,
  submitter: <SUBMITTER>,
});
```

**NOTE:** The credential source format differs from the old CLI key format. You will need to construct appropriate `CredentialSource` objects from the CLI keys. Consult the `@meshsdk/wallet` docs for `CredentialSource` types.

### 3e. Address-only (read-only) wallets

**SEARCH:**
```typescript
new MeshWallet({
  networkId: <NETWORK_ID>,
  key: {
    type: "address",
    address: <BECH32_ADDRESS>,
  },
  fetcher: <FETCHER>,
  submitter: <SUBMITTER>,
});
```

**REPLACE:**
```typescript
await MeshCardanoHeadlessWallet.fromCredentialSources({
  paymentCredentialSource: { type: "keyHash", hash: <PAYMENT_KEY_HASH> },
  stakeCredentialSource: { type: "keyHash", hash: <STAKE_KEY_HASH> },
  networkId: <NETWORK_ID>,
  walletAddressType: AddressType.Base,
  fetcher: <FETCHER>,
  submitter: <SUBMITTER>,
});
```

**NOTE:** You must decompose the bech32 address into its payment and stake key hashes. The old `MeshWallet` did this internally via `buildAddressFromBech32Address()`. You may need a helper to extract these hashes using `@cardano-sdk/core`:
```typescript
import { Cardano } from "@cardano-sdk/core";
const addr = Cardano.Address.fromBech32(bech32Address);
const baseAddr = addr.asBase();
const paymentHash = baseAddr?.getPaymentCredential().hash;
const stakeHash = baseAddr?.getStakeCredential().hash;
```

### 3f. Remove all `await wallet.init()` calls

**SEARCH** for any standalone calls:
```typescript
await wallet.init();
await cardanoWallet.init();
```

**REPLACE:** Delete these lines entirely. Factory methods handle initialization.

---

## 4. Address Methods: bech32 to hex Default

### Critical Change
In the OLD API, address methods returned **bech32** strings by default (e.g., `addr_test1qz...`).
In the NEW API, the same method names return **hex** strings. New `*Bech32()` methods return bech32.

### Rule: Replace address method calls with Bech32 variants

If your code expects bech32 addresses (which is almost always the case for display, transaction building, or API calls), you MUST switch to the Bech32 variant.

| OLD call | NEW call |
|----------|----------|
| `wallet.getChangeAddress()` | `wallet.getChangeAddressBech32()` |
| `wallet.getUsedAddresses()` | `wallet.getUsedAddressesBech32()` |
| `wallet.getUnusedAddresses()` | `wallet.getUnusedAddressesBech32()` |
| `wallet.getRewardAddresses()` | `wallet.getRewardAddressesBech32()` |

**SEARCH** for these patterns (with or without `await`):
```typescript
await wallet.getChangeAddress()
await wallet.getChangeAddress("payment")
wallet.getChangeAddress()
```

**REPLACE** with:
```typescript
await wallet.getChangeAddressBech32()
```

**SEARCH:**
```typescript
await wallet.getUsedAddresses()
```

**REPLACE:**
```typescript
await wallet.getUsedAddressesBech32()
```

**SEARCH:**
```typescript
await wallet.getUnusedAddresses()
```

**REPLACE:**
```typescript
await wallet.getUnusedAddressesBech32()
```

**SEARCH:**
```typescript
await wallet.getRewardAddresses()
```

**REPLACE:**
```typescript
await wallet.getRewardAddressesBech32()
```

**NOTE on `addressType` parameter:** The OLD `getChangeAddress()` accepted an optional `addressType` parameter (`"payment"` | `"enterprise"`). The NEW `getChangeAddressBech32()` does NOT accept this parameter. The address type is now determined at wallet construction time via `walletAddressType`. If you had code passing `"enterprise"`, you need to construct the wallet with `AddressType.Enterprise` instead.

**NOTE on the OLD `*Hex()` methods:** The old `getChangeAddressHex()`, `getUsedAddressesHex()`, `getUnusedAddressesHex()`, and `getRewardAddressesHex()` methods are REMOVED. The base `getChangeAddress()`, `getUsedAddresses()`, etc. now return hex by default, so if you actually need hex, use the base methods.

---

## 5. signTx Split Into Two Methods

### Critical Change
**OLD:** `signTx(unsignedTx, partialSign?, returnFullTx?)` — by default returns the **full signed transaction** (`returnFullTx=true`).

**NEW:** Two separate methods:
- `signTx(tx, partialSign?)` — returns **witness set CBOR only** (just the signatures)
- `signTxReturnFullTx(tx, partialSign?)` — returns the **full signed transaction**

### Rule: Replace signTx calls based on usage

**Case A: signTx with default behavior (returnFullTx=true) or explicit returnFullTx=true**

This is the most common case. The caller expects a full signed transaction back.

**SEARCH:**
```typescript
await wallet.signTx(unsignedTx)
await wallet.signTx(unsignedTx, false)
await wallet.signTx(unsignedTx, true)
await wallet.signTx(unsignedTx, false, true)
await wallet.signTx(unsignedTx, true, true)
```

**REPLACE:**
```typescript
await wallet.signTxReturnFullTx(unsignedTx)
await wallet.signTxReturnFullTx(unsignedTx, false)
await wallet.signTxReturnFullTx(unsignedTx, true)
await wallet.signTxReturnFullTx(unsignedTx, false)
await wallet.signTxReturnFullTx(unsignedTx, true)
```

**Case B: signTx with returnFullTx=false (witness set only)**

The caller explicitly wanted just the witness set.

**SEARCH:**
```typescript
await wallet.signTx(unsignedTx, false, false)
await wallet.signTx(unsignedTx, true, false)
```

**REPLACE:**
```typescript
await wallet.signTx(unsignedTx, false)
await wallet.signTx(unsignedTx, true)
```

### Rule: Replace signTxs calls

**SEARCH:**
```typescript
await wallet.signTxs(unsignedTxs)
await wallet.signTxs(unsignedTxs, partialSign)
await wallet.signTxs(unsignedTxs, partialSign, returnFullTx)
```

**REPLACE:** The `signTxs` method may not exist on the new class. Implement manually:
```typescript
const signedTxs = [];
for (const unsignedTx of unsignedTxs) {
  signedTxs.push(await wallet.signTxReturnFullTx(unsignedTx, partialSign));
}
```

### DANGER: Silent Failure
Both the old and new `signTx` return `Promise<string>`. TypeScript will NOT catch this at compile time. If you forget to change `signTx` to `signTxReturnFullTx`, your code will compile but fail at runtime because you'll be submitting a witness set CBOR as if it were a full transaction.

---

## 6. Return Type Changes: High-Level to CBOR Hex

### 6a. getBalance()

**OLD:** Returns `Asset[]` — array of `{ unit: string, quantity: string }` objects.
**NEW base:** Returns `string` — CBOR hex encoded value.
**NEW Mesh:** `getBalanceMesh()` returns `Asset[]` (matches old behavior).

**SEARCH:**
```typescript
await wallet.getBalance()
```

**REPLACE** (if you need Asset[] format):
```typescript
await wallet.getBalanceMesh()
```

### 6b. getUtxos()

**OLD:** Returns `UTxO[]` — array of Mesh UTxO objects.
**NEW base:** Returns `string[]` — array of CBOR hex strings.
**NEW Mesh:** `getUtxosMesh()` returns `UTxO[]` (matches old behavior).

**SEARCH:**
```typescript
await wallet.getUtxos()
await wallet.getUtxos("payment")
await wallet.getUtxos("enterprise")
```

**REPLACE** (if you need UTxO[] format):
```typescript
await wallet.getUtxosMesh()
```

**NOTE:** The `addressType` parameter is removed. Address type is determined at construction.

### 6c. getCollateral()

**OLD:** Returns `UTxO[]` — array of Mesh UTxO objects.
**NEW base:** Returns `string[]` — array of CBOR hex strings.
**NEW Mesh:** `getCollateralMesh()` returns `UTxO[]` (matches old behavior).

**SEARCH:**
```typescript
await wallet.getCollateral()
await wallet.getCollateral("payment")
```

**REPLACE** (if you need UTxO[] format):
```typescript
await wallet.getCollateralMesh()
```

---

## 7. signData Parameter Order Change

### Critical Change
**OLD:** `signData(payload: string, address?: string)` — payload first, address optional (defaults to change address).
**NEW:** `signData(addressBech32: string, data: string)` — address first and REQUIRED, data second.

**SEARCH:**
```typescript
await wallet.signData(payload)
await wallet.signData(payload, address)
```

**REPLACE:**
```typescript
// If no address was provided, you must now explicitly get the address first:
const address = await wallet.getChangeAddressBech32();
await wallet.signData(address, payload)

// If address was provided:
await wallet.signData(address, payload)  // note: swapped order
```

**DANGER:** Both parameters are `string`, so TypeScript will NOT catch a parameter swap at compile time.

---

## 8. Removed Methods and Replacements

### 8a. getAddresses() — REMOVED

**OLD:** `wallet.getAddresses()` — synchronous, returns object with all address variants.
**NEW:** No direct equivalent. Use individual async methods.

**SEARCH:**
```typescript
wallet.getAddresses()
const addresses = wallet.getAddresses()
const addresses = cardanoWallet.getAddresses()
```

**REPLACE** with individual calls as needed:
```typescript
const baseAddressBech32 = await wallet.getChangeAddressBech32();
const rewardAddressBech32 = (await wallet.getRewardAddressesBech32())[0];
// Access hex variants via base class methods:
const baseAddressHex = await wallet.getChangeAddress();
const rewardAddressHex = (await wallet.getRewardAddresses())[0];
```

**NOTE:** The old `getAddresses()` was synchronous. The new individual methods are all async. Callers must be updated to use `await`.

**If the old code accessed specific properties like:**
```typescript
const addresses = wallet.getAddresses();
addresses.baseAddressBech32    // → await wallet.getChangeAddressBech32()
addresses.enterpriseAddressBech32  // → construct wallet with AddressType.Enterprise, then getChangeAddressBech32()
addresses.rewardAddressBech32  // → (await wallet.getRewardAddressesBech32())[0]
```

### 8b. getUsedAddress() (sync) — REMOVED

**OLD:** `wallet.getUsedAddress(addressType?)` — synchronous, returns `Address` object.
**NEW:** No direct equivalent.

**SEARCH:**
```typescript
wallet.getUsedAddress()
wallet.getUsedAddress("payment")
wallet.cardano.getUsedAddress()
```

**REPLACE:**
```typescript
// If you need a bech32 string:
(await wallet.getUsedAddressesBech32())[0]

// If you need a hex string:
(await wallet.getUsedAddresses())[0]
```

**NOTE:** This was synchronous in the old API. The replacement is async. Update calling code accordingly.

### 8c. getUsedUTxOs() — REMOVED

**SEARCH:**
```typescript
await wallet.getUsedUTxOs()
await wallet.getUsedUTxOs("payment")
```

**REPLACE:**
```typescript
await wallet.getUtxosMesh()
```

### 8d. getAssets() — REMOVED

**SEARCH:**
```typescript
await wallet.getAssets()
```

**REPLACE** (manual derivation):
```typescript
import { POLICY_ID_LENGTH, resolveFingerprint, toUTF8 } from "@meshsdk/common";

const balance = await wallet.getBalanceMesh();
const assets = balance
  .filter((v) => v.unit !== "lovelace")
  .map((v) => {
    const policyId = v.unit.slice(0, POLICY_ID_LENGTH);
    const assetName = v.unit.slice(POLICY_ID_LENGTH);
    const fingerprint = resolveFingerprint(policyId, assetName);
    return { unit: v.unit, policyId, assetName: toUTF8(assetName), fingerprint, quantity: v.quantity };
  });
```

### 8e. getLovelace() — REMOVED

**SEARCH:**
```typescript
await wallet.getLovelace()
```

**REPLACE:**
```typescript
const balance = await wallet.getBalanceMesh();
const lovelace = balance.find((v) => v.unit === "lovelace")?.quantity ?? "0";
```

### 8f. getPolicyIdAssets() — REMOVED

**SEARCH:**
```typescript
await wallet.getPolicyIdAssets(policyId)
```

**REPLACE:** Derive from `getBalanceMesh()` + filter by policyId prefix.

### 8g. getPolicyIds() — REMOVED

**SEARCH:**
```typescript
await wallet.getPolicyIds()
```

**REPLACE:** Derive from `getBalanceMesh()` + extract unique policy ID prefixes.

### 8h. createCollateral() — REMOVED

**SEARCH:**
```typescript
await wallet.createCollateral()
```

**REPLACE:** Build the transaction manually:
```typescript
// Build a transaction sending 5 ADA to yourself
const address = await wallet.getChangeAddressBech32();
// Use your transaction builder to send 5000000 lovelace to `address`
// Sign with signTxReturnFullTx, then submitTx
```

### 8i. getPubDRepKey() — REMOVED

**SEARCH:**
```typescript
wallet.getPubDRepKey()
```

**REPLACE:** Not yet available in the new API. If needed, track upstream for DRep support.

### 8j. getDRep() — REMOVED

**SEARCH:**
```typescript
await wallet.getDRep()
```

**REPLACE:** Not yet available in the new API.

### 8k. getExtensions() — REMOVED

**SEARCH:**
```typescript
await wallet.getExtensions()
```

**REPLACE:** Not yet available. Return `[]` if needed.

### 8l. getRegisteredPubStakeKeys() / getUnregisteredPubStakeKeys() — REMOVED

These were stubs returning `undefined` in the old code. Remove any calls.

### 8m. getCollateralUnspentOutput() — REMOVED (was semi-internal)

**REPLACE:** Use `getCollateralMesh()` for UTxO[] or `getCollateral()` for CBOR hex.

### 8n. getUnspentOutputs() — REMOVED (was semi-internal)

**REPLACE:** Use `fetchAccountUtxos()` (now public on CardanoHeadlessWallet) for UTxO[], or `getUtxos()` for CBOR hex.

---

## 9. Type Reference Updates

### Rule: Replace all MeshWallet type annotations

**SEARCH** in type positions (variable declarations, function parameters, return types, generics):
```typescript
MeshWallet
```

**REPLACE:**
```typescript
MeshCardanoHeadlessWallet
```

**Common patterns:**
```typescript
// OLD
wallet: MeshWallet
cardanoWallet: MeshWallet
cardano: MeshWallet
Promise<MeshWallet>

// NEW
wallet: MeshCardanoHeadlessWallet
cardanoWallet: MeshCardanoHeadlessWallet
cardano: MeshCardanoHeadlessWallet
Promise<MeshCardanoHeadlessWallet>
```

---

## 10. Static Method Changes

### 10a. MeshWallet.brew() — REMOVED

**OLD:**
```typescript
const mnemonic = MeshWallet.brew() as string[];          // generates mnemonic
const privateKey = MeshWallet.brew(true) as string;       // generates private key
const mnemonic = MeshWallet.brew(false, 256) as string[]; // custom strength
```

**REPLACE:** Use an external mnemonic generation library (e.g., `bip39`):
```typescript
import { generateMnemonic } from "bip39";
const mnemonic = generateMnemonic(256).split(" ");
```

Or check if `@meshsdk/common` or `@meshsdk/core-cst` still exports a mnemonic generation utility.

---

## 11. Quick Reference: Method Migration Map

| OLD Method | NEW Method | Notes |
|-----------|-----------|-------|
| `new MeshWallet({...})` | `await MeshCardanoHeadlessWallet.fromMnemonic({...})` | See Section 3 for all factory methods |
| `wallet.init()` | _(removed)_ | Factory methods handle init |
| `wallet.getChangeAddress()` | `wallet.getChangeAddressBech32()` | Was bech32, base now returns hex |
| `wallet.getChangeAddressHex()` | `wallet.getChangeAddress()` | Base method now returns hex |
| `wallet.getUsedAddresses()` | `wallet.getUsedAddressesBech32()` | Was bech32, base now returns hex |
| `wallet.getUsedAddressesHex()` | `wallet.getUsedAddresses()` | Base method now returns hex |
| `wallet.getUnusedAddresses()` | `wallet.getUnusedAddressesBech32()` | Was bech32, base now returns hex |
| `wallet.getUnusedAddressesHex()` | `wallet.getUnusedAddresses()` | Base method now returns hex |
| `wallet.getRewardAddresses()` | `wallet.getRewardAddressesBech32()` | Was bech32, base now returns hex |
| `wallet.getRewardAddressesHex()` | `wallet.getRewardAddresses()` | Base method now returns hex |
| `wallet.signTx(tx)` | `wallet.signTxReturnFullTx(tx)` | Old default was full tx; new signTx returns witness set only |
| `wallet.signTx(tx, partial, false)` | `wallet.signTx(tx, partial)` | Witness-set-only behavior |
| `wallet.signTx(tx, partial, true)` | `wallet.signTxReturnFullTx(tx, partial)` | Full tx behavior |
| `wallet.signTxs(txs, partial)` | _(removed)_ | Implement loop with signTxReturnFullTx |
| `wallet.signData(payload, addr?)` | `wallet.signData(addr, payload)` | Parameter order swapped, addr required |
| `wallet.getBalance()` | `wallet.getBalanceMesh()` | Old returned Asset[], new base returns CBOR hex |
| `wallet.getUtxos()` | `wallet.getUtxosMesh()` | Old returned UTxO[], new base returns CBOR hex strings |
| `wallet.getUtxosHex()` | `wallet.getUtxos()` | Base method now returns CBOR hex |
| `wallet.getCollateral()` | `wallet.getCollateralMesh()` | Old returned UTxO[], new base returns CBOR hex strings |
| `wallet.getCollateralHex()` | `wallet.getCollateral()` | Base method now returns CBOR hex |
| `wallet.getAddresses()` | _(removed)_ | Use individual getChangeAddressBech32(), etc. |
| `wallet.getUsedAddress()` | `(await wallet.getUsedAddressesBech32())[0]` | Was sync, now async |
| `wallet.getUsedUTxOs()` | `wallet.getUtxosMesh()` | Renamed |
| `wallet.getUnspentOutputs()` | `wallet.fetchAccountUtxos()` | Now public |
| `wallet.getAssets()` | _(removed)_ | Derive from getBalanceMesh() |
| `wallet.getLovelace()` | _(removed)_ | Derive from getBalanceMesh() |
| `wallet.getPolicyIdAssets(id)` | _(removed)_ | Derive from getBalanceMesh() |
| `wallet.getPolicyIds()` | _(removed)_ | Derive from getBalanceMesh() |
| `wallet.createCollateral()` | _(removed)_ | Build tx manually |
| `wallet.getPubDRepKey()` | _(removed)_ | Not yet available |
| `wallet.getDRep()` | _(removed)_ | Not yet available |
| `wallet.getExtensions()` | _(removed)_ | Not yet available |
| `MeshWallet.brew()` | _(removed)_ | Use bip39 or similar |
| `wallet.getNetworkId()` | `wallet.getNetworkId()` | Unchanged |
| `wallet.submitTx(tx)` | `wallet.submitTx(tx)` | Unchanged |

---

## 12. Gotchas and Silent Failures

These are the most dangerous changes because they compile fine but fail at runtime:

### 12a. signTx returns witness set, not full tx
- **Symptom:** Transaction submission fails with deserialization error
- **Cause:** `signTx()` now returns a witness set CBOR string, not a full transaction
- **Fix:** Use `signTxReturnFullTx()` instead

### 12b. getChangeAddress returns hex, not bech32
- **Symptom:** Address validation fails, blockchain queries return empty results, or "invalid address" errors
- **Cause:** Hex string passed where bech32 was expected
- **Fix:** Use `getChangeAddressBech32()` instead

### 12c. signData parameter swap
- **Symptom:** Signing fails or produces invalid signature
- **Cause:** `signData(payload, address)` was called but new API expects `signData(address, payload)`
- **Fix:** Swap the parameters

### 12d. getBalance returns CBOR hex, not Asset[]
- **Symptom:** Code tries to `.find()` or `.filter()` on a string
- **Cause:** `getBalance()` now returns a single CBOR hex string
- **Fix:** Use `getBalanceMesh()` for Asset[] format

### 12e. Construction is now async-only
- **Symptom:** `wallet` is a Promise, not a wallet instance; methods fail with "not a function"
- **Cause:** Factory methods return `Promise<MeshCardanoHeadlessWallet>`, must be awaited
- **Fix:** Ensure `await` on the factory method call

---

## Appendix: Source References

- **Old MeshWallet source:** `https://github.com/MeshJS/mesh/blob/main/packages/mesh-wallet/src/mesh/index.ts`
- **New MeshCardanoHeadlessWallet source:** `https://github.com/MeshJS/wallet/blob/main/src/cardano/wallet/mesh/mesh-wallet.ts`
- **New CardanoHeadlessWallet base:** `https://github.com/MeshJS/wallet/blob/main/src/cardano/wallet/mesh/cardano-base-wallet.ts`
