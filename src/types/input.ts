import { Pixel } from "./pixel";
import { PixelProof, PixelProofType } from "./pixel-proof";

export class TxInput {
  type: string;
  txId: string;
  index: number;
  hex: string;
  satoshis: number;

  constructor(
    type: string,
    txId: string,
    index: number,
    hex: string,
    satoshis: number,
  ) {
    this.type = type;
    this.txId = txId;
    this.index = index;
    this.hex = hex;
    this.satoshis = satoshis;
  }
}

export class BitcoinInput extends TxInput {
  constructor(txId: string, index: number, hex: string, satoshis: number) {
    super("BitcoinInput", txId, index, hex, satoshis);
  }

  public static createFromRaw(
    txId: string,
    index: number,
    hex: string,
    satoshis: number,
  ) {
    return new BitcoinInput(txId, index, hex, satoshis);
  }
}

export class PixelInput extends TxInput {
  proof: Pixel;
  innerKey: string;

  constructor(
    txId: string,
    index: number,
    hex: string,
    satoshis: number,
    proof: Pixel,
    innerKey: string,
  ) {
    super("PixelInput", txId, index, hex, satoshis);
    this.proof = proof;
    this.innerKey = innerKey;
  }

  public static createFromRaw(
    txId: string,
    index: number,
    hex: string,
    satoshis: number,
    proof: Pixel,
    innerKey: string,
  ) {
    return new PixelInput(txId, index, hex, satoshis, proof, innerKey);
  }

  toPixelProofs(): PixelProof {
    return {
      type: PixelProofType.Sig,
      data: {
        innerKey: this.innerKey,
        pixel: this.proof,
      },
    };
  }
}
