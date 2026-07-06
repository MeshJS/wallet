import type { BIP32Interface } from "bip32";
import type { Network, Psbt, Signer } from "bitcoinjs-lib";

import {
  BitcoinNetworkName,
  DerivedBitcoinAddress,
  networkFromName,
  toXOnly,
} from "../../address/bitcoin-address";
import { BitcoinAddressManager } from "../../address/bitcoin-address-manager";
import { IBitcoinProvider } from "../../interfaces/bitcoin-provider";
import {
  AddressPurpose,
  BitcoinAccount,
  BitcoinAddress,
  BitcoinBalance,
  BitcoinSignature,
  IBitcoinWallet,
  MessageSigningProtocols,
  VerifyMessageResult,
} from "../../interfaces/bitcoin-wallet";
import { RecoveryId } from "../../types/recoveryId";
import { TransactionsInfo } from "../../types/transactions-info";
import { UTxO } from "../../types/utxo";
import { selectUtxosLargestFirst } from "../../utils/coin-selection";
import { bip32, bip39, bitcoin, ecc, ECPair } from "../core/bitcoin-core";

export interface BitcoinHeadlessWalletConfig {
  network: BitcoinNetworkName;
  provider?: IBitcoinProvider;
  password?: string;
  account?: number;
}

interface InternalConfig {
  network: BitcoinNetworkName;
  bitcoinNetwork: Network;
  root: BIP32Interface;
  manager: BitcoinAddressManager;
  provider?: IBitcoinProvider;
  account: number;
}

/**
 * Internal signer extension. Carries the optional BIP-341 internal x-only
 * pubkey alongside the standard `Signer` surface so `signSingleInput` can
 * populate `input.tapInternalKey` when signing Taproot inputs. ECDSA signers
 * (P2WPKH) simply omit `internalPubkey`.
 */
type TaprootCapableSigner = Signer & { internalPubkey?: Buffer };

export class BitcoinHeadlessWallet implements IBitcoinWallet {
  protected readonly networkName: BitcoinNetworkName;
  protected readonly bitcoinNetwork: Network;
  protected readonly root: BIP32Interface;
  protected readonly manager: BitcoinAddressManager;
  protected readonly provider?: IBitcoinProvider;
  protected readonly account: number;

  protected constructor(cfg: InternalConfig) {
    this.networkName = cfg.network;
    this.bitcoinNetwork = cfg.bitcoinNetwork;
    this.root = cfg.root;
    this.manager = cfg.manager;
    this.provider = cfg.provider;
    this.account = cfg.account;
  }

  /**
   * Create a headless wallet from an existing BIP-32 root and configuration.
   */
  static async create(
    config: BitcoinHeadlessWalletConfig & { root: BIP32Interface },
  ): Promise<BitcoinHeadlessWallet> {
    const bitcoinNetwork = networkFromName(config.network);
    const manager = new BitcoinAddressManager({
      network: bitcoinNetwork,
      root: config.root,
      account: config.account ?? 0,
    });
    return new BitcoinHeadlessWallet({
      network: config.network,
      bitcoinNetwork,
      root: config.root,
      manager,
      provider: config.provider,
      account: config.account ?? 0,
    });
  }

  /**
   * Create a headless wallet from a BIP-39 mnemonic phrase.
   */
  static async fromMnemonic(
    config: BitcoinHeadlessWalletConfig & { mnemonic: string[] },
  ): Promise<BitcoinHeadlessWallet> {
    const phrase = config.mnemonic.join(" ");
    if (!bip39.validateMnemonic(phrase)) {
      throw new Error("[BitcoinHeadlessWallet] Invalid mnemonic provided");
    }
    const seed = await bip39.mnemonicToSeed(phrase, config.password ?? "");
    const bitcoinNetwork = networkFromName(config.network);
    const root = bip32.fromSeed(seed, bitcoinNetwork);
    return BitcoinHeadlessWallet.create({ ...config, root });
  }

  /**
   * Create a headless wallet from BIP-39 entropy (hex string).
   */
  static async fromEntropy(
    config: BitcoinHeadlessWalletConfig & { entropy: string },
  ): Promise<BitcoinHeadlessWallet> {
    const mnemonic = bip39.entropyToMnemonic(config.entropy);
    const seed = await bip39.mnemonicToSeed(mnemonic, config.password ?? "");
    const bitcoinNetwork = networkFromName(config.network);
    const root = bip32.fromSeed(seed, bitcoinNetwork);
    return BitcoinHeadlessWallet.create({ ...config, root });
  }

