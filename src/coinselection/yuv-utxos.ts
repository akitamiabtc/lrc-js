import { YuvUtxo } from "../types/bitcoin-utxo";
import { getPixelDataFromProof } from "../types/pixel-proof";

export class YuvUtxosCoinSelection {
  private utxos: Array<YuvUtxo>;

  constructor(utxos: Array<YuvUtxo>) {
    this.utxos = utxos;
  }

  selectUtxos(
    amounts: Array<{ chroma: string; amount: bigint }>,
  ): Array<YuvUtxo> {
    const tokensMap = new Map<string, bigint>();
    amounts.forEach((out) => {
      if (tokensMap.has(out.chroma)) {
        tokensMap.set(out.chroma, tokensMap.get(out.chroma)! + out.amount);
        return;
      }
      tokensMap.set(out.chroma, out.amount);
    });

    let tokens = new Array<{ chroma: string; amount: bigint }>();
    tokensMap.forEach((value, key) =>
      tokens.push({ chroma: key, amount: value }),
    );

    return tokens
      .map((token) => {
        const utxosToSpend = [];
        const tokenUtxos = this.utxos.filter(
          (utxo) =>
            getPixelDataFromProof(utxo.pixel!)!.pixel!.chroma.inner.toString(
              "hex",
            ) === token.chroma,
        );
        let totalAmount = BigInt(0);
        while (totalAmount < token.amount) {
          if (tokenUtxos.length < 1) {
            throw new Error(
              `Not enough YUV UTXO balance for chroma ${token.chroma}`,
            );
          }
          const utxo = tokenUtxos[tokenUtxos.length - 1];
          totalAmount += BigInt(
            getPixelDataFromProof(utxo.pixel)!.pixel!.luma.amount,
          );
          utxosToSpend.push(utxo);
          tokenUtxos.pop();
        }

        return utxosToSpend;
      })
      .flat();
  }
}
