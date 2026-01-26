import { OfflineFetcher } from "@meshsdk/provider";
import { MeshCardanoBrowserWallet } from "../../src/cardano/wallet/browser/mesh-browser-wallet";
import { fromTxUnspentOutput } from "../../src/cardano/utils/converter";
import { Serialization } from "@cardano-sdk/core";
import { CardanoBrowserWallet } from "../../src/cardano/wallet/browser/cardano-browser-wallet";

describe("CIP-30 endpoints", () => {
  let meshCardanoBrowserWallet: MeshCardanoBrowserWallet;
  const offlineFetcher = new OfflineFetcher();

  const utxosHex = [
    "828258202e20c10271bfcb5eac7ca90f0f66981042b66ffe088ec2e74d2244dacf1680c00082581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f821a000ffb22a1581cd213852f90d323b1240774b96a653945ba0152213ff43a51fbd6162aa14b4d657368546f6b656e303101",
    "828258206971384d6636b9258bb0f507201427cc6b7690d60a5eba11cca90359a18afe9e0082581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a00124f80",
  ];

  offlineFetcher.addUTxOs(
    utxosHex.map((utxo) => {
      return fromTxUnspentOutput(
        Serialization.TransactionUnspentOutput.fromCbor(utxo)
      );
    })
  );

  beforeEach(async () => {
    (globalThis as any).cardano = {
      eternl: {
        supportedExtensions: [
          {
            cip: 30,
          },
          {
            cip: 95,
          },
          {
            cip: 103,
          },
          {
            cip: 104,
          },
          {
            cip: 142,
          },
        ],
        experimental: {
          appVersion: {
            major: 2,
            minor: 0,
            patch: 16,
            build: 0,
          },
        },
        apiVersion: "0.1.0",
        name: "eternl",
        enable: async () => {
          return {
            getBalance: async () => {
              return "821a9ded8bb6b0581c0648e3795e3402c4f93ffd7e76d7741a7e449ae1a769c0297b798813a24b4d657368546f6b656e3031034b4d657368546f6b656e303303581c0ba402c042775dfffedbd958cae3805a281bad34f46b5b6fd5c2c771a1494d657368546f6b656e01581c0c5d5669f4b2c0c7be0dc771b387c4f2b55396d8b47701f82476e930a14b4d657368546f6b656e303102581c2ae6f72c24d6e8866318b5d8512a7d6bd71f48421bfd5965aa6e8ea1a14b4d657368546f6b656e303101581c3341fe984c724915cebac76ff65251df422f21fc75587ddc5f578ad7a145506172747901581c418f4cdc47b56879028737b4c19a648a3e72776b3ff6edf6563aaac9a24b4d657368546f6b656e3031024b4d657368546f6b656e303302581c839680d91609accded1eca1dcfd2bd715b45ebe052321f52727ea091a1494d657368546f6b656e01581c974966e3b5f81f3bf32054c09bd4bae7f123d674eb3958925e5b3377a1496d657368202831302901581cb8df5676f026a61bc6435621df48217b3e652ea63f34e15113cbc456a14d546f6b656e303133323432333402581cc1d3d06522380d6380ec3e52ec6dfd96f0ce8005bb14df811455d20fa14b4d657368546f6b656e303102581cc69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913a1445553444d1b00000006fc1469d5581cc76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a334305a2493232322e6b756e7a61014a3232326a696e676c657301581cce5a4e6ea5819e96581a4b5680a4a5f94dec4337beade12e3851d01ca14b4d657368546f6b656e303102581cd213852f90d323b1240774b96a653945ba0152213ff43a51fbd6162aa24b4d657368546f6b656e3031064b4d657368546f6b656e303306581cd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527a1494d657368546f6b656e02581cee0b96031993a01dafa0c271439814426fd7d24395e96877cd8853f2a14f446f6c6c61722070726f766964657201";
            },
            getChangeAddress: async () => {
              return "005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6";
            },
            getCollateral: async () => {
              return [
                "82825820ff75de215ec3adbc3007e877bbce5e9936bfcb16112c5cbc58111dfd0c5a73a50082581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a004c4b40",
                "82825820d0e6eb766b2e4fcbc3333dc4bf8cb4dfad173631ea1e2b59a8a3a0d0ae56f6c90082581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a004c4b40",
                "82825820cf1955668990bd4019102df7734f3267f053dbef36bb3e7c4a70917a19e93e2e0082581d605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f1a004c4b40",
              ];
            },
            getNetworkId: async () => {
              return 0;
            },
            getRewardAddresses: async () => {
              return [
                "e09d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
              ];
            },
            getUsedAddresses: async () => {
              return [
                "005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00cf96d30abbb629a5e9ee70ded61b118b63c3ea608e20c4d9dad4a3b79d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00e97150d1ddb49215fbbc2c6a3d875eef0c6fa663c97326f0e61239049d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "009b9001d6f722d48d64f3b7a95a8bd5441be5a8092d0e3965064498cc9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "005d110a36a81e9fb198d89fcc963e0d6ce4e53453afea7c5c7cab158f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00f363baf562335ff18b2c81fed70a5c8b11b65638293a002b43b6889b9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00e67a40f89840e5aa9e23bbcb7e639c6e41f205496090fa8e2df72c909d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00aa048e4cc8a1e67e1d97ffbd4be614388014cbc2b2451527202943b69d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "009e1dc7b577665ac48b8da4b112cb2bb96f7b3994437548746eba3fe89d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00603267a64a4d5952e3acb4b950aed4a55fe7488ae0460429c4a188329d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00ddbede9594d90c1ffb257f7bfc471a5ca84f185c8784a75159941cd09d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "000d0962d7dcfc66f9f1a86ac0bf3a7928f20ed0be1f6de758d90f35529d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "004bcad36016bd1513b1e3c88e61f6d91faafdf9cfd157a4d666d432df9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "007d7de68f2447ef9ab7272e649510245ff2fc70693e780445ee7a309c9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0092f5e1890ec1e364023f6470aa28c9a5966a126e5793c75b877cb6d19d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00dc7a19f0190fc469ec45d22dd1632f60d0567a535497d819f88f75d29d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "001e553fee8ff6ef66c7cb961c20294d6965c3cdfef70653a301932d129d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0072634f37ea6a5e9cbb87025f6cbbc954c257a8d81642e76126f1741c9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00f1d0f34cd582704ac04f48f49c7f00879900d915f577fb7875e7adb39d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0010f6ab410abf517b92caebe094dc3776055ce66514f96762577ce7ba9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00c3b930ccbe1c4e923071550d86bd1aca8f8a269d1036a6dbd11e97c69d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0003a2eaa20aae50b56763a4026e36d4fa3735fb59520aec80bd64885e9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00f479df2f80a5eedfdb62e4c953239123ae94d0b569975e82188077a69d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00bed3490d456ac60453f3b5284095b52b5d99ad2aa9963d1365c6d7219d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0040ad2800e303b78e0603e4ad8d95f8eb92261591854bb5614b4fefd69d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00de5823ff4db8fb2fa6185fd59338d993fcdaf1ca918a6bf1118c11b19d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00b2d332d947c07e2df8b4409fc841d8a8d2845258a2fedbfdd6ba26729d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "008335f80fe80d09ffe0f66a56a378b6a89bda2131406026a13cafdd739d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00eaee1bac732efd9a341825530196e4c29d95b50aa8f9e09afe5c55be9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00fe01161723018c121123523f4816020777ca0951032d3f1429faa4559d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "008d47377666d0ccb0a368d6dee0a428f27b9c7b17b58b8cf0872fcbb49d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00e3552262e1f9e52d362e59a936349df7d32341d0211c02cd02017c999d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00a3ca058e6c5c7ab26ad07f357bfb61347459a87841a61656fe181bc19d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0006c6dfc9655a0855639dd06d28f26cbe674d9435103277a46012e3999d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "004b9f7436f60ef4b53cdc62960b4076ad1159a546b363389905b065699d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00f4a03be26d71f51b2d5e2e46bb4b38f8e5c50179f8afc2d27367e7da9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00aead28806b124c438c9f6ec0c8a4354060ab3aa426aa2e9885bd26539d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00265999bd132c681d8ec206f8c043ce750d906e29827ae84bdbaab11f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00e20cf56e9f7f0167bd9b877bfde31a9dcbaf3016a9217f28639cd1459d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "008085f6e86222bb4c8cf81e0af807fc729724af79f106bda26eec96889d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0043f5e7e299c6f95f63aed9736c189e218a2de102fa0e69cf249b39129d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00a9cf1d76cda5114b552ffde5637e88ae839387032feef7116aca8dcb9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "000017f91d58a6a4547d7ede7609dc6475d18172a2ee1cbb4d2b595b319d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00956c548b77b368229fe270e40c2791aa70c8ae761849c4b6ff270ba19d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "006d86cc996ede973ea5785c997c4178f4a6faabbe95722bce6289b3b09d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "002bd2c8c8f1d5841613ed928521fe235195a0eaae63ada82f173e41ef9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0071029673f15a4b9bb6381c97ba3d729332790d479ed3a5ccb0829d959d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "002e7691e3ab4f26602023c8eac5d3ee918c9f4ca15f90c56bfea80a479d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00ae4078d1b67f7b7bacdffafbadf52c36cfa7941be8f49e14979cb7aa9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "004fc7a5384c6149e8532c6f9887b9f0d071f02749dcef7f1cd020c9649d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00602d50806da923cd520866eb29cb52e05967435ad14264452b1a3b1e9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "003ce62fa589e70a5b63ae1b95108feaf24e002e3002df3f182c1766239d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "007f8b6508d7faf53f0fcd99006d246d2b3000f1b7f6cda014028696d39d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00724ea735c5a42049e88ca99979e1c7adfae7645a8833bee94d1caeaa9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0026462b4ac0449ca9c95e8eb8b9cc7d9cd686f9b09af1b3209af895349d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00265277ceaa10644ddd54c530dcbae77d485bbc22dbea17a562ca53fd9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0005149a59f7174f6214301ebe772d4ed1cf7b60151f7c957b86891f649d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00109492208261b8a6254e66172a8fa3430c1a5c657a605ace0b088e3d9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00c230ad7cafb65b9ec99d9ef4757a37a690013971b76965b151f945a99d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "002e2ea266a037188637a3d534797874b5c83933e546caec1a0b64bb5f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "005c43a60ca94abcc88b2371890abf7bed62871c84fbcdedf514cc4efc9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "002abbd5efb802cfd65b941b816e968f9e391e23ec3fe8dd663c559d389d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "002ee2ed8891ed5d018cd70eab39b410ddc6d04991e079610c31f3ff9c9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "000f3e4dcb7850434da132c48bffff8516db1c57a22491e7e3a7b3f8569d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00bbd3aada2493326a9c168f7c6b747e2257f0f9928d8755a19a7475d59d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "006890f7274cff6a943e6a6ae0b90eba49ee79fc33e44c7d4f6c32dd639d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00bf52f88c346a208a9f75a4e466d228b87bcd8111cac67c063c22ecb29d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "007575237ad445e09d11d7163a6039a14a5522ae235164a84abf850a399d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00116c04d8dcf7113f3615a5b28fdc39148ad62724e60038b5941320579d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0003a16b613fd88d75fd8a4a4abb6f96f130af4578d46035f77ebe90e69d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00709503e33035fc4f13b6b2af0a5271be786c8a547a072117ecf8aac99d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0092d0f44923028e58c1e01050186bec4132245b705c367a35d1ef4ce19d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "005da684372eda796ef9ce74dc3a086b2cdda1e1ae7bee0a70216ba2729d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "005d8f9533e2d611dddc3961e008eeb9955e3eea63d660f57bfe2ae8449d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "007ee117c92a8a4486e52fba3f445e2100f51c7449a453bea9f893baa69d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00be627364defaa14bab213038eb784dc9506a561fabb5208e7a398fdb9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "00f7ea1db70f5d6f405e3519e07d46c83ee28c7bb1b7bfbefb86de32e39d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0013716a100b4499ac3c48ab2a955bc6f97b6549c96e3879c1b4fd38019d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "0081bb100eaaab4d1347671d428a94e77d1a844d321aefcb2afe5e85539d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
                "605867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f",
                "60cf96d30abbb629a5e9ee70ded61b118b63c3ea608e20c4d9dad4a3b7",
                "60e97150d1ddb49215fbbc2c6a3d875eef0c6fa663c97326f0e6123904",
                "609b9001d6f722d48d64f3b7a95a8bd5441be5a8092d0e3965064498cc",
                "605d110a36a81e9fb198d89fcc963e0d6ce4e53453afea7c5c7cab158f",
                "60f363baf562335ff18b2c81fed70a5c8b11b65638293a002b43b6889b",
                "60e67a40f89840e5aa9e23bbcb7e639c6e41f205496090fa8e2df72c90",
                "60aa048e4cc8a1e67e1d97ffbd4be614388014cbc2b2451527202943b6",
                "609e1dc7b577665ac48b8da4b112cb2bb96f7b3994437548746eba3fe8",
                "60603267a64a4d5952e3acb4b950aed4a55fe7488ae0460429c4a18832",
                "60ddbede9594d90c1ffb257f7bfc471a5ca84f185c8784a75159941cd0",
                "600d0962d7dcfc66f9f1a86ac0bf3a7928f20ed0be1f6de758d90f3552",
                "604bcad36016bd1513b1e3c88e61f6d91faafdf9cfd157a4d666d432df",
                "607d7de68f2447ef9ab7272e649510245ff2fc70693e780445ee7a309c",
                "6092f5e1890ec1e364023f6470aa28c9a5966a126e5793c75b877cb6d1",
                "60dc7a19f0190fc469ec45d22dd1632f60d0567a535497d819f88f75d2",
                "601e553fee8ff6ef66c7cb961c20294d6965c3cdfef70653a301932d12",
                "6072634f37ea6a5e9cbb87025f6cbbc954c257a8d81642e76126f1741c",
                "60f1d0f34cd582704ac04f48f49c7f00879900d915f577fb7875e7adb3",
                "6010f6ab410abf517b92caebe094dc3776055ce66514f96762577ce7ba",
                "60c3b930ccbe1c4e923071550d86bd1aca8f8a269d1036a6dbd11e97c6",
                "6003a2eaa20aae50b56763a4026e36d4fa3735fb59520aec80bd64885e",
                "60f479df2f80a5eedfdb62e4c953239123ae94d0b569975e82188077a6",
                "60bed3490d456ac60453f3b5284095b52b5d99ad2aa9963d1365c6d721",
                "6040ad2800e303b78e0603e4ad8d95f8eb92261591854bb5614b4fefd6",
                "60de5823ff4db8fb2fa6185fd59338d993fcdaf1ca918a6bf1118c11b1",
                "60b2d332d947c07e2df8b4409fc841d8a8d2845258a2fedbfdd6ba2672",
                "608335f80fe80d09ffe0f66a56a378b6a89bda2131406026a13cafdd73",
                "60eaee1bac732efd9a341825530196e4c29d95b50aa8f9e09afe5c55be",
                "60fe01161723018c121123523f4816020777ca0951032d3f1429faa455",
                "608d47377666d0ccb0a368d6dee0a428f27b9c7b17b58b8cf0872fcbb4",
                "60e3552262e1f9e52d362e59a936349df7d32341d0211c02cd02017c99",
                "60a3ca058e6c5c7ab26ad07f357bfb61347459a87841a61656fe181bc1",
                "6006c6dfc9655a0855639dd06d28f26cbe674d9435103277a46012e399",
                "604b9f7436f60ef4b53cdc62960b4076ad1159a546b363389905b06569",
                "60f4a03be26d71f51b2d5e2e46bb4b38f8e5c50179f8afc2d27367e7da",
                "60aead28806b124c438c9f6ec0c8a4354060ab3aa426aa2e9885bd2653",
                "60265999bd132c681d8ec206f8c043ce750d906e29827ae84bdbaab11f",
                "60e20cf56e9f7f0167bd9b877bfde31a9dcbaf3016a9217f28639cd145",
                "608085f6e86222bb4c8cf81e0af807fc729724af79f106bda26eec9688",
                "6043f5e7e299c6f95f63aed9736c189e218a2de102fa0e69cf249b3912",
                "60a9cf1d76cda5114b552ffde5637e88ae839387032feef7116aca8dcb",
                "600017f91d58a6a4547d7ede7609dc6475d18172a2ee1cbb4d2b595b31",
                "60956c548b77b368229fe270e40c2791aa70c8ae761849c4b6ff270ba1",
                "606d86cc996ede973ea5785c997c4178f4a6faabbe95722bce6289b3b0",
                "602bd2c8c8f1d5841613ed928521fe235195a0eaae63ada82f173e41ef",
                "6071029673f15a4b9bb6381c97ba3d729332790d479ed3a5ccb0829d95",
                "602e7691e3ab4f26602023c8eac5d3ee918c9f4ca15f90c56bfea80a47",
                "60ae4078d1b67f7b7bacdffafbadf52c36cfa7941be8f49e14979cb7aa",
                "604fc7a5384c6149e8532c6f9887b9f0d071f02749dcef7f1cd020c964",
                "60602d50806da923cd520866eb29cb52e05967435ad14264452b1a3b1e",
                "603ce62fa589e70a5b63ae1b95108feaf24e002e3002df3f182c176623",
                "607f8b6508d7faf53f0fcd99006d246d2b3000f1b7f6cda014028696d3",
                "60724ea735c5a42049e88ca99979e1c7adfae7645a8833bee94d1caeaa",
                "6026462b4ac0449ca9c95e8eb8b9cc7d9cd686f9b09af1b3209af89534",
                "60265277ceaa10644ddd54c530dcbae77d485bbc22dbea17a562ca53fd",
                "6005149a59f7174f6214301ebe772d4ed1cf7b60151f7c957b86891f64",
                "60109492208261b8a6254e66172a8fa3430c1a5c657a605ace0b088e3d",
                "60c230ad7cafb65b9ec99d9ef4757a37a690013971b76965b151f945a9",
                "602e2ea266a037188637a3d534797874b5c83933e546caec1a0b64bb5f",
                "605c43a60ca94abcc88b2371890abf7bed62871c84fbcdedf514cc4efc",
                "602abbd5efb802cfd65b941b816e968f9e391e23ec3fe8dd663c559d38",
                "602ee2ed8891ed5d018cd70eab39b410ddc6d04991e079610c31f3ff9c",
                "600f3e4dcb7850434da132c48bffff8516db1c57a22491e7e3a7b3f856",
                "60bbd3aada2493326a9c168f7c6b747e2257f0f9928d8755a19a7475d5",
                "606890f7274cff6a943e6a6ae0b90eba49ee79fc33e44c7d4f6c32dd63",
                "60bf52f88c346a208a9f75a4e466d228b87bcd8111cac67c063c22ecb2",
                "607575237ad445e09d11d7163a6039a14a5522ae235164a84abf850a39",
                "60116c04d8dcf7113f3615a5b28fdc39148ad62724e60038b594132057",
                "6003a16b613fd88d75fd8a4a4abb6f96f130af4578d46035f77ebe90e6",
                "60709503e33035fc4f13b6b2af0a5271be786c8a547a072117ecf8aac9",
                "6092d0f44923028e58c1e01050186bec4132245b705c367a35d1ef4ce1",
                "605da684372eda796ef9ce74dc3a086b2cdda1e1ae7bee0a70216ba272",
                "605d8f9533e2d611dddc3961e008eeb9955e3eea63d660f57bfe2ae844",
                "607ee117c92a8a4486e52fba3f445e2100f51c7449a453bea9f893baa6",
                "60be627364defaa14bab213038eb784dc9506a561fabb5208e7a398fdb",
                "60f7ea1db70f5d6f405e3519e07d46c83ee28c7bb1b7bfbefb86de32e3",
                "6013716a100b4499ac3c48ab2a955bc6f97b6549c96e3879c1b4fd3801",
                "6081bb100eaaab4d1347671d428a94e77d1a844d321aefcb2afe5e8553",
              ];
            },
            getUnusedAddresses: async () => {
              return [
                "005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
              ];
            },
            getUtxos: async () => {
              return utxosHex;
            },
            signData: async (addressHex: string, data: string) => {
              return {
                signature:
                  "845846a2012767616464726573735839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6a166686173686564f441ab58405fdb1b2006cba85db90a2edb254317ade112d72883d9f28956fc3337104a6ee74ca2e252163c2f790ca23e0d3c96205e0bf9d460cca4fc325f49db65b8741d0b",
                key: "a4010103272006215820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f95",
              };
            },
          };
        },
      },
    };

    meshCardanoBrowserWallet = new MeshCardanoBrowserWallet(
      await CardanoBrowserWallet.enable("eternl")
    );
  });
  it("Wallet balance test", async () => {
    const browserBalance = await meshCardanoBrowserWallet.getBalanceMesh();
    expect(browserBalance).toEqual([
      { unit: "lovelace", quantity: "2649590710" },
      {
        unit: "0648e3795e3402c4f93ffd7e76d7741a7e449ae1a769c0297b7988134d657368546f6b656e3031",
        quantity: "3",
      },
      {
        unit: "0648e3795e3402c4f93ffd7e76d7741a7e449ae1a769c0297b7988134d657368546f6b656e3033",
        quantity: "3",
      },
      {
        unit: "0ba402c042775dfffedbd958cae3805a281bad34f46b5b6fd5c2c7714d657368546f6b656e",
        quantity: "1",
      },
      {
        unit: "0c5d5669f4b2c0c7be0dc771b387c4f2b55396d8b47701f82476e9304d657368546f6b656e3031",
        quantity: "2",
      },
      {
        unit: "2ae6f72c24d6e8866318b5d8512a7d6bd71f48421bfd5965aa6e8ea14d657368546f6b656e3031",
        quantity: "1",
      },
      {
        unit: "3341fe984c724915cebac76ff65251df422f21fc75587ddc5f578ad75061727479",
        quantity: "1",
      },
      {
        unit: "418f4cdc47b56879028737b4c19a648a3e72776b3ff6edf6563aaac94d657368546f6b656e3031",
        quantity: "2",
      },
      {
        unit: "418f4cdc47b56879028737b4c19a648a3e72776b3ff6edf6563aaac94d657368546f6b656e3033",
        quantity: "2",
      },
      {
        unit: "839680d91609accded1eca1dcfd2bd715b45ebe052321f52727ea0914d657368546f6b656e",
        quantity: "1",
      },
      {
        unit: "974966e3b5f81f3bf32054c09bd4bae7f123d674eb3958925e5b33776d6573682028313029",
        quantity: "1",
      },
      {
        unit: "b8df5676f026a61bc6435621df48217b3e652ea63f34e15113cbc456546f6b656e3031333234323334",
        quantity: "2",
      },
      {
        unit: "c1d3d06522380d6380ec3e52ec6dfd96f0ce8005bb14df811455d20f4d657368546f6b656e3031",
        quantity: "2",
      },
      {
        unit: "c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c9135553444d",
        quantity: "29999000021",
      },
      {
        unit: "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a3343053232322e6b756e7a61",
        quantity: "1",
      },
      {
        unit: "c76c35088ac826c8a0e6947c8ff78d8d4495789bc729419b3a3343053232326a696e676c6573",
        quantity: "1",
      },
      {
        unit: "ce5a4e6ea5819e96581a4b5680a4a5f94dec4337beade12e3851d01c4d657368546f6b656e3031",
        quantity: "2",
      },
      {
        unit: "d213852f90d323b1240774b96a653945ba0152213ff43a51fbd6162a4d657368546f6b656e3031",
        quantity: "6",
      },
      {
        unit: "d213852f90d323b1240774b96a653945ba0152213ff43a51fbd6162a4d657368546f6b656e3033",
        quantity: "6",
      },
      {
        unit: "d9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e",
        quantity: "2",
      },
      {
        unit: "ee0b96031993a01dafa0c271439814426fd7d24395e96877cd8853f2446f6c6c61722070726f7669646572",
        quantity: "1",
      },
    ]);
  });

  it("Wallet change address test", async () => {
    // Change address should be the same for single address wallets
    const browserChangeAddress =
      await meshCardanoBrowserWallet.getChangeAddressBech32();
    expect(browserChangeAddress).toBe(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9"
    );
  });

  it("Wallet collateral test", async () => {
    const browserCollateral = await meshCardanoBrowserWallet.getCollateralMesh();
    expect(browserCollateral).toEqual([
      {
        input: {
          outputIndex: 0,
          txHash:
            "ff75de215ec3adbc3007e877bbce5e9936bfcb16112c5cbc58111dfd0c5a73a5",
        },
        output: {
          address:
            "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
          amount: [
            {
              unit: "lovelace",
              quantity: "5000000",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 0,
          txHash:
            "d0e6eb766b2e4fcbc3333dc4bf8cb4dfad173631ea1e2b59a8a3a0d0ae56f6c9",
        },
        output: {
          address:
            "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
          amount: [
            {
              unit: "lovelace",
              quantity: "5000000",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 0,
          txHash:
            "cf1955668990bd4019102df7734f3267f053dbef36bb3e7c4a70917a19e93e2e",
        },
        output: {
          address:
            "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
          amount: [
            {
              unit: "lovelace",
              quantity: "5000000",
            },
          ],
        },
      },
    ]);
  });

  it("Wallet utxos test", async () => {
    const browserUtxos = await meshCardanoBrowserWallet.getUtxosMesh();
    expect(browserUtxos).toEqual([
      {
        input: {
          outputIndex: 0,
          txHash:
            "2e20c10271bfcb5eac7ca90f0f66981042b66ffe088ec2e74d2244dacf1680c0",
        },
        output: {
          address:
            "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
          amount: [
            {
              unit: "lovelace",
              quantity: "1047330",
            },
            {
              unit: "d213852f90d323b1240774b96a653945ba0152213ff43a51fbd6162a4d657368546f6b656e3031",
              quantity: "1",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 0,
          txHash:
            "6971384d6636b9258bb0f507201427cc6b7690d60a5eba11cca90359a18afe9e",
        },
        output: {
          address:
            "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
          amount: [
            {
              unit: "lovelace",
              quantity: "1200000",
            },
          ],
        },
      },
    ]);
  });

  it("Wallet network id test", async () => {
    const browserNetworkId = await meshCardanoBrowserWallet.getNetworkId();
    expect(browserNetworkId).toBe(0);
  });

  it("Wallet reward addresses test", async () => {
    const browserRewardAddresses =
      await meshCardanoBrowserWallet.getRewardAddressesBech32();
    expect(browserRewardAddresses).toEqual([
      "stake_test1uzw5mnt7g4xjgdqkfa80hrk7kdvds6sa4k0vvgjvlj7w8eskffj2n",
    ]);
  });
});