  static async fromPrivateKey(
    config: BitcoinHeadlessWalletConfig & { privateKey: string },
  ): Promise<BitcoinHeadlessWallet> {
    const bitcoinNetwork = networkFromName(config.network);

    let privKeyBuffer: Buffer;

    if (/^[0-9a-fA-F]{64}$/.test(config.privateKey)) {
      privKeyBuffer = Buffer.from(config.privateKey, "hex");
    } else {
      try {
        const pair = ECPair.fromWIF(config.privateKey, bitcoinNetwork);
        if (!pair.privateKey) {
          throw new Error("WIF decoded but contained no private key bytes");
        }
        privKeyBuffer = Buffer.from(pair.privateKey);
      } catch (e) {
        throw new Error(
          `[BitcoinHeadlessWallet] privateKey must be a 32-byte hex string or valid WIF: ${(e as Error).message}`,
        );
      }
    }

    if (privKeyBuffer.length !== 32) {
      throw new Error(
        `[BitcoinHeadlessWallet] Private key must be exactly 32 bytes, got ${privKeyBuffer.length}`,
      );
    }

    const root = bip32.fromSeed(privKeyBuffer, bitcoinNetwork);
    return BitcoinHeadlessWallet.create({ ...config, root });
  }

  // ---------------------------------------------------------------------------
  // IBitcoinWallet
  // ---------------------------------------------------------------------------

  async getNetwork(): Promise<BitcoinNetworkName> {
    return this.networkName;
  }

  async getAddresses(
    addressPurposes: AddressPurpose[],
  ): Promise<BitcoinAddress[]> {
    return this.manager
      .getAddresses(addressPurposes)
      .map((a) => a.toBitcoinAddress());
  }

  async getAccounts(
    addressPurposes: AddressPurpose[],
  ): Promise<BitcoinAccount[]> {
    return this.manager
      .getAddresses(addressPurposes)
      .map((a) => a.toBitcoinAccount());
  }

