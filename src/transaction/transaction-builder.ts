import { ECPairInterface } from "ecpair";
import { OPReturnOutput, PixelOutput, TxOutput } from "../types/output";
import { ChromaAnnouncement } from "../types/yuv-transaction";
import { findNotFirstUsingFind } from "../utils/array";
import { reverseBuffer } from "../utils/buffer";
import { Psbt, Payment, payments, networks, Transaction } from "bitcoinjs-lib";
import { PixelInput, TxInput } from "../types/input";
import { Pixel } from "../types/pixel";
import { ECPair } from "../utils/constants";

export class TransactionBuilder {
  private keyPair: ECPairInterface;
  private network: networks.Network;

  constructor(keyPair: ECPairInterface, network: networks.Network) {
    this.keyPair = keyPair;
    this.network = network;
  }

  async buildAnnouncementOutput(chromaAnnouncement: ChromaAnnouncement) {
    const opReturnPrefixBuff = Buffer.from([121, 117, 118, 0, 0]);
    return {
      type: "OPReturnOutput",
      satoshis: 0,
      data: [opReturnPrefixBuff, chromaAnnouncement.toBuffer()],
    };
  }

  async buildIssuanceOutput(futureOutputs: Array<TxOutput>) {
    const pixelsOutputs = futureOutputs
      .filter((item) => item.type === "PixelOutput")
      .map((item) => item as PixelOutput);

    if (
      findNotFirstUsingFind(
        pixelsOutputs.map((pixel) => pixel.pixel.chroma.xonly),
      )
    ) {
      throw new Error("Found other chromas");
    }

    const opReturnPrefixBuff = Buffer.from([121, 117, 118, 0, 2]);
    const pixelsSum = pixelsOutputs.reduce(
      (acc, currentValue) =>
        acc + (currentValue as PixelOutput).pixel.luma.amount,
      BigInt(0),
    );
    const pixelsSumLEBuff = reverseBuffer(
      Buffer.from(pixelsSum.toString(16).padStart(32, "0").slice(0, 32), "hex"),
    );
    const chromaBuff = pixelsOutputs[0].pixel.chroma.xonly;
    return {
      type: "OPReturnOutput",
      satoshis: 0,
      data: [Buffer.concat([opReturnPrefixBuff, chromaBuff, pixelsSumLEBuff])],
    };
  }

  // TODO: build freeze
  async buildFreezeOutput() {
    throw new Error("Not implemented");
  }

  buildAndSignTransaction(
    inputs: TxInput[],
    outputs: TxOutput[],
    changeOutput: TxOutput,
    feeRateVb: number,
  ): Transaction {
    const psbt = new Psbt({ network: this.network });
    psbt.setVersion(2);
    psbt.setLocktime(0);

    let changeOutputConstructed = this.updateChangeOutput(
      psbt.clone(),
      inputs,
      outputs,
      changeOutput,
      feeRateVb,
    );
    this.constructPsbtFromInsAndOuts(
      psbt,
      [...inputs],
      [...outputs, changeOutputConstructed],
    );

    psbt.finalizeAllInputs();

    return psbt.extractTransaction();
  }

  private constructPsbtFromInsAndOuts(
    psbt: Psbt,
    inputs: TxInput[],
    outputs: TxOutput[],
  ): Psbt {
    outputs.forEach((output) => {
      psbt.addOutput({
        script: this.outputToPayment(output).output!,
        value: output.satoshis,
      });
    });

    inputs.forEach((input, i) => {
      psbt.addInput({
        hash: input.txId,
        index: input.index,
        nonWitnessUtxo: Buffer.from(input.hex, "hex"),
      });
    });

    inputs.forEach((input, i) => {
      switch (input.type) {
        case "BitcoinInput":
          psbt.signInput(i, this.keyPair);
          break;
        case "PixelInput":
          const pixelPrivateKey = Pixel.pixelPrivateKey(
            this.keyPair,
            (input as PixelInput).proof,
          );
          const tweakedKeyPair = ECPair.fromPrivateKey(pixelPrivateKey);
          psbt.signInput(i, tweakedKeyPair);
      }
    });

    return psbt;
  }

  private updateChangeOutput(
    psbt: Psbt,
    inputs: TxInput[],
    outputs: TxOutput[],
    changeOutput: TxOutput,
    feeRateVb: number,
  ) {
    const psbtToEstimate = this.constructPsbtFromInsAndOuts(psbt, inputs, [
      ...outputs,
      changeOutput,
    ]);
    const fee = Math.ceil(this.estimateFee(psbtToEstimate, feeRateVb));

    const inputsSum = this.sumSatoshis(inputs);
    const outputsSum = this.sumSatoshis(outputs);

    const change = inputsSum - outputsSum - changeOutput.satoshis - fee;

    if (change < 0) {
      throw new Error("Not enough satoshis to pay fees");
    }

    changeOutput.satoshis = changeOutput.satoshis + change;
    return changeOutput;
  }

  private estimateFee(feeEstimationPsbt: Psbt, feeRateVb: number): number {
    feeEstimationPsbt.finalizeAllInputs();

    const feeEstimationTx = feeEstimationPsbt.extractTransaction(true);
    return (
      (feeEstimationTx.virtualSize() + feeEstimationTx.ins.length) * feeRateVb
    );
  }

  private outputToPayment(output: TxOutput): Payment {
    let payment: Payment;

    switch (output.type) {
      case "BitcoinOutput":
        payment = payments.p2wpkh({
          pubkey: this.keyPair.publicKey,
          network: this.network,
        });
        break;
      case "PixelOutput":
        const pxk = Pixel.pixelPublicKey(
          (output as PixelOutput).receiverPubKey,
          (output as PixelOutput).pixel,
        );

        payment = payments.p2wpkh({
          pubkey: Buffer.from(pxk),
          network: this.network,
        });
        break;
      case "OPReturnOutput":
        payment = payments.embed({ data: (output as OPReturnOutput).data });
        break;
      default:
        throw new Error("Output type is unknown");
    }

    return payment;
  }

  private sumSatoshis(data: (TxInput | TxOutput)[]): number {
    return data.reduce(
      (accumulator, currentValue) =>
        accumulator + (currentValue as any).satoshis,
      0,
    );
  }
}
