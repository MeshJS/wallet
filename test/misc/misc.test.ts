import { Cardano, Serialization } from "@cardano-sdk/core";
import { Hash28ByteBase16 } from "@cardano-sdk/crypto";
import { fromTxUnspentOutput } from "../../src/cardano/utils/converter";

describe("Miscellaneous", () => {
  it("Cardano Reward Account", () => {
    const rewardAccount = Cardano.RewardAccount.fromCredential(
      {
        hash: Hash28ByteBase16(
          "b1f70b573b204c6695b8f66eb6e7c78c55ede9430024ebec6fd5f85d"
        ),
        type: Cardano.CredentialType.KeyHash,
      },
      Cardano.NetworkId.Testnet
    );
    expect(Cardano.RewardAccount.toHash(rewardAccount)).toBe(
      "b1f70b573b204c6695b8f66eb6e7c78c55ede9430024ebec6fd5f85d"
    );
  });
  it("Convert cardano utxo", () => {
    const utxoCbor =
      "828258201bdafa9468287f21de8a0e0c222af35bcdf01f3866e5c5654deb2c8336576fe40083583900a5760fc668364b68dee98f51ad108f3b00106c47c55b3cf675dd5056415266283d57fd1379356e7fad636489ee1e8497b90cc21ab19121151a009896805820923918e403bf43c34b4ef6b48eb2ee04babed17320d8d1b9ff9ad086e86f44ec";
    const meshUtxo = fromTxUnspentOutput(
      Serialization.TransactionUnspentOutput.fromCbor(utxoCbor)
    );
    expect(meshUtxo).toEqual({
      input: {
        outputIndex: 0,
        txHash:
          "1bdafa9468287f21de8a0e0c222af35bcdf01f3866e5c5654deb2c8336576fe4",
      },
      output: {
        address:
          "addr_test1qzjhvr7xdqmyk6x7ax84rtgs3uasqyrvglz4k08kwhw4q4jp2fnzs02hl5fhjdtw07kkxeyfac0gf9aepnpp4vv3yy2s67j7tj",
        amount: [{ unit: "lovelace", quantity: "10000000" }],
        dataHash:
          "923918e403bf43c34b4ef6b48eb2ee04babed17320d8d1b9ff9ad086e86f44ec",
      },
    });

    const utxoWithInlineDatumCbor =
      "828258200bf5ed95e1507373fb112119f8279e753883a24d8bac682b636c06d42ccb36f800a300583900a5760fc668364b68dee98f51ad108f3b00106c47c55b3cf675dd5056415266283d57fd1379356e7fad636489ee1e8497b90cc21ab1912115011a00989680028201d81843d87980";
    const meshUtxoWithInlineDatum = fromTxUnspentOutput(
      Serialization.TransactionUnspentOutput.fromCbor(utxoWithInlineDatumCbor)
    );
    expect(meshUtxoWithInlineDatum).toEqual({
      input: {
        outputIndex: 0,
        txHash:
          "0bf5ed95e1507373fb112119f8279e753883a24d8bac682b636c06d42ccb36f8",
      },
      output: {
        address:
          "addr_test1qzjhvr7xdqmyk6x7ax84rtgs3uasqyrvglz4k08kwhw4q4jp2fnzs02hl5fhjdtw07kkxeyfac0gf9aepnpp4vv3yy2s67j7tj",
        amount: [
          {
            unit: "lovelace",
            quantity: "10000000",
          },
        ],
        plutusData: "d87980",
      },
    });

    const utxoWithInlineScript =
      "82825820c13981130050468ab20bbc5bd5f34c4c78d14b649ad1cfc6704180400036bc8600a300583900a5760fc668364b68dee98f51ad108f3b00106c47c55b3cf675dd5056415266283d57fd1379356e7fad636489ee1e8497b90cc21ab1912115011a0098968003d818583a8201583658340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01";
    const meshUtxoWithInlineScript = fromTxUnspentOutput(
      Serialization.TransactionUnspentOutput.fromCbor(utxoWithInlineScript)
    );
    expect(meshUtxoWithInlineScript).toEqual({
      input: {
        outputIndex: 0,
        txHash:
          "c13981130050468ab20bbc5bd5f34c4c78d14b649ad1cfc6704180400036bc86",
      },
      output: {
        address:
          "addr_test1qzjhvr7xdqmyk6x7ax84rtgs3uasqyrvglz4k08kwhw4q4jp2fnzs02hl5fhjdtw07kkxeyfac0gf9aepnpp4vv3yy2s67j7tj",
        amount: [{ unit: "lovelace", quantity: "10000000" }],
        scriptRef:
          "8201583658340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
      },
    });
  });
});
