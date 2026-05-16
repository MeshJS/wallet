import type { BIP32Interface } from "bip32";
import type { Network, Psbt, Signer } from "bitcoinjs-lib";

import { BitcoinAddressManager } from "../../address/bitcoin-address-manager";
import {
  BitcoinNetworkName,
  DerivedBitcoinAddress,
  networkFromName,
  toXOnly,
} from "../../address/bitcoin-address";
import { IBitcoinProvider } from "../../interfaces/bitcoin-provider";
import {
  AddressPurpose,
  BitcoinAccount,
  BitcoinAddress,
  BitcoinBalance,
  BitcoinSignature,
  IBitcoinWallet,
  MessageSigningProtocols,
} from "../../interfaces/bitcoin-wallet";
import {
  ECPair,
  bip32,
  bip39,
  bitcoin,
  ecc,
} from "../core/bitcoin-core";

export interface BitcoinHeadlessWalletConfig {
  /** Network this wallet operates on. */
  network: BitcoinNetworkName;
  /** Optional provider for UTXO/fee fetching and broadcast. */
  provider?: IBitcoinProvider;
  /** Optional BIP-39 passphrase. */
  password?: string;
  /** Optional account index (default 0). */
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
    const [paymentAddress] = this.manager.getAddresses([AddressPurpose.Payment]);
    const info = await this.provider.fetchAddress(paymentAddress.address);
    const confirmed =
      info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum;
    const unconfirmed =
      info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum;
    const total = confirmed + unconfirmed;
    return {
      confirmed: confirmed.toString(),
      unconfirmed: unconfirmed.toString(),
      total: total.toString(),
    };
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

    const derived = this.findDerivedByAddress(address);
    const child = this.manager.getChild(derived.purpose);
    if (!child.privateKey) {
      throw new Error(
        "[BitcoinHeadlessWallet] Private key unavailable for signing",
      );
    }

    const privateKey = Buffer.from(child.privateKey);
    const keyPair = ECPair.fromPrivateKey(privateKey, {
      compressed: true,
      network: this.bitcoinNetwork,
    });

    // Bitcoin signed-message standard: hash256( varInt(magicLen) || magic || varInt(msgLen) || msg )
    // The magic prefix is required for any external verifier (Electrum, Sparrow, block
    // explorers, bitcoinjs-message) to accept the signature.
    const messageBuffer = Buffer.from(message, "utf8");
    const magic = Buffer.from("Bitcoin Signed Message:\n", "utf8");
    const bufferToHash = Buffer.concat([
      varIntBuffer(magic.length),
      magic,
      varIntBuffer(messageBuffer.length),
      messageBuffer,
    ]);
    const hash = bitcoin.crypto.hash256(bufferToHash);

    // Produce a 65-byte compact recoverable signature: [header || r || s].
    // Header = 27 + 4 (compressed) + recoveryId  →  0x1f or 0x20 for compressed P2PKH-style.
    // External verifiers use the header to recover the pubkey and confirm the address.
    const rawSig = Buffer.from(ecc.sign(hash, privateKey));
    const compressedPubkey = Buffer.from(keyPair.publicKey);
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

    const [paymentAddress] = this.manager.getAddresses([AddressPurpose.Payment]);
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
        signer: this.signerForPurpose(purpose),
        purpose,
      });
    }

    const targets = signInputs ?? buildDefaultSignTargets(psbt, addressToSigner);
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
      const derived = this.manager.getAddress(purpose);
      if (derived.address === address) return derived;
    }
    throw new Error(
      `[BitcoinHeadlessWallet] Address ${address} is not managed by this wallet`,
    );
  }

  protected signerForPurpose(purpose: AddressPurpose): TaprootCapableSigner {
    const child = this.manager.getChild(purpose);
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
      throw new Error("[BitcoinHeadlessWallet] Failed to derive tweaked Taproot pubkey");
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
      // BIP-371: set `tapInternalKey` on the input so bitcoinjs-lib's
      // getTaprootHashesForSig recognises this as a key-path spend. The
      // matching check is `toXOnly(signer.publicKey).equals(outputKey)` where
      // outputKey is extracted from the witnessUtxo script — our signer's
      // publicKey is the tweaked output key, so the match succeeds.
      // SIGHASH_DEFAULT (0x00) yields the BIP-341 64-byte Schnorr signature.
      if (!entry.signer.internalPubkey) {
        throw new Error(
          "[BitcoinHeadlessWallet] Taproot signer missing internalPubkey",
        );
      }
      psbt.updateInput(index, {
        tapInternalKey: entry.signer.internalPubkey,
      });
      psbt.signInput(
        index,
        entry.signer as unknown as Signer,
        [bitcoin.Transaction.SIGHASH_DEFAULT],
      );
    } else {
      psbt.signInput(index, entry.signer as unknown as Signer);
    }
  }
}