  async getBalance(): Promise<BitcoinBalance> {
    if (!this.provider) {
      throw new Error(
        "[BitcoinHeadlessWallet] No provider provided. Pass an IBitcoinProvider to fetch balance.",
      );
    }

    const paymentAddresses = this.manager.getAddresses([
      AddressPurpose.Payment,
    ]);

    const addressInfos = await Promise.all(
      paymentAddresses.map((address) =>
        this.provider!.fetchAddressInfo(address.address),
      ),
    );

    const { confirmed, unconfirmed } = addressInfos.reduce(
      (acc, info) => {
        acc.confirmed +=
          info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum;

        acc.unconfirmed +=
          info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum;

        return acc;
      },
      {
        confirmed: 0,
        unconfirmed: 0,
      },
    );

    const total = confirmed + unconfirmed;

    return {
      confirmed: confirmed.toString(),
      unconfirmed: unconfirmed.toString(),
      total: total.toString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Address manager — public delegates
  // ---------------------------------------------------------------------------

  /**
   * Derive a contiguous range of addresses for a single purpose / change level.
   * Delegates to `BitcoinAddressManager.getAddressesByPurpose`.
   */
  getAddressesByPurpose(
    purpose: AddressPurpose,
    start = 0,
    count = 20,
    change = 0,
  ): DerivedBitcoinAddress[] {
    return this.manager.getAddressesByPurpose(purpose, start, count, change);
  }

  /**
   * Scan the derivation path for `address` up to `maxGap` indices across both
   * external and internal (change) chains. Returns the matching
   * `DerivedBitcoinAddress` (with correct `change` and `index`) or `undefined`.
   * Delegates to `BitcoinAddressManager.findAddress`.
   */
  findManagedAddress(
    address: string,
    purpose: AddressPurpose,
    maxGap = 20,
  ): DerivedBitcoinAddress | undefined {
    return this.manager.findAddress(address, purpose, maxGap);
  }

  /**
   * Export the BIP-84 (P2WPKH) account public key as xpub (mainnet) / tpub (testnet).
   * Delegates to `BitcoinAddressManager.getAccountXpub`.
   */
  getAccountXpub(): string {
    return this.manager.getAccountXpub();
  }

  /**
   * Export the BIP-86 (P2TR / Taproot) account public key as xpub (mainnet) / tpub (testnet).
   * Delegates to `BitcoinAddressManager.getTaprootXpub`.
   */
  getTaprootXpub(): string {
    return this.manager.getTaprootXpub();
  }

  /**
   * Export the BIP-84 account public key with the zpub (mainnet) / vpub (testnet)
   * version prefix. Delegates to `BitcoinAddressManager.getAccountZpub`.
   */
  getAccountZpub(): string {
    return this.manager.getAccountZpub();
  }

  /**
   * Fetch unspent transaction outputs (UTXOs) for one or both managed addresses.
   *
   * @param purposes - Which address(es) to query. Defaults to both Payment and
   *   Ordinals so callers get a unified view. Pass `[AddressPurpose.Payment]`
   *   to restrict to the P2WPKH address only (e.g. when building a send tx).
   * @returns Flat array of UTXOs across all requested addresses, each annotated
   *   with the `address` and `purpose` it belongs to so callers can route
   *   inputs correctly (P2WPKH vs P2TR signing).
   */
  async fetchUTXOs(
    purposes: AddressPurpose[] = [
      AddressPurpose.Payment,
      AddressPurpose.Ordinals,
    ],
  ): Promise<(UTxO & { address: string; purpose: AddressPurpose })[]> {
    if (!this.provider) {
      throw new Error(
        "[BitcoinHeadlessWallet] No provider provided. Pass an IBitcoinProvider to fetch UTXOs.",
      );
    }

    const addresses = this.manager.getAddresses(purposes);
    const results = await Promise.all(
      addresses.map(async (derived) => {
        const utxos = await this.provider!.fetchAddressUTxOs(derived.address);
        return utxos.map((utxo) => ({
          ...utxo,
          address: derived.address,
          purpose: derived.purpose,
        }));
      }),
    );

    return results.flat();
  }

  /**
   * Fetch confirmed and mempool transaction history for one or both managed
   * addresses, with optional pagination via `lastSeenTxid`.
   *
   * @param options.purposes - Which address(es) to query (default: both).
   * @param options.lastSeenTxid - Cursor for page-based pagination: pass the
   *   last `txid` from a previous page to fetch the next batch (Esplora API
   *   returns at most 25 txs per page).
   * @returns Transactions in reverse-chronological order (newest first),
   *   each annotated with `address` and `purpose` for easy filtering.
   *   If both addresses are queried the two lists are merged and re-sorted by
   *   block height descending (unconfirmed txs sort to the top).
   */
  async getTransactionHistory(
    options: {
      purposes?: AddressPurpose[];
      lastSeenTxid?: string;
    } = {},
  ): Promise<
    (TransactionsInfo & { address: string; purpose: AddressPurpose })[]
  > {
    if (!this.provider) {
      throw new Error(
        "[BitcoinHeadlessWallet] No provider provided. Pass an IBitcoinProvider to fetch transaction history.",
      );
    }

    const purposes = options.purposes ?? [
      AddressPurpose.Payment,
      AddressPurpose.Ordinals,
    ];
    const addresses = this.manager.getAddresses(purposes);

    const results = await Promise.all(
      addresses.map(async (derived) => {
        const txs = await this.provider!.fetchAddressTxs(
          derived.address,
          options.lastSeenTxid,
        );
        return txs.map((tx) => ({
          ...tx,
          address: derived.address,
          purpose: derived.purpose,
        }));
      }),
    );

    // Merge and sort: unconfirmed (block_height = 0 / undefined) first,
    // then descending block height so the most recent confirmed tx comes next.
    return results.flat().sort((a, b) => {
      const ha = a.status.block_height ?? 0;
      const hb = b.status.block_height ?? 0;
      if (!a.status.confirmed && b.status.confirmed) return -1;
      if (a.status.confirmed && !b.status.confirmed) return 1;
      return hb - ha;
    });
  }

  async signMessage(
    address: string,
    message: string,
    protocol: MessageSigningProtocols = MessageSigningProtocols.ECDSA,
  ): Promise<BitcoinSignature> {
    if (protocol === MessageSigningProtocols.BIP322) {
      throw new Error(
        "[BitcoinHeadlessWallet] BIP-322 message signing is not yet supported. Use ECDSA.",
      );
    }

    const bitcoin_address = this.findDerivedByAddress(address);
    const child = this.manager.getChild(
      bitcoin_address.purpose,
      bitcoin_address.change,
      bitcoin_address.index,
    );
    if (!child.privateKey) {
      throw new Error(
        "BitcoinHeadlessWallet: Private key unavailable for signing",
      );
    }

    const privateKey = Buffer.from(child.privateKey);

    // Bitcoin signed-message standard preimage (see bitcoinMessageHash helper).
    const hash = bitcoinMessageHash(message);

    // Produce a 65-byte compact recoverable signature: [header || r || s].
    // Header = 27 + 4 (compressed) + recoveryId  →  0x1f or 0x20 for compressed P2PKH-style.
    // External verifiers use the header to recover the pubkey and confirm the address.
    const rawSig = Buffer.from(ecc.sign(hash, privateKey));
    const compressedPubkey = Buffer.from(child.publicKey);
    const recoveryId = findRecoveryId(hash, rawSig, compressedPubkey);
    const header = 27 + 4 + recoveryId;
    const sig65 = Buffer.concat([Buffer.from([header]), rawSig]);

    return {
      signature: sig65.toString("base64"),
      messageHash: hash.toString("hex"),
      address,
      protocol: MessageSigningProtocols.ECDSA,
    };
  }

  async verifyMessage(
    address: string,
    message: string,
    signature: string,
  ): Promise<VerifyMessageResult> {
    return verifyBitcoinMessage(
      address,
      message,
      signature,
      this.bitcoinNetwork,
    );
  }

  async signTransfer(
    recipients: { address: string; amount: number }[],
  ): Promise<string> {
    if (!this.provider) {
      throw new Error(
        "[BitcoinHeadlessWallet] No provider provided. Pass an IBitcoinProvider to send.",
      );
    }
    if (!recipients.length) {
      throw new Error("[BitcoinHeadlessWallet] No recipients provided");
    }

    const [paymentAddress] = this.manager.getAddresses([
      AddressPurpose.Payment,
    ]);
    const utxos = await this.provider.fetchAddressUTxOs(paymentAddress.address);

    let feeRate = 2;
    try {
      feeRate = await this.provider.fetchFeeEstimates(6);
    } catch {
      // fall back to default
    }

    const targetAmount = recipients.reduce((sum, r) => sum + r.amount, 0);
    const { selectedUtxos, change } = selectUtxosLargestFirst(
      utxos,
      targetAmount,
      feeRate,
      recipients.length,
    );

    const psbt = new bitcoin.Psbt({ network: this.bitcoinNetwork });
    const paymentChild = this.manager.getChild(AddressPurpose.Payment);
    const p2wpkh = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(paymentChild.publicKey),
      network: this.bitcoinNetwork,
    });

    selectedUtxos.forEach((utxo) => {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        // BIP-125 RBF opt-in: 0xfffffffd allows the user to fee-bump if the tx stalls.
        sequence: 0xfffffffd,
        witnessUtxo: {
          script: p2wpkh.output!,
          value: utxo.value,
        },
      });
    });

    recipients.forEach((r) => {
      psbt.addOutput({ address: r.address, value: r.amount });
    });

    // The selector returns `change: 0` when change would be below dust — in that
    // case skip adding a change output and let the dust be absorbed as miner fee.
    if (change > 0) {
      psbt.addOutput({ address: paymentAddress.address, value: change });
    }

    const signInputs: Record<string, number[]> = {
      [paymentAddress.address]: Array.from(
        { length: psbt.inputCount },
        (_, i) => i,
      ),
    };

    return this.signPsbt({
      psbt: psbt.toBase64(),
      signInputs,
      broadcast: true,
    });
  }

  async signPsbt(signConfig: {
    psbt: string;
    signInputs?: { [x: string]: number[] } | undefined;
    broadcast?: boolean | undefined;
  }): Promise<string> {
    const { psbt: psbtBase64, signInputs, broadcast = false } = signConfig;

    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, {
      network: this.bitcoinNetwork,
    });

    const addressToSigner = new Map<
      string,
      { signer: TaprootCapableSigner; purpose: AddressPurpose }
    >();
    for (const purpose of [AddressPurpose.Payment, AddressPurpose.Ordinals]) {
      const derived = this.manager.getAddress(purpose);
      addressToSigner.set(derived.address, {
        signer: this.signerForPurpose(purpose, derived.change, derived.index),
        purpose,
      });
    }

    const targets =
      signInputs ?? buildDefaultSignTargets(psbt, addressToSigner);
    const indexesUsed = new Set<number>();

    for (const [address, indexes] of Object.entries(targets)) {
      const entry = addressToSigner.get(address);
      if (!entry) {
        throw new Error(
          `[BitcoinHeadlessWallet] Address ${address} is not managed by this wallet`,
        );
      }
      for (const index of indexes) {
        this.signSingleInput(psbt, index, entry);
        indexesUsed.add(index);
      }
    }

    if (broadcast) {
      if (!this.provider) {
        throw new Error(
          "[BitcoinHeadlessWallet] No provider configured for broadcasting",
        );
      }
      for (const index of indexesUsed) {
        psbt.finalizeInput(index);
      }
      const tx = psbt.extractTransaction();
      const txid = await this.provider.submitTx(tx.toHex());
      return txid;
    }

    return psbt.toBase64();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  protected findDerivedByAddress(address: string): DerivedBitcoinAddress {
    for (const purpose of [AddressPurpose.Payment, AddressPurpose.Ordinals]) {
      const found = this.manager.findAddress(address, purpose);
      if (found) return found;
    }
    throw new Error(
      `BitcoinHeadlessWallet: Address ${address} is not managed by this wallet`,
    );
  }

  protected signerForPurpose(
    purpose: AddressPurpose,
    change = 0,
    index = 0,
  ): TaprootCapableSigner {
    const child = this.manager.getChild(purpose, change, index);
    if (!child.privateKey) {
      throw new Error("[BitcoinHeadlessWallet] Private key unavailable");
    }

    if (purpose === AddressPurpose.Payment) {
      const pair = ECPair.fromPrivateKey(Buffer.from(child.privateKey), {
        network: this.bitcoinNetwork,
      });
      return pair as unknown as TaprootCapableSigner;
    }

    // Taproot: BIP-86 single-key spend.
    //
    // bitcoinjs-lib matches `signer.publicKey` (x-only) against the OUTPUT key
    // extracted from the witnessUtxo script (`OP_1 <32-byte-output-key>`). The
    // output key = internalKey + H_TapTweak(internalKey)·G, so the signer must
    // expose the TWEAKED x-only pubkey and sign with the tweaked private key.
    // We also stash the INTERNAL x-only key so `signSingleInput` can populate
    // `input.tapInternalKey` (required by bitcoinjs-lib to trigger key-path
    // matching — see getTaprootHashesForSig).
    const internalPubkey = toXOnly(Buffer.from(child.publicKey));
    const tweakedPrivateKey = tweakPrivateKey(
      Buffer.from(child.privateKey),
      internalPubkey,
    );
    const tweakedFullPub = ecc.pointFromScalar(tweakedPrivateKey, true);
    if (!tweakedFullPub) {
      throw new Error(
        "[BitcoinHeadlessWallet] Failed to derive tweaked Taproot pubkey",
      );
    }
    const tweakedXOnly = toXOnly(Buffer.from(tweakedFullPub));
    const signer: TaprootCapableSigner = {
      publicKey: tweakedXOnly,
      internalPubkey,
      network: this.bitcoinNetwork,
      // Calling `sign` on a Taproot input is a usage error — bitcoinjs only calls
      // `signSchnorr`. Throwing makes a misuse loud instead of silently emitting
      // a Schnorr signature where ECDSA was expected.
      sign: (): Buffer => {
        throw new Error(
          "[BitcoinHeadlessWallet] Taproot signer does not support ECDSA `sign`; use signSchnorr",
        );
      },
      signSchnorr: (hash: Buffer): Buffer => {
        const sig = ecc.signSchnorr(hash, tweakedPrivateKey);
        return Buffer.from(sig);
      },
    };
    return signer;
  }

  protected signSingleInput(
    psbt: Psbt,
    index: number,
    entry: { signer: TaprootCapableSigner; purpose: AddressPurpose },
  ) {
    if (entry.purpose === AddressPurpose.Ordinals) {
      if (!entry.signer.internalPubkey) {
        throw new Error(
          "[BitcoinHeadlessWallet] Taproot signer missing internalPubkey",
        );
      }
      psbt.updateInput(index, {
        tapInternalKey: entry.signer.internalPubkey,
      });
      psbt.signInput(index, entry.signer as unknown as Signer, [
        bitcoin.Transaction.SIGHASH_DEFAULT,
      ]);
    } else {
      psbt.signInput(index, entry.signer as unknown as Signer);
    }
  }
}

