import { MeshValue } from "@meshsdk/common";

describe("Value", () => {
  it("conversion to and from mesh value should combine assets", () => {
    expect(
      MeshValue.fromAssets([
        {
          unit: "lovelace",
          quantity: "1172951349",
        },
        {
          unit: "lovelace",
          quantity: "998427280116",
        },
        {
          unit: "lovelace",
          quantity: "2000000",
        },
        {
          unit: "922827a68ed2e816886d8f271c03f8342dfb53a45bd0a9f5ccc0ed94",
          quantity: "1502000000",
        },
      ]).toAssets(),
    ).toEqual([
      {
        unit: "lovelace",
        quantity: "999602231465",
      },
      {
        unit: "922827a68ed2e816886d8f271c03f8342dfb53a45bd0a9f5ccc0ed94",
        quantity: "1502000000",
      },
    ]);
  });
});