// -----------------------------------------------------------------------------
// Helpers (module-scope, not exported as public API)
// -----------------------------------------------------------------------------

/**
 * P2WPKH dust threshold under default relay policy (Bitcoin Core ~0.21+):
 * outputs below this value are non-standard and the tx will fail to relay.
 * 546 sats matches `GetDustThreshold` for a P2WPKH output at the default
 * 3000 sat/kvB dust feerate. Absorb anything below this into the miner fee.
 */
const DUST_THRESHOLD_P2WPKH = 546;

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
  addressToSigner: Map<string, { signer: TaprootCapableSigner; purpose: AddressPurpose }>,
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
    } else if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
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
 * Largest-first UTXO selection with P2WPKH-realistic vbyte estimates.
 *
 * vbyte math (BIP-141 / BIP-144):
 *   - overhead: 10.5 vB (version 4 + locktime 4 + segwit marker/flag 0.5 + 2× varint <253)
 *   - per P2WPKH input: 68 vB (outpoint 41 + script_len 1 + sequence 0 + witness ~27)
 *   - per output: 31 vB (value 8 + script_len 1 + scriptPubKey 22)
 *
 * Tries with-change first; if change would be sub-dust, retries without a
 * change output (one fewer 31 vB output) so the dust is consumed as fee.
 */
function selectUtxosLargestFirst(
  utxos: { txid: string; vout: number; value: number }[],
  targetAmount: number,
  feeRate: number,
  numRecipients: number,
): { selectedUtxos: typeof utxos; change: number } {
  const VB_OVERHEAD = 11;
  const VB_INPUT_P2WPKH = 68;
  const VB_OUTPUT = 31;
  const recipientsVb = numRecipients * VB_OUTPUT;

  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  let selectedValue = 0;
  const selected: typeof utxos = [];

  for (const utxo of sorted) {
    selected.push(utxo);
    selectedValue += utxo.value;
    const inputsVb = selected.length * VB_INPUT_P2WPKH;
    const vbytesWithChange = VB_OVERHEAD + inputsVb + recipientsVb + VB_OUTPUT;
    const vbytesNoChange = VB_OVERHEAD + inputsVb + recipientsVb;
    const feeWithChange = Math.ceil(vbytesWithChange * feeRate);
    const feeNoChange = Math.ceil(vbytesNoChange * feeRate);

    if (selectedValue >= targetAmount + feeWithChange) {
      const change = selectedValue - targetAmount - feeWithChange;
      if (change >= DUST_THRESHOLD_P2WPKH) {
        return { selectedUtxos: selected, change };
      }
      // Change would be dust — drop the change output, absorb dust as fee.
      if (selectedValue >= targetAmount + feeNoChange) {
        return { selectedUtxos: selected, change: 0 };
      }
    } else if (selectedValue >= targetAmount + feeNoChange) {
      // Just enough for a no-change tx.
      return { selectedUtxos: selected, change: 0 };
    }
  }
  throw new Error("[BitcoinHeadlessWallet] Insufficient funds for transaction");
}

/**
 * Recover the recoveryId (0 or 1) for an ECDSA signature given the message hash and
 * the expected compressed public key. Returns the id whose point recovery matches
 * the signer's pubkey. Required to emit a 65-byte compact recoverable signature
 * compatible with the Bitcoin signed-message standard.
 */
function findRecoveryId(hash: Buffer, sig: Buffer, expectedPubkey: Buffer): 0 | 1 {
  for (const rid of [0, 1] as const) {
    const recovered = ecc.recover(hash, sig, rid, true);
    if (recovered && Buffer.from(recovered).equals(expectedPubkey)) {
      return rid;
    }
  }
  throw new Error(
    "[BitcoinHeadlessWallet] Failed to determine recovery id for signature",
  );
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
    throw new Error("[BitcoinHeadlessWallet] Failed to tweak Taproot private key");
  }
  return Buffer.from(tweaked);
}