// -----------------------------------------------------------------------------
// Helpers (module-scope, not exported as public API)
// -----------------------------------------------------------------------------

/**
 * Build per-address sign-target index lists by inspecting each PSBT input's
 * witnessUtxo script type. Each input is assigned to the single signer that
 * matches its script (P2WPKH-payment vs P2TR-ordinals). Without this, a
 * blanket `[0..n]` assignment causes bitcoinjs-lib to attempt signing each
 * input with BOTH signers, producing a "Can not sign for input" throw or
 * a corrupted PSBT.
 *
 * Inputs whose script doesn't match any managed address are skipped — the
 * caller can detect that case by passing explicit `signInputs`.
 */
function buildDefaultSignTargets(
  psbt: Psbt,
  addressToSigner: Map<
    string,
    { signer: TaprootCapableSigner; purpose: AddressPurpose }
  >,
): Record<string, number[]> {
  const purposeToAddress = new Map<AddressPurpose, string>();
  for (const [address, entry] of addressToSigner.entries()) {
    purposeToAddress.set(entry.purpose, address);
  }
  const out: Record<string, number[]> = {};
  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];
    const script = input?.witnessUtxo?.script;
    if (!script) continue;
    let purpose: AddressPurpose | undefined;
    if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
      // OP_0 <20-byte-hash>  → P2WPKH
      purpose = AddressPurpose.Payment;
    } else if (
      script.length === 34 &&
      script[0] === 0x51 &&
      script[1] === 0x20
    ) {
      // OP_1 <32-byte-x-only-key>  → P2TR
      purpose = AddressPurpose.Ordinals;
    }
    if (!purpose) continue;
    const address = purposeToAddress.get(purpose);
    if (!address) continue;
    (out[address] ??= []).push(i);
  }
  return out;
}

