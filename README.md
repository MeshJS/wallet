# mesh-wallet

`mesh-wallet` is a package whose primary usage will be to allow dapps to sign transactions and messages from a private key or mnemonic.

It has an extended functionality to allow for a simulation of [CIP-30](https://cips.cardano.org/cip/CIP-30) endpoints using a Cardano data provider such as Blockfrost/Maestro.

NOTE: These are not a perfect replication of CIP-30 endpoints, CIP-30 requires a dedicated node and indexer realistically. The wallet therefore does not do any key derivations, and will only by default, derive keys for index 0 on all related derivation paths (payment, stake, drep).

It is possible that when querying balance for example, the same mnemonic will produce different results to a real wallet implementation, since real wallets will index multiple key derivations and search on-chain

## Usage

### Signing Transactions

#### Deriving from mnemonic

```typescript
const wallet = await MeshWallet.fromMnemonic({
  mnemonic:
    "globe cupboard camera aim congress cradle decorate enter fringe dove margin witness police coral junk genius harbor fire evolve climb rather broccoli post snack".split(
      " "
    ),
  networkId: 0,
  walletAddressType: AddressType.Base,
  fetcher: fetcher,
});

wallet.signTx(txHex);
```

The `BaseCardanoWallet` mostly needs a fetcher to function properly, because when signing a txCborHex, the wallet searches through the transaction to identify which part of the wallet needs to sign the transaction. Without a fetcher, input information cannot be obtained, and signing functionality doesn't work.

#### Blind signing

If you wanted to blindly sign a transaction (without first attempting to identify IF the wallet needs to sign). Then it is possible by using the more primitive classes that `BaseCardanoWallet` or `MeshWallet` was built upon.

#### In Memory BIP32

The `InMemoryBip32` Class allows users to derive keys from a mnemonic, it is denoted as "In memory" because both the mnemonic and derived keys will be stored in memory. It may be possible to create your own `Bip32` Class that doesn't store anything in memory, as long as the interface stays the same.

```typescript
const bip32 = await InMemoryBip32.fromMnemonic(
  "globe cupboard camera aim congress cradle decorate enter fringe dove margin witness police coral junk genius harbor fire evolve climb rather broccoli post snack".split(
    " "
  )
);

const paymentSigner = await bip32.getSigner([
  1852 + HARDENED_OFFSET,
  1815 + HARDENED_OFFSET,
  0 + HARDENED_OFFSET,
  0,
  0,
]);

paymentSigner.sign(txHash);
```

This would return the raw signature from the payment key. You can do this for any derivation paths.

#### CardanoSigner

The previous code snippet allows you to generate raw signatures, but in Cardano, generally a raw signature isn't very useful. CIP-30 for example, requires signatures to be wrapped in a `TransactionWitnessSet` and encoded as CBOR. To facilitate this, we have the `CardanoSigner` class.

```typescript
const txWitnessSet = CardanoSigner.signTx(txHex, [paymentSigner]);
```

Furthermore, it might be somewhat useful to simply add the signature to the full transaction, ready for submission. There is a `returnFullTx` tag, that if set to `true` returns the entire tx CBOR hex with the signature added.

```typescript
const signedTx = CardanoSigner.signTx(txHex, [paymentSigner], true);
```

#### Other derivation paths

The `MeshWallet` class is quite good out of the box as a single address wallet, but if you wanted to use other derivation paths, it is possible, but will be slightly more cumbersome.

`MeshWallet` has a constructor that allows custom `payment`, `staking` and `drep` credential sources. Note that these constructors do accept `scriptHash` or `ISigner` except for `payment` key.

`payment` key has to be able to be used for signing, but it is fully possible to use `scriptHash` for the staking and/or drep part. The wallet will not attempt to sign with any `scriptHash` keys, but will use them to derive the `BaseAddress` and `DrepIds`.

```typescript
const paymentSigner = await bip32.getSigner([
  1852 + HARDENED_OFFSET,
  1815 + HARDENED_OFFSET,
  0 + HARDENED_OFFSET,
  0,
  5,
]);

const wallet = await MeshWallet.fromCredentialSources({
  networkId: 0,
  walletAddressType: AddressType.Enterprise,
  paymentCredentialSource: {
    type: "signer",
    signer: paymentSigner,
  },
});
```

#### Raw Ed25519PrivateKey

It is also possible to create `BaseSigner` instances from raw `Ed25519PrivateKey`, both `fromExtendedKeyHex` and `fromNormalKeyHex` are supported.

```typescript
const paymentSigner = BaseSigner.fromNormalKeyHex(
  "d4ffb1e83d44b66849b4f16183cbf2ba1358c491cfeb39f0b66b5f811a88f182"
);

const wallet = await MeshWallet.fromCredentialSources({
  networkId: 0,
  walletAddressType: AddressType.Enterprise,
  paymentCredentialSource: {
    type: "signer",
    signer: paymentSigner,
  },
});
```

## BaseCardanoWallet vs MeshWallet

The `BaseCardanoWallet` class acts as the underlying CIP-30 compatible wallet implementation. It attempts to adhere to the available APIs and return types defined in CIP-30.

However, due to our experiences with Cardano development, the return types defined in CIP-30 are all in a very inconvenient format. Everything is returned in CBOR hex format, which is not very useful in its raw format, and generally has to be parsed using a serialization library to obtain it in a more readily consumable format.

`MeshWallet` is an attempt to extend the `BaseCardanoWallet` in such a way that there are extra endpoints that do this parsing of the CBOR hex returns in a more readibly consumable way.

Probably the most relevant of these APIs would be the difference between `signTx` and `signTxReturnFullTx`. As the name of the API suggests, `signTxReturnFullTx` returns the transaction in FULL, with the extra vkey witnesses placed into the witness set. While `signTx` returns the signatures serialized in a transaction witness set, which requires extra manipulation using a serialization library to place the signatures in the transaction's witness set before it can be submitted.

## CIP-30

Once a MeshWallet is set up, it is possible to use it as an instance of a CIP-30 wallet.

```typescript
const meshWallet = await MeshWallet.fromMnemonic({
  networkId: 0,
  walletAddressType: AddressType.Base,
  mnemonic: mnemonic,
  fetcher: fetcher,
});

const meshWalletBalance = await meshWallet.getBalance();
const meshWalletChangeAddress = await meshWallet.getChangeAddress();
const meshWalletNetworkId = await meshWallet.getNetworkId();
const meshWalletCollateral = await meshWallet.getCollateral();
const meshWalletUtxos = await meshWallet.getUtxos();
const meshWalletRewardAddresses = await meshWallet.getRewardAddresses();

const meshWalletsignedData = await meshWallet.signData(
  meshWalletChangeAddress,
  "abc"
);
const signature = await meshWallet.signTx(transactionHex, true);
```

## Browser Wallet

`mesh-wallet` provides a class that helps with setting up Cardano Browser wallets.

Once enabled, the wallet object can be used the same way as a MeshWallet.

```typescript
const browserWallet = await CardanoBrowserWallet.enable("eternl");

const browserBalance = await browserWallet.getBalance();
const browserChangeAddress = await browserWallet.getChangeAddress();
const browserCollateral = await browserWallet.getCollateral();
const browserUtxos = await browserWallet.getUtxos();
const browserNetworkId = await browserWallet.getNetworkId();
const browserRewardAddresses = await browserWallet.getRewardAddresses();

const browserSignedData = await browserWallet.signData(
  meshWalletChangeAddress,
  "abc"
);
const signature = await browserWallet.signTx(transactionHex, true);
```

## Mesh Browser Wallet

`mesh-wallet` also provides a wrapper class around `CardanoBrowserWallet` called `MeshBrowserWallet` that implements all the convenient return types that might be easier to consume immediately.

```typescript
const meshBrowserWallet = new MeshBrowserWallet(browserWallet);

const browserBalance = await meshBrowserWallet.getBalanceMesh();
const browserChangeAddress = await meshBrowserWallet.getChangeAddressBech32();
const browserCollateral = await meshBrowserWallet.getCollateralMesh();
const browserUtxos = await meshBrowserWallet.getUtxosMesh();
const browserNetworkId = await meshBrowserWallet.getNetworkId();
const browserRewardAddresses =
  await meshBrowserWallet.getRewardAddressesBech32();

const signedTx = await meshBrowserWallet.signTxReturnFullTx(
  transactionHex,
  true
);
```
