import { BitcoinUtxo, YuvUtxo } from "../types/bitcoin-utxo";

export class BtcUtxosCoinSelection {
  private utxos: Array<BitcoinUtxo | YuvUtxo>;

  constructor(utxos: Array<BitcoinUtxo | YuvUtxo>) {
    this.utxos = utxos;
  }

  selectUtxos(
    inputsAmount: bigint,
    yuvInputsAmount: bigint,
    outputsAmount: bigint,
    feeRateVb: number,
    onlyBtcUtxos: boolean = false,
  ): Array<BitcoinUtxo | YuvUtxo> {
    // TODO: refactor this
    let approximateFeeRate =
      (11n + inputsAmount * 68n + outputsAmount * (31n + 1000n) - yuvInputsAmount * 1000n) *
      BigInt(feeRateVb * 10_000) / 10_000n;

    let feeCoveredAmount = BigInt(0);
    let utxosToSpend = [];
    let utxos = [...this.utxos];
    while (feeCoveredAmount < approximateFeeRate) {
      if (utxos.length < 1) {
        throw new Error("Not enough bitcoin UTXO balance");
      }
      const utxo = utxos[utxos.length - 1]; // Corrected this line
      utxos.pop();

      if (onlyBtcUtxos && utxo instanceof YuvUtxo) {
        continue;
      }
      feeCoveredAmount += BigInt(utxo.satoshis);
      approximateFeeRate += 68n;
      utxosToSpend.push(utxo);
    }

    // TODO: mark utxos as spent

    return utxosToSpend;
  }
}