/**
 * Recover the recoveryId (0 or 1) for an ECDSA signature given the message hash and
 * the expected compressed public key. Returns the id whose point recovery matches
 * the signer's pubkey. Required to emit a 65-byte compact recoverable signature
 * compatible with the Bitcoin signed-message standard.
 */
function findRecoveryId(
  hash: Buffer,
  sig: Buffer,
  expectedPubkey: Buffer,
): RecoveryId {
  for (const rid of [0, 1, 2, 3] as const) {
    const recovered = ecc.recover(hash, sig, rid, true);
    if (recovered && Buffer.from(recovered).equals(expectedPubkey)) {
      return rid;
    }
  }
  throw new Error(
    "BitcoinHeadlessWallet: Failed to determine recovery id for signature",
  );
}

/**
 * Compute the Bitcoin signed-message hash: hash256(varInt(magicLen) || magic || varInt(msgLen) || msg).
 * Shared by signMessage and verifyBitcoinMessage so both sides agree on the preimage.
 */
function bitcoinMessageHash(message: string): Buffer {
  const messageBuffer = Buffer.from(message, "utf8");
  const magic = Buffer.from("Bitcoin Signed Message:\n", "utf8");
  const preimage = Buffer.concat([
    varIntBuffer(magic.length),
    magic,
    varIntBuffer(messageBuffer.length),
    messageBuffer,
  ]);
  return bitcoin.crypto.hash256(preimage);
}

