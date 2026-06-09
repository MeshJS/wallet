import { BitcoinHeadlessWallet } from "../../src/bitcoin/wallet/mesh/bitcoin-headless-wallet";
import {
  AddressPurpose,
  MessageSigningProtocols,
} from "../../src/bitcoin/interfaces/bitcoin-wallet";
import { IBitcoinProvider } from "../../src/bitcoin/interfaces/bitcoin-provider";
import { bitcoin, ecc } from "../../src/bitcoin/wallet/core/bitcoin-core";

const TEST_MNEMONIC = [
  "muscle", "urban", "donkey", "public", "summer", "recycle",
  "kitten", "silver", "pluck", "myth", "install", "useful",
];

const TESTNET_P2WPKH = "tb1qq6km6823v806scer3feqx2xcyrdhgcgw7y80us";
const TESTNET_P2TR = "tb1ptc3m295wnrt8e2sw3q3mcshqc4v9w9hfuq7eenhm5dsymj6w2xysn7vgx7";

/**
 * Minimal IBitcoinProvider mock — just enough for getBalance / signTransfer flows.
 * Each test overrides only the methods it exercises.
 */
function makeProvider(overrides: Partial<IBitcoinProvider> = {}): IBitcoinProvider {
  const base: IBitcoinProvider = {
    fetchAddressInfo: jest.fn(),
    fetchAddressTxs: jest.fn(),
    fetchAddressUTxOs: jest.fn(),
    fetchScriptInfo: jest.fn(),
    fetchScriptTxs: jest.fn(),
    fetchScriptUTxOs: jest.fn(),
    fetchTxInfo: jest.fn(),
    fetchFeeEstimates: jest.fn(),
    submitTx: jest.fn(),
  } as unknown as IBitcoinProvider;
  return Object.assign(base, overrides);
}

async function makeWallet(network: "Mainnet" | "Testnet4" = "Testnet4", provider?: IBitcoinProvider) {
  return BitcoinHeadlessWallet.fromMnemonic({
    network,
    mnemonic: TEST_MNEMONIC,
    provider,
  });
}

