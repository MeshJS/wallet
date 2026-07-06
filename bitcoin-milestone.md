# Milestone Evidence — Standard Headless Wallet on Bitcoin

This document maps the milestone acceptance criteria to the code in this repository.

**Milestone output A:** Develop and deploy a standard headless wallet on Bitcoin.

The headless wallet is `BitcoinHeadlessWallet` ([`src/bitcoin/wallet/mesh/bitcoin-headless-wallet.ts`](./src/bitcoin/wallet/mesh/bitcoin-headless-wallet.ts)), a server-side / Node.js wallet implementing the [`IBitcoinWallet`](./src/bitcoin/interfaces/bitcoin-wallet.ts) interface, with BIP-39/BIP-32 key management, BIP-84 (P2WPKH) and BIP-86 (P2TR) address derivation, and a pluggable [`IBitcoinProvider`](./src/bitcoin/interfaces/bitcoin-provider.ts) data-provider interface mirroring the Mesh Cardano fetcher/submitter pattern.

## A1 — UTXO querying based on Maestro as the data provider

| What                                             | Where                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Maestro provider (implements `IBitcoinProvider`) | [`src/bitcoin/providers/maestro.ts`](./src/bitcoin/providers/maestro.ts)                                     |
| Shared fetch/error plumbing                      | [`src/bitcoin/providers/common.ts`](./src/bitcoin/providers/common.ts)                                       |
| Wallet-level UTXO querying (`fetchUTXOs`)        | [`src/bitcoin/wallet/mesh/bitcoin-headless-wallet.ts`](./src/bitcoin/wallet/mesh/bitcoin-headless-wallet.ts) |
| Tests (mocked HTTP, 20 cases)                    | [`test/bitcoin/providers/maestro.test.ts`](./test/bitcoin/providers/maestro.test.ts)                         |

`MaestroProvider` covers address info, address UTXOs, per-transaction unspent outputs, paginated transaction history, transaction status, fee estimates (sat/vB with closest-target selection and a testnet fallback), and raw-transaction broadcast — all against Maestro's Esplora-compatible Bitcoin API using the platform `fetch` (no HTTP client dependency).

## A2 — Coin selection algorithm on queried Bitcoin UTXOs

| What                                              | Where                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Coin selection module (`selectUtxosLargestFirst`) | [`src/bitcoin/utils/coin-selection.ts`](./src/bitcoin/utils/coin-selection.ts) |
| Tests (fee model, dust handling, 12 cases)        | [`test/bitcoin/coin-selection.test.ts`](./test/bitcoin/coin-selection.test.ts) |

Largest-first selection with BIP-141/BIP-144 vbyte-accurate fee estimation (11 vB overhead, 68 vB per P2WPKH input, 31 vB per output). Change below the 546-sat P2WPKH dust threshold is dropped and absorbed as miner fee; insufficient funds throw a descriptive error.

## A3 — Send transfer transaction

| What                                                       | Where                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `signTransfer` (query → select → build → sign → broadcast) | [`src/bitcoin/wallet/mesh/bitcoin-headless-wallet.ts`](./src/bitcoin/wallet/mesh/bitcoin-headless-wallet.ts) |
| PSBT signing (P2WPKH ECDSA + P2TR Schnorr)                 | same file — `signPsbt`                                                                                       |
| Tests (broadcast, fees, dust, RBF)                         | [`test/bitcoin/bitcoin-headless-wallet.test.ts`](./test/bitcoin/bitcoin-headless-wallet.test.ts)             |

`signTransfer` fetches UTXOs from the provider, fetches a fee estimate (falling back to 2 sat/vB), runs coin selection, builds a BIP-125 RBF-enabled PSBT, signs, finalizes, and broadcasts through the provider, returning the txid.

## Usage

See the [Bitcoin Headless Wallet](./README.md#bitcoin-headless-wallet) section of the README for end-to-end examples.