/**
 * Verify a Bitcoin signed-message (BIP-137 style, 65-byte compact recoverable ECDSA, base64).
 *
 * Cross-type acceptance: recovers the pubkey from the signature and matches against
 * P2PKH / P2SH-P2WPKH / P2WPKH / P2TR (BIP-86) addresses derived from that pubkey.
 * The header byte selects compression + recoveryId per BIP-137 but does not constrain
 * which address type the caller may verify against — matches how Sparrow/Leather behave.
 */
export function verifyBitcoinMessage(
  address: string,
  message: string,
  signature: string,
  network: Network,
): VerifyMessageResult {
  let decoded: Buffer;
  try {
    decoded = Buffer.from(signature, "base64");
    // Buffer.from with base64 silently drops invalid chars; re-encode and compare
    // to catch garbage like "not-a-real-signature".
    if (
      decoded.toString("base64").replace(/=+$/, "") !==
      signature.replace(/=+$/, "")
    ) {
      return { valid: false, reason: "signature is not valid base64" };
    }
  } catch {
    return { valid: false, reason: "signature is not valid base64" };
  }

  if (decoded.length !== 65) {
    return {
      valid: false,
      reason: `signature must be 65 bytes, got ${decoded.length}`,
    };
  }

  const header = decoded[0]!;
  if (header < 27 || header > 42) {
    return {
      valid: false,
      reason: `signature header byte ${header} outside BIP-137 range 27..42`,
    };
  }

  const compressed = header >= 31;
  const recoveryId = ((header - 27) & 3) as 0 | 1 | 2 | 3;
  const rawSig = decoded.subarray(1);
  const hash = bitcoinMessageHash(message);

  const recovered = ecc.recover(hash, rawSig, recoveryId, compressed);
  if (!recovered) {
    return {
      valid: false,
      reason: "failed to recover public key from signature",
    };
  }
  const recoveredPubkey = Buffer.from(recovered);

  if (!ecc.verify(hash, recoveredPubkey, rawSig)) {
    return {
      valid: false,
      reason: "signature does not verify against recovered pubkey",
    };
  }

  const candidates: string[] = [];
  try {
    candidates.push(
      bitcoin.payments.p2pkh({ pubkey: recoveredPubkey, network }).address!,
    );
  } catch {
    /* skip */
  }
  if (compressed) {
    try {
      candidates.push(
        bitcoin.payments.p2wpkh({ pubkey: recoveredPubkey, network }).address!,
      );
    } catch {
      /* skip */
    }
    try {
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: recoveredPubkey,
        network,
      });
      candidates.push(
        bitcoin.payments.p2sh({ redeem: p2wpkh, network }).address!,
      );
    } catch {
      /* skip */
    }
    try {
      candidates.push(
        bitcoin.payments.p2tr({
          internalPubkey: toXOnly(recoveredPubkey),
          network,
        }).address!,
      );
    } catch {
      /* skip */
    }
  }

  if (candidates.includes(address)) {
    return {
      valid: true,
      recoveredPublicKey: recoveredPubkey.toString("hex"),
    };
  }

  return {
    valid: false,
    reason: "address does not match any standard form of the recovered pubkey",
    recoveredPublicKey: recoveredPubkey.toString("hex"),
  };
}

