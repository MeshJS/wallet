# BrowserWallet Migration Guide: @meshsdk/wallet Breaking Changes

> **Purpose:** This document is written for LLM agents (Claude, etc.) to read and deterministically apply all required code changes when migrating from the OLD `BrowserWallet` (from `@meshsdk/core` or `@meshsdk/wallet`) to the NEW `MeshCardanoBrowserWallet` (from `@meshsdk/wallet`).
>
> **Instructions to agent:** Read this entire document before making any changes. Apply changes file-by-file. Each section contains SEARCH patterns and REPLACE rules. Follow them exactly.
>
> **Related:** See `mesh-wallet-migration.md` for the headless/server-side `MeshWallet` migration. Many patterns are identical.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Import Changes](#2-import-changes)
3. [Enable / Construction Pattern](#3-enable--construction-pattern)
4. [Address Methods: bech32 to hex Default](#4-address-methods-bech32-to-hex-default)
5. [signTx Split Into Two Methods](#5-signtx-split-into-two-methods)
6. [Return Type Changes: High-Level to CBOR Hex](#6-return-type-changes-high-level-to-cbor-hex)
7. [signData Parameter Changes](#7-signdata-parameter-changes)
8. [signTxs Removal](#8-signtxs-removal)
9. [Removed Methods and Replacements](#9-removed-methods-and-replacements)
10. [Type Reference Updates](#10-type-reference-updates)
11. [Static Method Changes](#11-static-method-changes)
12. [Window vs globalThis](#12-window-vs-globalthis)
13. [Quick Reference: Method Migration Map](#13-quick-reference-method-migration-map)
14. [Gotchas and Silent Failures](#14-gotchas-and-silent-failures)

---

## 1. Architecture Overview

### OLD Architecture
- **Class:** `BrowserWallet` implements `IWallet`
- **Package:** `@meshsdk/core` (re-exported) or `@meshsdk/wallet`
- **Construction:** Private constructor, use `BrowserWallet.enable(walletName)`
- **Internal behavior:** Receives raw CIP-30 hex/CBOR from browser wallet, **converts to bech32/Mesh types** before returning
- **Dependencies:** `@meshsdk/core-cst` for serialization/deserialization
- **Global access:** `window.cardano`

### NEW Architecture
- **Base class:** `CardanoBrowserWallet` implements `ICardanoWallet`
  - Direct CIP-30 passthrough — returns raw hex/CBOR with **no conversion**
- **Convenience class:** `MeshCardanoBrowserWallet` extends `CardanoBrowserWallet`
  - Adds `*Bech32()` and `*Mesh()` methods that convert to human-friendly formats (matching old behavior)
  - Adds `signTxReturnFullTx()` that merges witness sets (matching old signTx default)
- **Package:** `@meshsdk/wallet`
- **Dependencies:** `@cardano-sdk/core` + `@cardano-sdk/util`
- **Global access:** `globalThis.cardano` (works in both browser and SSR environments)

### Key Principle
The base class (`CardanoBrowserWallet`) is a thin CIP-30 passthrough — all methods return exactly what the browser wallet returns (hex addresses, CBOR values, witness set CBOR). The convenience class (`MeshCardanoBrowserWallet`) adds conversion methods matching the OLD `BrowserWallet` behavior.

**IMPORTANT:** You almost certainly want `MeshCardanoBrowserWallet`, not `CardanoBrowserWallet`, as it provides the convenience methods that match old `BrowserWallet` behavior.

---

## 2. Import Changes

### Rule: Update all BrowserWallet imports

**SEARCH** for any of these import patterns:
```typescript
import { BrowserWallet } from "@meshsdk/core";
import { BrowserWallet } from "@meshsdk/wallet";
import { BrowserWallet, ... } from "@meshsdk/core";
import { BrowserWallet, ... } from "@meshsdk/wallet";
```

**REPLACE** with:
```typescript
import { MeshCardanoBrowserWallet } from "@meshsdk/wallet";
```

**IMPORTANT NOTES:**
- If the old import was from `@meshsdk/core`, change the package to `@meshsdk/wallet`.
- If other items were imported alongside `BrowserWallet` from `@meshsdk/core` (like `BlockfrostProvider`, `Transaction`), keep those imports separate:
  ```typescript
  import { MeshCardanoBrowserWallet } from "@meshsdk/wallet";
  import { BlockfrostProvider, Transaction } from "@meshsdk/core";
  ```

---

## 3. Enable / Construction Pattern

### Rule: Replace BrowserWallet.enable() with MeshCardanoBrowserWallet.enable()

The enable pattern is structurally the same — static async method that returns a wallet instance. Only the class name changes.

**SEARCH:**
```typescript
const wallet = await BrowserWallet.enable(walletName);
const wallet = await BrowserWallet.enable(walletName, extensions);
```

**REPLACE:**
```typescript
const wallet = await MeshCardanoBrowserWallet.enable(walletName);
const wallet = await MeshCardanoBrowserWallet.enable(walletName, extensions);
```

**NOTES:**
- The `extensions` parameter type is the same (`Extension[]` / `{ cip: number }[]`).
- The return type changes from `BrowserWallet` to `MeshCardanoBrowserWallet`.
- The constructor is now public (was private), but you should still use `enable()` as the primary entry point.

---

## 4. Address Methods: bech32 to hex Default

### Critical Change
In the OLD API, the `BrowserWallet` **internally converted** CIP-30 hex addresses to bech32 before returning them. In the NEW API, the base class returns the raw hex from CIP-30. New `*Bech32()` methods on `MeshCardanoBrowserWallet` restore the old behavior.

### OLD internal conversion example (getChangeAddress):
```typescript
// OLD BrowserWallet internally did:
async getChangeAddress(): Promise<string> {
  const changeAddress = await this._walletInstance.getChangeAddress(); // hex from CIP-30
  return addressToBech32(deserializeAddress(changeAddress));           // converted to bech32
}
```

### NEW base class (no conversion):
```typescript
// NEW CardanoBrowserWallet just passes through:
async getChangeAddress(): Promise<string> {
  return this.walletInstance.getChangeAddress(); // raw hex from CIP-30
}
```

### NEW convenience class (explicit bech32):
```typescript
// NEW MeshCardanoBrowserWallet adds:
async getChangeAddressBech32(): Promise<string> {
  const addressHex = await this.getChangeAddress();
  const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addressHex));
  return cardanoAddr.toBech32();
}
```

### Rule: Replace address method calls with Bech32 variants

| OLD call | NEW call |
|----------|----------|
| `wallet.getChangeAddress()` | `wallet.getChangeAddressBech32()` |
| `wallet.getUsedAddresses()` | `wallet.getUsedAddressesBech32()` |
| `wallet.getUnusedAddresses()` | `wallet.getUnusedAddressesBech32()` |
| `wallet.getRewardAddresses()` | `wallet.getRewardAddressesBech32()` |

**SEARCH:**
```typescript
await wallet.getChangeAddress()
wallet.getChangeAddress()
```

**REPLACE:**
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

**NOTE:** If any code explicitly needed hex addresses (rare for BrowserWallet consumers), use the base methods `getChangeAddress()`, `getUsedAddresses()`, etc. — they now return hex by default.

---

## 5. signTx Split Into Two Methods

### Critical Change
**OLD:** `signTx(unsignedTx, partialSign?, returnFullTx?)` — by default (`returnFullTx=true`) the OLD BrowserWallet:
1. Called `walletInstance.signTx()` to get the witness set from the browser wallet
2. Merged the witness set into the original transaction via `addBrowserWitnesses()`
3. Returned the **full signed transaction**

**NEW:** Two separate methods:
- `signTx(tx, partialSign?)` — returns the **witness set CBOR only** (raw CIP-30 response, no merging)
- `signTxReturnFullTx(tx, partialSign?)` — merges witnesses and returns the **full signed transaction** (matches old default behavior)

### Rule: Replace signTx calls based on usage

**Case A: signTx with default behavior (the common case) or explicit returnFullTx=true**

**SEARCH:**
```typescript
await wallet.signTx(unsignedTx)
await wallet.signTx(unsignedTx, false)
await wallet.signTx(unsignedTx, true)
await wallet.signTx(unsignedTx, false, true)
await wallet.signTx(unsignedTx, true, true)
await wallet.signTx(tx)
await wallet.signTx(tx, partialSign)
```

**REPLACE:**
```typescript
await wallet.signTxReturnFullTx(unsignedTx)
await wallet.signTxReturnFullTx(unsignedTx, false)
await wallet.signTxReturnFullTx(unsignedTx, true)
await wallet.signTxReturnFullTx(unsignedTx, false)
await wallet.signTxReturnFullTx(unsignedTx, true)
await wallet.signTxReturnFullTx(tx)
await wallet.signTxReturnFullTx(tx, partialSign)
```

**Case B: signTx with explicit returnFullTx=false (witness set only)**

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

### DANGER: Silent Failure
Both old and new return `Promise<string>`. TypeScript will NOT catch this. If you forget to change `signTx` to `signTxReturnFullTx`, you'll submit a witness set as a full transaction, which will fail at the blockchain level with a deserialization error.

---

## 6. Return Type Changes: High-Level to CBOR Hex

### 6a. getBalance()

**OLD:** Returns `Asset[]` — array of `{ unit: string, quantity: string }`.
  - Internally did: `fromValue(deserializeValue(balance))` to convert CIP-30 CBOR to Mesh types.

**NEW base:** Returns `string` — raw CBOR hex from CIP-30.
**NEW Mesh:** `getBalanceMesh()` returns `Asset[]` (matches old behavior).

**SEARCH:**
```typescript
await wallet.getBalance()
```

**REPLACE** (if you need Asset[] format, which is almost always the case):
```typescript
await wallet.getBalanceMesh()
```

### 6b. getUtxos()

**OLD:** Returns `UTxO[]` — array of Mesh UTxO objects.
  - Internally did: `getUsedUTxOs()` → deserialize → `fromTxUnspentOutput()`.

**NEW base:** Returns `string[]` — array of CBOR hex strings (raw CIP-30).
**NEW Mesh:** `getUtxosMesh()` returns `UTxO[]` (matches old behavior).

**SEARCH:**
```typescript
await wallet.getUtxos()
```

**REPLACE** (if you need UTxO[] format):
```typescript
await wallet.getUtxosMesh()
```

### 6c. getCollateral()

**OLD:** Returns `UTxO[]` — array of Mesh UTxO objects.
  - Internally called `getCollateralUnspentOutput()` → deserialized → `fromTxUnspentOutput()`.

**NEW base:** Returns `string[]` — array of CBOR hex strings (raw CIP-30).
**NEW Mesh:** `getCollateralMesh()` returns `UTxO[]` (matches old behavior).

**SEARCH:**
```typescript
await wallet.getCollateral()
```

**REPLACE** (if you need UTxO[] format):
```typescript
await wallet.getCollateralMesh()
```

---

## 7. signData Parameter Changes

### Critical Change

**OLD BrowserWallet.signData:**
```typescript
async signData(
  payload: string,
  address?: string | undefined,
  convertFromUTF8 = true,
): Promise<DataSignature>
```
- `payload` first, `address` optional (defaults to first used address or change address)
- `convertFromUTF8` flag to auto-convert payload from UTF-8 to hex
- Internally handled DRep addresses (`drep1...`) via CIP-95
- Internally converted bech32 address to hex bytes for CIP-30 call

**NEW CardanoBrowserWallet.signData:**
```typescript
async signData(
  addressBech32: string,
  data: string,
): Promise<DataSignature>
```
- `addressBech32` first and **required**, `data` second
- No `convertFromUTF8` parameter — you must handle encoding yourself
- No auto-address resolution
- No DRep-specific handling

### Rule: Update signData calls

**SEARCH (no address provided):**
```typescript
await wallet.signData(payload)
await wallet.signData(payload, undefined)
await wallet.signData(payload, undefined, true)
await wallet.signData(payload, undefined, false)
```

**REPLACE:**
```typescript
// You must now explicitly get the address:
const address = (await wallet.getUsedAddressesBech32())[0] ?? await wallet.getChangeAddressBech32();
// If the old code used convertFromUTF8=true (the default), convert manually:
import { fromUTF8 } from "@meshsdk/common";
const hexPayload = fromUTF8(payload);
await wallet.signData(address, hexPayload)
```

**SEARCH (address provided, convertFromUTF8 default true):**
```typescript
await wallet.signData(payload, address)
await wallet.signData(payload, address, true)
```

**REPLACE:**
```typescript
import { fromUTF8 } from "@meshsdk/common";
const hexPayload = fromUTF8(payload);
await wallet.signData(address, hexPayload)  // note: parameter order swapped
```

**SEARCH (address provided, convertFromUTF8=false — payload already hex):**
```typescript
await wallet.signData(payload, address, false)
```

**REPLACE:**
```typescript
await wallet.signData(address, payload)  // note: parameter order swapped, no conversion needed
```

### DANGER: Silent Failure
Both parameters are `string`. Swapping them will compile but produce invalid signatures at runtime.

### NOTE on DRep addresses
The OLD `BrowserWallet.signData()` had special handling for `drep1...` addresses via `this._walletInstance.cip95.signData()`. The NEW base class does NOT have this. If your code signs data with DRep addresses, you'll need to handle CIP-95 signing separately.

---

## 8. signTxs Removal

### Critical Change

**OLD:** `signTxs(unsignedTxs, partialSign?)` — had wallet-specific logic:
- Typhon Wallet: called `walletInstance.signTxs(unsignedTxs, partialSign)`
- Other wallets: called `walletInstance.signTxs(unsignedTxs.map(cbor => ({cbor, partialSign})))` or `walletInstance.experimental.signTxs(...)`
- Merged witnesses into each transaction via `addBrowserWitnesses()`

**NEW:** `signTxs` method does NOT exist on `MeshCardanoBrowserWallet` or `CardanoBrowserWallet`.

**SEARCH:**
```typescript
await wallet.signTxs(unsignedTxs)
await wallet.signTxs(unsignedTxs, partialSign)
await wallet.signTxs(unsignedTxs, true)
await wallet.signTxs(unsignedTxs, false)
```

**REPLACE** (basic implementation — sign each tx individually):
```typescript
const signedTxs: string[] = [];
for (const unsignedTx of unsignedTxs) {
  const signedTx = await wallet.signTxReturnFullTx(unsignedTx, partialSign);
  signedTxs.push(signedTx);
}
```

**NOTE:** This loses the batch-signing UX (one approval instead of N). If your app relied on the browser wallet's native `signTxs` for batch UX, you'll need to either:
1. Access the raw wallet instance and call `signTxs` directly if available
2. Sign individually (multiple user approvals)

---

## 9. Removed Methods and Replacements

### 9a. getUsedAddress() — REMOVED

**OLD:** `wallet.getUsedAddress()` — returned `Address` object (deserialized from hex).

**SEARCH:**
```typescript
await wallet.getUsedAddress()
wallet.getUsedAddress()
```

**REPLACE:**
```typescript
// If you need a bech32 string:
(await wallet.getUsedAddressesBech32())[0]

// If you need a hex string:
(await wallet.getUsedAddresses())[0]
```

**NOTE:** The old method threw if no used addresses existed. The new approach returns `undefined` if the array is empty — add a check if needed.

### 9b. getUsedUTxOs() — REMOVED

**OLD:** `wallet.getUsedUTxOs()` — returned `TransactionUnspentOutput[]`.

**SEARCH:**
```typescript
await wallet.getUsedUTxOs()
```

**REPLACE:**
```typescript
// For CBOR hex strings:
await wallet.getUtxos()

// For Mesh UTxO objects:
await wallet.getUtxosMesh()
```

### 9c. getCollateralUnspentOutput(limit?) — REMOVED

**OLD:** `wallet.getCollateralUnspentOutput(limit)` — returned `TransactionUnspentOutput[]`, tried `walletInstance.getCollateral()` then `experimental.getCollateral()`.

**SEARCH:**
```typescript
await wallet.getCollateralUnspentOutput()
await wallet.getCollateralUnspentOutput(limit)
```

**REPLACE:**
```typescript
// For CBOR hex strings:
await wallet.getCollateral()

// For Mesh UTxO objects:
await wallet.getCollateralMesh()
```

**NOTE:** The `limit` parameter and the `experimental.getCollateral()` fallback are gone. If you need to limit results, slice the array yourself.

### 9d. getAssets() — REMOVED

**SEARCH:**
```typescript
await wallet.getAssets()
```

**REPLACE** (manual derivation):
```typescript
import { POLICY_ID_LENGTH, resolveFingerprint } from "@meshsdk/common";

const balance = await wallet.getBalanceMesh();
const assets = balance
  .filter((v) => v.unit !== "lovelace")
  .map((v) => {
    const policyId = v.unit.slice(0, POLICY_ID_LENGTH);
    const assetName = v.unit.slice(POLICY_ID_LENGTH);
    const fingerprint = resolveFingerprint(policyId, assetName);
    return { unit: v.unit, policyId, assetName, fingerprint, quantity: v.quantity };
  });
```

### 9e. getLovelace() — REMOVED

**SEARCH:**
```typescript
await wallet.getLovelace()
```

**REPLACE:**
```typescript
const balance = await wallet.getBalanceMesh();
const lovelace = balance.find((v) => v.unit === "lovelace")?.quantity ?? "0";
```

### 9f. getPolicyIdAssets(policyId) — REMOVED

**SEARCH:**
```typescript
await wallet.getPolicyIdAssets(policyId)
```

**REPLACE:** Derive from `getBalanceMesh()` + filter by policy ID prefix.

### 9g. getPolicyIds() — REMOVED

**SEARCH:**
```typescript
await wallet.getPolicyIds()
```

**REPLACE:** Derive from `getBalanceMesh()` + extract unique policy ID prefixes.

### 9h. getDRep() — REMOVED

**OLD:** Returned `{ publicKey, publicKeyHash, dRepIDCip105 }` or `undefined`. Internally called `getPubDRepKey()`, hashed it, and built the DRep ID.

**SEARCH:**
```typescript
await wallet.getDRep()
```

**REPLACE:** Not directly available. If needed, implement manually using CIP-95:
```typescript
// Access CIP-95 via the raw wallet instance if available
// This requires the wallet to have been enabled with CIP-95 extension
```

### 9i. getPubDRepKey() — REMOVED

**OLD:** `wallet.getPubDRepKey()` — accessed `walletInstance.cip95.getPubDRepKey()`.

**SEARCH:**
```typescript
await wallet.getPubDRepKey()
```

**REPLACE:** Not directly available. Access the raw CIP-95 API if needed.

### 9j. getRegisteredPubStakeKeys() — REMOVED

**SEARCH:**
```typescript
await wallet.getRegisteredPubStakeKeys()
```

**REPLACE:** Not directly available. Access via raw CIP-95 API.

### 9k. getUnregisteredPubStakeKeys() — REMOVED

**SEARCH:**
```typescript
await wallet.getUnregisteredPubStakeKeys()
```

**REPLACE:** Not directly available. Access via raw CIP-95 API.

### 9l. getExtensions() — REMOVED

**OLD:** Returned `number[]` of supported CIP numbers.

**SEARCH:**
```typescript
await wallet.getExtensions()
```

**REPLACE:** Not directly available. Return `[]` or check the raw wallet instance.

---

## 10. Type Reference Updates

### Rule: Replace all BrowserWallet type annotations

**SEARCH** in type positions (variable declarations, function parameters, return types, generics):
```typescript
BrowserWallet
```

**REPLACE:**
```typescript
MeshCardanoBrowserWallet
```

**Common patterns:**
```typescript
// OLD
wallet: BrowserWallet
const wallet: BrowserWallet = ...
Promise<BrowserWallet>
(wallet: BrowserWallet) => ...

// NEW
wallet: MeshCardanoBrowserWallet
const wallet: MeshCardanoBrowserWallet = ...
Promise<MeshCardanoBrowserWallet>
(wallet: MeshCardanoBrowserWallet) => ...
```

---

## 11. Static Method Changes

### 11a. getAvailableWallets() — REMOVED

**OLD:**
```typescript
const wallets = await BrowserWallet.getAvailableWallets();
const wallets = await BrowserWallet.getAvailableWallets({ injectFn: myInjector });
```

The `injectFn` parameter allowed custom wallet injection (e.g., for mobile WebViews).

**REPLACE:**
```typescript
// Basic usage (no injectFn):
const wallets = MeshCardanoBrowserWallet.getInstalledWallets();

// If you used injectFn, call it manually first:
await myInjector();
const wallets = MeshCardanoBrowserWallet.getInstalledWallets();
```

**NOTE:** `getInstalledWallets()` is synchronous in both old and new. The old `getAvailableWallets()` was async only because of the `injectFn` await.

### 11b. getInstalledWallets() — PRESERVED

**SEARCH:**
```typescript
BrowserWallet.getInstalledWallets()
```

**REPLACE:**
```typescript
MeshCardanoBrowserWallet.getInstalledWallets()
```

**NOTE:** The return type `Wallet[]` (id, name, icon, version) is the same. Internally, the new version uses `globalThis.cardano` instead of `window.cardano`.

### 11c. addBrowserWitnesses() — REMOVED

**OLD:**
```typescript
BrowserWallet.addBrowserWitnesses(unsignedTx, witnessSet)
```

This was a static helper that merged a witness set into a transaction.

**REPLACE:** This logic is now internal to `signTxReturnFullTx()`. If you called it directly:
```typescript
import { Serialization } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

// Manual witness merging:
const addedWitnesses = Serialization.TransactionWitnessSet.fromCbor(HexBlob(witnessSetCbor));
const transaction = Serialization.Transaction.fromCbor(Serialization.TxCBOR(unsignedTx));
let witnessSet = transaction.witnessSet();
let vkeys = witnessSet.vkeys();
let allVkeys = vkeys
  ? [...vkeys.values(), ...(addedWitnesses.vkeys()?.values() ?? [])]
  : [...(addedWitnesses.vkeys()?.values() ?? [])];
witnessSet.setVkeys(
  Serialization.CborSet.fromCore(
    allVkeys.map((vkw) => vkw.toCore()),
    Serialization.VkeyWitness.fromCore
  )
);
const signedTx = new Serialization.Transaction(
  transaction.body(), witnessSet, transaction.auxiliaryData()
);
const signedTxCbor = signedTx.toCbor();
```

### 11d. getSupportedExtensions() — REMOVED

**OLD:**
```typescript
BrowserWallet.getSupportedExtensions("eternl")
```

**REPLACE:** Access directly:
```typescript
const extensions = globalThis?.cardano?.["eternl"]?.supportedExtensions ?? [];
```

---

## 12. Window vs globalThis

### Change
- **OLD:** Uses `window.cardano` (browser-only)
- **NEW:** Uses `globalThis.cardano` (works in browser, SSR, Web Workers)

### Impact
If your code has type declarations or checks for `window.cardano`, consider updating:

**SEARCH:**
```typescript
declare global {
  interface Window {
    cardano: Cardano;
  }
}
```

**REPLACE** (if needed for your global type declarations):
```typescript
// The new wallet uses globalThis.cardano internally
// Update your type declarations accordingly if you access window.cardano directly
```

**SEARCH in runtime checks:**
```typescript
if (window === undefined) return [];
if (window.cardano === undefined) return [];
window.cardano[walletName]
```

**REPLACE:**
```typescript
if (globalThis === undefined) return [];
if (globalThis.cardano === undefined) return [];
globalThis.cardano[walletName]
```

---

## 13. Quick Reference: Method Migration Map

| OLD Method | NEW Method | Notes |
|-----------|-----------|-------|
| `BrowserWallet.enable(name, ext?)` | `MeshCardanoBrowserWallet.enable(name, ext?)` | Class name change only |
| `BrowserWallet.getAvailableWallets(opts?)` | `MeshCardanoBrowserWallet.getInstalledWallets()` | Removed `injectFn`; call injector separately |
| `BrowserWallet.getInstalledWallets()` | `MeshCardanoBrowserWallet.getInstalledWallets()` | Class name change only |
| `BrowserWallet.addBrowserWitnesses(tx, wit)` | _(removed)_ | Logic moved into signTxReturnFullTx |
| `BrowserWallet.getSupportedExtensions(name)` | _(removed)_ | Access `globalThis.cardano[name].supportedExtensions` |
| `wallet.getChangeAddress()` | `wallet.getChangeAddressBech32()` | Was bech32 (converted internally); base now returns hex |
| `wallet.getUsedAddresses()` | `wallet.getUsedAddressesBech32()` | Was bech32; base now returns hex |
| `wallet.getUnusedAddresses()` | `wallet.getUnusedAddressesBech32()` | Was bech32; base now returns hex |
| `wallet.getRewardAddresses()` | `wallet.getRewardAddressesBech32()` | Was bech32; base now returns hex |
| `wallet.signTx(tx)` | `wallet.signTxReturnFullTx(tx)` | Old default was full tx; new signTx returns witness set only |
| `wallet.signTx(tx, partial)` | `wallet.signTxReturnFullTx(tx, partial)` | Same — use signTxReturnFullTx for full tx |
| `wallet.signTx(tx, partial, true)` | `wallet.signTxReturnFullTx(tx, partial)` | Explicit full tx |
| `wallet.signTx(tx, partial, false)` | `wallet.signTx(tx, partial)` | Explicit witness-set-only |
| `wallet.signTxs(txs, partial?)` | _(removed)_ | Loop with signTxReturnFullTx; see Section 8 |
| `wallet.signData(payload, addr?, convertUTF8?)` | `wallet.signData(addr, hexPayload)` | Params swapped; addr required; no auto UTF-8 conversion |
| `wallet.getBalance()` | `wallet.getBalanceMesh()` | Old returned Asset[]; base now returns CBOR hex |
| `wallet.getUtxos()` | `wallet.getUtxosMesh()` | Old returned UTxO[]; base now returns CBOR hex strings |
| `wallet.getCollateral()` | `wallet.getCollateralMesh()` | Old returned UTxO[]; base now returns CBOR hex strings |
| `wallet.getNetworkId()` | `wallet.getNetworkId()` | Unchanged |
| `wallet.submitTx(tx)` | `wallet.submitTx(tx)` | Unchanged |
| `wallet.getUsedAddress()` | `(await wallet.getUsedAddressesBech32())[0]` | Was semi-sync; now fully async |
| `wallet.getUsedUTxOs()` | `wallet.getUtxosMesh()` | Renamed |
| `wallet.getCollateralUnspentOutput(limit?)` | `wallet.getCollateralMesh()` | No limit param; slice manually |
| `wallet.getAssets()` | _(removed)_ | Derive from getBalanceMesh() |
| `wallet.getLovelace()` | _(removed)_ | Derive from getBalanceMesh() |
| `wallet.getPolicyIdAssets(id)` | _(removed)_ | Derive from getBalanceMesh() |
| `wallet.getPolicyIds()` | _(removed)_ | Derive from getBalanceMesh() |
| `wallet.getDRep()` | _(removed)_ | Use raw CIP-95 API |
| `wallet.getPubDRepKey()` | _(removed)_ | Use raw CIP-95 API |
| `wallet.getRegisteredPubStakeKeys()` | _(removed)_ | Use raw CIP-95 API |
| `wallet.getUnregisteredPubStakeKeys()` | _(removed)_ | Use raw CIP-95 API |
| `wallet.getExtensions()` | _(removed)_ | Check raw wallet instance |

---

## 14. Gotchas and Silent Failures

These are the most dangerous changes because they compile fine but fail at runtime:

### 14a. signTx returns witness set, not full tx
- **Symptom:** Transaction submission fails with deserialization error
- **Cause:** `signTx()` now returns a witness set CBOR string, not a full transaction. The old BrowserWallet internally merged the witnesses.
- **Fix:** Use `signTxReturnFullTx()` instead

### 14b. getChangeAddress returns hex, not bech32
- **Symptom:** Address validation fails, "invalid address" errors, or silent blockchain query failures
- **Cause:** The old BrowserWallet internally called `addressToBech32(deserializeAddress(hex))`. The new base class returns raw hex.
- **Fix:** Use `getChangeAddressBech32()` instead

### 14c. signData parameter swap + missing UTF-8 conversion
- **Symptom:** Invalid signatures, or signing the address as data and vice versa
- **Cause:** Parameters swapped AND the automatic `fromUTF8()` conversion is gone
- **Fix:** Swap parameters AND manually apply `fromUTF8()` if your payload is UTF-8 text

### 14d. getBalance returns CBOR hex, not Asset[]
- **Symptom:** Code tries to `.find()`, `.filter()`, or `.map()` on a string
- **Cause:** `getBalance()` now returns a single CBOR hex string, not an array
- **Fix:** Use `getBalanceMesh()` for `Asset[]` format

### 14e. getUtxos / getCollateral return CBOR hex strings, not UTxO[]
- **Symptom:** Code tries to access `.output.amount` on a string, or `.map()` expecting UTxO properties
- **Cause:** These now return raw `string[]` from CIP-30
- **Fix:** Use `getUtxosMesh()` / `getCollateralMesh()` for `UTxO[]` format

### 14f. signTxs does not exist
- **Symptom:** `wallet.signTxs is not a function` runtime error
- **Cause:** Method was removed entirely
- **Fix:** Loop with `signTxReturnFullTx()` or access raw wallet instance

### 14g. CIP-95 methods (DRep, stake keys) are gone
- **Symptom:** `wallet.getDRep is not a function` or `wallet.getPubDRepKey is not a function`
- **Cause:** CIP-95 convenience methods were removed
- **Fix:** Access the raw CIP-95 API through the wallet instance if the wallet supports it

---

## Appendix: Source References

- **Old BrowserWallet source:** `https://github.com/MeshJS/mesh/blob/main/packages/mesh-wallet/src/browser/browser-wallet.ts`
- **New MeshCardanoBrowserWallet source:** `https://github.com/MeshJS/wallet/blob/main/src/cardano/wallet/browser/mesh-browser-wallet.ts`
- **New CardanoBrowserWallet base:** `https://github.com/MeshJS/wallet/blob/main/src/cardano/wallet/browser/cardano-browser-wallet.ts`
- **Related:** See `mesh-wallet-migration.md` for the headless MeshWallet migration (same patterns for address/signTx/returnType changes)