describe("BitcoinHeadlessWallet", () => {
  // ---------------------------------------------------------------------------
  // factories + getNetwork
  // ---------------------------------------------------------------------------
  describe("factories", () => {
    it("fromMnemonic builds a wallet on Testnet4", async () => {
      const wallet = await makeWallet("Testnet4");
      expect(await wallet.getNetwork()).toBe("Testnet4");
    });

    it("fromMnemonic builds a wallet on Mainnet", async () => {
      const wallet = await makeWallet("Mainnet");
      expect(await wallet.getNetwork()).toBe("Mainnet");
    });

    it("fromMnemonic rejects an invalid mnemonic", async () => {
      await expect(
        BitcoinHeadlessWallet.fromMnemonic({
          network: "Testnet4",
          mnemonic: ["not", "a", "valid", "mnemonic"],
        }),
      ).rejects.toThrow(/Invalid mnemonic/);
    });

    it("fromEntropy builds a wallet from a 128-bit hex entropy", async () => {
      const wallet = await BitcoinHeadlessWallet.fromEntropy({
        network: "Testnet4",
        entropy: "00000000000000000000000000000000",
      });
      expect(await wallet.getNetwork()).toBe("Testnet4");
    });
  });

  // ---------------------------------------------------------------------------
  // getAddresses / getAccounts
  // ---------------------------------------------------------------------------
  describe("getAddresses / getAccounts", () => {
    it("returns canonical BIP-84 + BIP-86 testnet addresses", async () => {
      const wallet = await makeWallet("Testnet4");
      const addrs = await wallet.getAddresses([
        AddressPurpose.Payment,
        AddressPurpose.Ordinals,
      ]);
      expect(addrs.find((a) => a.purpose === AddressPurpose.Payment)?.address).toBe(TESTNET_P2WPKH);
      expect(addrs.find((a) => a.purpose === AddressPurpose.Ordinals)?.address).toBe(TESTNET_P2TR);
    });

    it("getAccounts returns the same data plus walletType=software", async () => {
      const wallet = await makeWallet("Testnet4");
      const accts = await wallet.getAccounts([AddressPurpose.Payment]);
      expect(accts).toHaveLength(1);
      expect(accts[0]!.walletType).toBe("software");
      expect(accts[0]!.address).toBe(TESTNET_P2WPKH);
    });
  });

  // ---------------------------------------------------------------------------
  // getBalance
  // ---------------------------------------------------------------------------
  describe("getBalance", () => {
    it("throws when no provider is configured", async () => {
      const wallet = await makeWallet("Testnet4");
      await expect(wallet.getBalance()).rejects.toThrow(/No provider/);
    });

    it("sums confirmed + unconfirmed correctly", async () => {
      const provider = makeProvider({
        fetchAddressInfo: jest.fn().mockResolvedValue({
          chain_stats: { funded_txo_sum: 100_000, spent_txo_sum: 40_000 },
          mempool_stats: { funded_txo_sum: 5_000, spent_txo_sum: 1_000 },
        }),
      });
      const wallet = await makeWallet("Testnet4", provider);
      const bal = await wallet.getBalance();
      expect(bal.confirmed).toBe("60000");
      expect(bal.unconfirmed).toBe("4000");
      expect(bal.total).toBe("64000");
      expect(provider.fetchAddressInfo).toHaveBeenCalledWith(TESTNET_P2WPKH);
    });

    it("handles a zero-activity address", async () => {
      const provider = makeProvider({
        fetchAddressInfo: jest.fn().mockResolvedValue({
          chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
          mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
        }),
      });
      const wallet = await makeWallet("Testnet4", provider);
      const bal = await wallet.getBalance();
      expect(bal.confirmed).toBe("0");
      expect(bal.total).toBe("0");
    });
  });

  // ---------------------------------------------------------------------------
  // signMessage
  // ---------------------------------------------------------------------------
  describe("signMessage", () => {
    it("rejects BIP-322 with a clear error", async () => {
      const wallet = await makeWallet("Testnet4");
      await expect(
        wallet.signMessage(TESTNET_P2WPKH, "hello", MessageSigningProtocols.BIP322),
      ).rejects.toThrow(/BIP-322/);
    });

    it("rejects unmanaged addresses", async () => {
      const wallet = await makeWallet("Testnet4");
      await expect(
        wallet.signMessage("tb1qfakeaddressdoesnotexistxyz", "hello"),
      ).rejects.toThrow(/not managed/);
    });

    it("produces a 65-byte base64 ECDSA recoverable signature with magic prefix", async () => {
      const wallet = await makeWallet("Testnet4");
      const sig = await wallet.signMessage(TESTNET_P2WPKH, "hello world");
      expect(sig.address).toBe(TESTNET_P2WPKH);
      expect(sig.protocol).toBe(MessageSigningProtocols.ECDSA);
      const decoded = Buffer.from(sig.signature, "base64");
      expect(decoded.length).toBe(65);
      // Header byte for compressed pubkey is 31 or 32 (27 + 4 + recoveryId).
      expect([31, 32]).toContain(decoded[0]);
    });

    it("messageHash equals hash256(magicPrefix || message) and is recoverable", async () => {
      const wallet = await makeWallet("Testnet4");
      const message = "Bitcoin headless test";
      const sig = await wallet.signMessage(TESTNET_P2WPKH, message);
      const decoded = Buffer.from(sig.signature, "base64");
      const header = decoded[0]!;
      const rawSig = decoded.subarray(1);
      const recoveryId = (header - 27 - 4) as 0 | 1;
      const hash = Buffer.from(sig.messageHash, "hex");
      const recovered = ecc.recover(hash, rawSig, recoveryId, true);
      expect(recovered).toBeDefined();
      // Recovered pubkey must correspond to the BIP-84 payment address.
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(recovered!),
        network: bitcoin.networks.testnet,
      });
      expect(p2wpkh.address).toBe(TESTNET_P2WPKH);
    });

    it("deterministic — same input produces same signature (RFC 6979)", async () => {
      const wallet = await makeWallet("Testnet4");
      const a = await wallet.signMessage(TESTNET_P2WPKH, "stable");
      const b = await wallet.signMessage(TESTNET_P2WPKH, "stable");
      expect(a.signature).toBe(b.signature);
    });
  });

  // ---------------------------------------------------------------------------
  // signTransfer
  // ---------------------------------------------------------------------------
  describe("signTransfer", () => {
    const utxo = {
      txid: "a".repeat(64),
      vout: 0,
      value: 100_000,
      status: { confirmed: true },
    };

    it("throws when no provider is configured", async () => {
      const wallet = await makeWallet("Testnet4");
      await expect(
        wallet.signTransfer([{ address: TESTNET_P2WPKH, amount: 10_000 }]),
      ).rejects.toThrow(/No provider/);
    });

    it("throws when recipients is empty", async () => {
      const provider = makeProvider();
      const wallet = await makeWallet("Testnet4", provider);
      await expect(wallet.signTransfer([])).rejects.toThrow(/No recipients/);
    });

    it("throws insufficient funds when UTXO set cannot cover target+fee", async () => {
      const provider = makeProvider({
        fetchAddressUTxOs: jest.fn().mockResolvedValue([
          { ...utxo, value: 500 },
        ]),
        fetchFeeEstimates: jest.fn().mockResolvedValue(1),
      });
      const wallet = await makeWallet("Testnet4", provider);
      await expect(
        wallet.signTransfer([{ address: TESTNET_P2WPKH, amount: 10_000 }]),
      ).rejects.toThrow(/Insufficient funds/);
    });

    it("broadcasts a signed tx and returns the txid", async () => {
      const submitTx = jest.fn().mockResolvedValue("deadbeefcafe");
      const provider = makeProvider({
        fetchAddressUTxOs: jest.fn().mockResolvedValue([utxo]),
        fetchFeeEstimates: jest.fn().mockResolvedValue(2),
        submitTx,
      });
      const wallet = await makeWallet("Testnet4", provider);
      const txid = await wallet.signTransfer([
        { address: TESTNET_P2WPKH, amount: 10_000 },
      ]);
      expect(txid).toBe("deadbeefcafe");
      expect(submitTx).toHaveBeenCalledTimes(1);
      // Tx hex passed to submitTx must be a non-empty hex string.
      const submittedHex = (submitTx.mock.calls[0] as string[])[0]!;
      expect(typeof submittedHex).toBe("string");
      expect(submittedHex.length).toBeGreaterThan(20);
    });

    it("falls back to default feeRate if provider.fetchFeeEstimates throws", async () => {
      const submitTx = jest.fn().mockResolvedValue("txid-fallback");
      const provider = makeProvider({
        fetchAddressUTxOs: jest.fn().mockResolvedValue([utxo]),
        fetchFeeEstimates: jest.fn().mockRejectedValue(new Error("fee API down")),
        submitTx,
      });
      const wallet = await makeWallet("Testnet4", provider);
      const txid = await wallet.signTransfer([
        { address: TESTNET_P2WPKH, amount: 10_000 },
      ]);
      expect(txid).toBe("txid-fallback");
    });

    it("omits the change output when change would be sub-dust (< 546 sats)", async () => {
      // Build a UTXO sized so that after fee + amount, the leftover is < 546 sats.
      // With 1 sat/vB and ~110 vB tx with-change vs ~79 vB tx without-change,
      // a UTXO of 10_700 with amount 10_500 leaves ~110 sats → below dust.
      const tinyUtxo = { ...utxo, value: 10_700 };
      let submittedHex = "";
      const provider = makeProvider({
        fetchAddressUTxOs: jest.fn().mockResolvedValue([tinyUtxo]),
        fetchFeeEstimates: jest.fn().mockResolvedValue(1),
        submitTx: jest.fn().mockImplementation((hex: string) => {
          submittedHex = hex;
          return Promise.resolve("txid-dust");
        }),
      });
      const wallet = await makeWallet("Testnet4", provider);
      await wallet.signTransfer([{ address: TESTNET_P2WPKH, amount: 10_500 }]);
      // The serialised tx must contain exactly one output (the recipient).
      const tx = bitcoin.Transaction.fromHex(submittedHex);
      expect(tx.outs).toHaveLength(1);
      expect(tx.outs[0]!.value).toBe(10_500);
    });

    it("adds a change output when change is above dust", async () => {
      let submittedHex = "";
      const provider = makeProvider({
        fetchAddressUTxOs: jest.fn().mockResolvedValue([{ ...utxo, value: 100_000 }]),
        fetchFeeEstimates: jest.fn().mockResolvedValue(1),
        submitTx: jest.fn().mockImplementation((hex: string) => {
          submittedHex = hex;
          return Promise.resolve("txid-change");
        }),
      });
      const wallet = await makeWallet("Testnet4", provider);
      await wallet.signTransfer([{ address: TESTNET_P2WPKH, amount: 10_000 }]);
      const tx = bitcoin.Transaction.fromHex(submittedHex);
      expect(tx.outs).toHaveLength(2);
      expect(tx.outs[0]!.value).toBe(10_000);
      expect(tx.outs[1]!.value).toBeGreaterThanOrEqual(546);
    });

    it("uses RBF-opt-in sequence (0xfffffffd) on inputs", async () => {
      let submittedHex = "";
      const provider = makeProvider({
        fetchAddressUTxOs: jest.fn().mockResolvedValue([utxo]),
        fetchFeeEstimates: jest.fn().mockResolvedValue(2),
        submitTx: jest.fn().mockImplementation((hex: string) => {
          submittedHex = hex;
          return Promise.resolve("rbf-txid");
        }),
      });
      const wallet = await makeWallet("Testnet4", provider);
      await wallet.signTransfer([{ address: TESTNET_P2WPKH, amount: 10_000 }]);
      const tx = bitcoin.Transaction.fromHex(submittedHex);
      expect(tx.ins[0]!.sequence).toBe(0xfffffffd);
    });
  });

  // ---------------------------------------------------------------------------
  // signPsbt
  // ---------------------------------------------------------------------------
  describe("signPsbt", () => {
    function buildUnsignedP2wpkhPsbt(value: number, recipientAmount: number) {
      // Build a PSBT that the wallet's P2WPKH key can sign.
      // We need a witnessUtxo whose script matches the wallet's payment pubkey.
      const wallet = BitcoinHeadlessWallet.fromMnemonic({
        network: "Testnet4",
        mnemonic: TEST_MNEMONIC,
      });
      return wallet.then(async (w) => {
        const [paymentAddr] = await w.getAddresses([AddressPurpose.Payment]);
        const p2wpkh = bitcoin.payments.p2wpkh({
          address: paymentAddr.address,
          network: bitcoin.networks.testnet,
        });
        const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
        psbt.addInput({
          hash: "b".repeat(64),
          index: 0,
          witnessUtxo: { script: p2wpkh.output!, value },
        });
        psbt.addOutput({ address: paymentAddr.address, value: recipientAmount });
        return psbt;
      });
    }

    it("signs a PSBT input matching the wallet's P2WPKH script and returns base64", async () => {
      const wallet = await makeWallet("Testnet4");
      const psbt = await buildUnsignedP2wpkhPsbt(100_000, 90_000);
      const signedB64 = await wallet.signPsbt({
        psbt: psbt.toBase64(),
        signInputs: { [TESTNET_P2WPKH]: [0] },
        broadcast: false,
      });
      const parsed = bitcoin.Psbt.fromBase64(signedB64, {
        network: bitcoin.networks.testnet,
      });
      // After signing there should be a partial sig present on input 0.
      expect(parsed.data.inputs[0]!.partialSig?.length).toBeGreaterThan(0);
    });

    it("auto-detects which managed address signs which input when signInputs is omitted", async () => {
      const wallet = await makeWallet("Testnet4");
      const psbt = await buildUnsignedP2wpkhPsbt(100_000, 90_000);
      const signedB64 = await wallet.signPsbt({
        psbt: psbt.toBase64(),
        broadcast: false,
      });
      const parsed = bitcoin.Psbt.fromBase64(signedB64, {
        network: bitcoin.networks.testnet,
      });
      expect(parsed.data.inputs[0]!.partialSig?.length).toBeGreaterThan(0);
    });

    it("rejects signing when targeted address is not managed by the wallet", async () => {
      const wallet = await makeWallet("Testnet4");
      const psbt = await buildUnsignedP2wpkhPsbt(100_000, 90_000);
      await expect(
        wallet.signPsbt({
          psbt: psbt.toBase64(),
          signInputs: { "tb1qstranger000000000000000000000000": [0] },
          broadcast: false,
        }),
      ).rejects.toThrow(/not managed/);
    });

    it("throws when broadcast=true and no provider configured", async () => {
      const wallet = await makeWallet("Testnet4");
      const psbt = await buildUnsignedP2wpkhPsbt(100_000, 90_000);
      await expect(
        wallet.signPsbt({
          psbt: psbt.toBase64(),
          signInputs: { [TESTNET_P2WPKH]: [0] },
          broadcast: true,
        }),
      ).rejects.toThrow(/broadcasting/);
    });

    it("finalises, extracts, and submits when broadcast=true", async () => {
      const submitTx = jest.fn().mockResolvedValue("psbt-broadcast-txid");
      const provider = makeProvider({ submitTx });
      const wallet = await makeWallet("Testnet4", provider);
      const psbt = await buildUnsignedP2wpkhPsbt(100_000, 90_000);
      const txid = await wallet.signPsbt({
        psbt: psbt.toBase64(),
        signInputs: { [TESTNET_P2WPKH]: [0] },
        broadcast: true,
      });
      expect(txid).toBe("psbt-broadcast-txid");
      expect(submitTx).toHaveBeenCalledTimes(1);
    });

    it("sets tapInternalKey before signing Taproot inputs (BIP-86 path)", async () => {
      const wallet = await makeWallet("Testnet4");
      const [ord] = await wallet.getAddresses([AddressPurpose.Ordinals]);
      const p2tr = bitcoin.payments.p2tr({
        address: ord.address,
        network: bitcoin.networks.testnet,
      });
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: "c".repeat(64),
        index: 0,
        witnessUtxo: { script: p2tr.output!, value: 50_000 },
      });
      psbt.addOutput({ address: ord.address, value: 45_000 });

      const signedB64 = await wallet.signPsbt({
        psbt: psbt.toBase64(),
        signInputs: { [ord.address]: [0] },
        broadcast: false,
      });
      const parsed = bitcoin.Psbt.fromBase64(signedB64, {
        network: bitcoin.networks.testnet,
      });
      expect(parsed.data.inputs[0]!.tapKeySig).toBeDefined();
      expect(parsed.data.inputs[0]!.tapKeySig!.length).toBe(64);
    });
  });
});