function varIntBuffer(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, n >> 8]);
  if (n <= 0xffffffff)
    return Buffer.from([
      0xfe,
      n & 0xff,
      (n >> 8) & 0xff,
      (n >> 16) & 0xff,
      (n >> 24) & 0xff,
    ]);
  throw new Error("Message too long");
}

/**
 * Tweak a BIP-340 private key with the Taproot output tweak (BIP-86 single-key path).
 * Required before signing P2TR inputs with no script tree.
 */
function tweakPrivateKey(privateKey: Buffer, internalPubkey: Buffer): Buffer {
  // BIP-341: if the internal pubkey has odd Y parity, negate the private key
  // before tweaking so that the resulting key produces the expected x-only output key.
  const fullPub = ecc.pointFromScalar(privateKey, true);
  if (!fullPub) {
    throw new Error("[BitcoinHeadlessWallet] Invalid private key");
  }
  let priv: Buffer | Uint8Array = privateKey;
  if (fullPub[0] === 0x03) {
    const negated = ecc.privateNegate(privateKey);
    if (!negated) {
      throw new Error("[BitcoinHeadlessWallet] Failed to negate private key");
    }
    priv = negated;
  }
  const taggedHash = bitcoin.crypto.taggedHash(
    "TapTweak",
    Buffer.from(internalPubkey),
  );
  const tweaked = ecc.privateAdd(priv, taggedHash);
  if (!tweaked) {
    throw new Error(
      "[BitcoinHeadlessWallet] Failed to tweak Taproot private key",
    );
  }
  return Buffer.from(tweaked);
}
