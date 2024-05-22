import { plainToInstance } from "class-transformer";
import { Luma } from "./luma";
import { Pixel, PixelDto } from "./pixel";

export type PixelProof =
  | EmptyPixelProof
  | SigPixelProof
  | MultisigPixelProof
  | LightningCommitmentProof
  | LightningHtlc;

export enum PixelProofType {
  EmptyPixel = "EmptyPixel",
  Sig = "Sig",
  Multisig = "Multisig",
  Lightning = "Lightning",
  LightningHtlc = "LightningHtlc",
}

export interface EmptyPixelProof {
  type: PixelProofType.EmptyPixel;
  data: EmptyPixelProofData;
}

export interface SigPixelProof {
  type: PixelProofType.Sig;
  data: SigPixelProofData;
}

export interface MultisigPixelProof {
  type: PixelProofType.Multisig;
  data: MultisigPixelProofData;
}

export interface LightningCommitmentProof {
  type: PixelProofType.Lightning;
  data: LightningCommitmentProofData;
}

export interface LightningHtlc {
  type: PixelProofType.LightningHtlc;
  data: LightningHtlcProofData;
}

export type PixelProofData =
  | EmptyPixelProofData
  | SigPixelProofData
  | MultisigPixelProofData
  | LightningCommitmentProofData
  | LightningHtlcProofData;

export interface EmptyPixelProofData {
  pixel: Pixel;
  innerKey: string;
}

export interface SigPixelProofData {
  pixel: Pixel;
  innerKey: string;
}

export interface MultisigPixelProofData {
  pixel: Pixel;
  innerKeys: Array<string>;
  m: number;
}

export interface LightningCommitmentProofData {
  pixel: Pixel;
  revocationPubkey: string;
  toSelfDelay: number;
  localDelayedPubkey: string;
}

export interface LightningHtlcProofData {
  pixel: Pixel;
  data: LightningHtlcData;
}

export interface LightningHtlcData {
  revocationKeyHash: string;
  remoteHtlcKey: string;
  localHtlcKey: string;
  paymentHash: string;
  kind: HtlcScriptKind;
}

export type HtlcScriptKind = "offered" | ReceivedHtlc;

export interface ReceivedHtlc {
  cltv_expiry: number;
}

export function getPixelDataFromProof(pixelProof: PixelProof) {
  switch (pixelProof.type) {
    case PixelProofType.Sig:
      const lumaAmount = typeof pixelProof.data.pixel.luma.amount === 'string'
      // @ts-ignore
        ? BigInt(pixelProof.data.pixel.luma.amount.replace('n', ''))
        : pixelProof.data.pixel.luma.amount;
      const pixel = new Pixel(
        new Luma(
          lumaAmount,
          pixelProof.data.pixel.luma.blindingFactor.length === 0
            ? Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
            : pixelProof.data.pixel.luma.blindingFactor,
        ),
        pixelProof.data.pixel.chroma,
      );
      return { pixel: pixel, innerKey: pixelProof.data.innerKey };
    case PixelProofType.EmptyPixel:
      return { pixel: Pixel.emptyPixel(), innerKey: pixelProof.data.innerKey };
    default:
      throw new Error("Pixel data is not supported");
  }
}

export class PixelProofDto {
  constructor(
    public type: PixelProofType,
    public data: PixelProofDataDto,
  ) {}

  public static fromPixelProof(proof: PixelProof): PixelProofDto {
    let data: PixelProofDataDto;
    switch (proof.type) {
      case PixelProofType.EmptyPixel:
        data = EmptyPixelProofDataDto.fromPixelProofData(proof.data);
        break;
      case PixelProofType.Sig:
        data = SigPixelProofDataDto.fromPixelProofData(proof.data);
        break;
      case PixelProofType.Multisig:
        data = MultisigPixelProofDataDto.fromPixelProofData(proof.data);
        break;
      case PixelProofType.Lightning:
        data = LightningCommitmentProofDataDto.fromPixelProofData(proof.data);
        break;
      case PixelProofType.LightningHtlc:
        data = LightningHtlcProofDataDto.fromPixelProofData(proof.data);
        break;
    }

    return new PixelProofDto(proof.type, data);
  }

  public static toPixelProof(dto: PixelProofDto): PixelProof {
    let data: PixelProofDataDto;
    switch (dto.type) {
      case PixelProofType.EmptyPixel:
        data = plainToInstance(EmptyPixelProofDataDto, dto.data);
        break;
      case PixelProofType.Sig:
        data = plainToInstance(SigPixelProofDataDto, dto.data);
        break;
      case PixelProofType.Multisig:
        data = plainToInstance(MultisigPixelProofDataDto, dto.data);
        break;
      case PixelProofType.Lightning:
        data = plainToInstance(LightningCommitmentProofDataDto, dto.data);
        break;
      case PixelProofType.LightningHtlc:
        data = plainToInstance(LightningHtlcProofDataDto, dto.data);
        break;
    }
    return {
      type: dto.type,
      data: data.toPixelProofData(),
    } as PixelProof;
  }
}

export type PixelProofDataDto =
  | EmptyPixelProofDataDto
  | SigPixelProofDataDto
  | MultisigPixelProofDataDto
  | LightningCommitmentProofDataDto
  | LightningHtlcProofDataDto;

export class EmptyPixelProofDataDto {
  constructor(public inner_key: string) {}

  public static fromPixelProofData(data: PixelProofData): PixelProofDataDto {
    let proofData = data as EmptyPixelProofData;
    return new EmptyPixelProofDataDto(proofData.innerKey);
  }

  public toPixelProofData(): PixelProofData {
    return {
      innerKey: this.inner_key,
    } as EmptyPixelProofData;
  }
}

export class SigPixelProofDataDto {
  constructor(
    public pixel: PixelDto,
    public inner_key: string,
  ) {}

  public static fromPixelProofData(data: PixelProofData): PixelProofDataDto {
    let proofData = data as SigPixelProofData;
    let pixel = PixelDto.fromPixel(proofData.pixel);

    return new SigPixelProofDataDto(pixel, proofData.innerKey);
  }

  public toPixelProofData(): PixelProofData {
    let pixel = plainToInstance(PixelDto, this.pixel);
    return {
      pixel: pixel.toPixel(),
      innerKey: this.inner_key,
    } as SigPixelProofData;
  }
}

export class MultisigPixelProofDataDto {
  constructor(
    public pixel: PixelDto,
    public inner_keys: Array<string>,
    public m: number,
  ) {}

  public static fromPixelProofData(data: PixelProofData): PixelProofDataDto {
    let proofData = data as MultisigPixelProofData;
    let pixel = PixelDto.fromPixel(proofData.pixel);

    return new MultisigPixelProofDataDto(
      pixel,
      proofData.innerKeys,
      proofData.m,
    );
  }

  public toPixelProofData(): PixelProofData {
    let pixel = plainToInstance(PixelDto, this.pixel);
    return {
      pixel: pixel.toPixel(),
      innerKeys: this.inner_keys,
    } as MultisigPixelProofData;
  }
}

export class LightningCommitmentProofDataDto {
  constructor(
    public pixel: PixelDto,
    public revocationPubkey: string,
    public toSelfDelay: number,
    public localDelayedPubkey: string,
  ) {}

  public static fromPixelProofData(data: PixelProofData): PixelProofDataDto {
    let proofData = data as LightningCommitmentProofData;
    let pixel = PixelDto.fromPixel(proofData.pixel);

    return new LightningCommitmentProofDataDto(
      pixel,
      proofData.revocationPubkey,
      proofData.toSelfDelay,
      proofData.localDelayedPubkey,
    );
  }

  public toPixelProofData(): PixelProofData {
    let pixel = plainToInstance(PixelDto, this.pixel);
    return {
      pixel: pixel.toPixel(),
      revocationPubkey: this.revocationPubkey,
      toSelfDelay: this.toSelfDelay,
      localDelayedPubkey: this.localDelayedPubkey,
    } as LightningCommitmentProofData;
  }
}

export class LightningHtlcProofDataDto {
  constructor(
    public pixel: PixelDto,
    public data: LightningHtlcData,
  ) {}

  public static fromPixelProofData(data: PixelProofData): PixelProofDataDto {
    let proofData = data as LightningHtlcProofData;
    let pixel = PixelDto.fromPixel(proofData.pixel);

    return new LightningHtlcProofDataDto(pixel, proofData.data);
  }

  public toPixelProofData(): PixelProofData {
    let pixel = plainToInstance(PixelDto, this.pixel);
    return {
      pixel: pixel.toPixel(),
      data: this.data,
    } as LightningHtlcProofData;
  }
}
