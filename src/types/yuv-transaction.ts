import { Transaction } from "bitcoinjs-lib";
import { plainToInstance } from "class-transformer";
import { BitcoinTransactionDto } from "./bitcoin-transaction";
import { Chroma } from "./chroma";
import { PixelProof, PixelProofDto } from "./pixel-proof";
import { Buffer } from "buffer"

export class YuvTransaction {
    constructor (
        public bitcoin_tx: Transaction,
        public tx_type: YuvTransactionType
    ) {}

    public static fromYuvTransactionDto(dto: YuvTransactionDto): YuvTransaction {
        let bitcoinTx = BitcoinTransactionDto.toTransaction(dto.bitcoin_tx);
        let yuvTxType = YuvTransactionTypeDto.toYuvTransactionType(dto.tx_type);
        
        return new YuvTransaction(
            bitcoinTx,
            yuvTxType
        );
    }
}

export type YuvTransactionType = {
    type: YuvTransactionTypeEnum.Issue,
    data: IssueData
} | {
    type: YuvTransactionTypeEnum.Transfer,
    data: TransferData
} | {
    type: YuvTransactionTypeEnum.Announcement,
    data: AnnouncementData
};

export type YuvTransactionTypeData = IssueData | TransferData | AnnouncementData;

export enum YuvTransactionTypeEnum {
    Announcement = "Announcement",
    Issue = "Issue",
    Transfer = "Transfer"
}


export enum AnnouncementDataType {
    Chroma = "Chroma",
    Issue = "Issue",
    Freeze = "Freeze"
}

export interface YuvTransactionStatusDto {
    status: YuvTransactionStatus,
    data: YuvTransactionDto
}

export type AnnouncementData = ChromaAnnouncement | IssueAnnouncement | FreezeAnnouncement;

export class ChromaAnnouncement {
  constructor(
    public chroma: Chroma,
    public name: string,
    public symbol: string,
    public decimal: number,
    public maxSupply: bigint,
    public isFreezable: boolean,
  ) {}

  public static fromChromaAnnouncementDto(
    announcement: ChromaAnnouncementDto,
  ): ChromaAnnouncement {
    let { chroma, name, symbol, decimal, max_supply, is_freezable } =
      announcement;
    return new ChromaAnnouncement(
      new Chroma(Buffer.from(chroma, "hex")),
      name,
      symbol,
      decimal,
      max_supply,
      is_freezable,
    );
  }

  public toBuffer(): Buffer {
    const decimalBytes: Buffer = Buffer.alloc(1, this.decimal);
    // console.log("DECIMAL_BYTES", decimalBytes.toString("hex"))
    // decimalBytes.writeUint8(this.decimal);

    // const maxSupplyBytes: Buffer = Buffer.alloc(16);
    // maxSupplyBytes.writeUInt16LE(this.decimal);

    const isFreezableBytes: Buffer = Buffer.alloc(1, this.isFreezable ? 1 : 0);
    // isFreezableBytes.writeUInt8(this.isFreezable ? 1 : 0, 0);

    console.log(Buffer.concat([
        this.chroma.inner,
        Buffer.from(this.name, "utf-8"),
        Buffer.from(this.symbol, "utf-8"),
        decimalBytes,
        Buffer.from(this.maxSupply.toString(16), "hex"),
        isFreezableBytes,
      ]).toString("hex"))

    return Buffer.concat([
      this.chroma.inner,
      Buffer.from(this.name, "utf-8"),
      Buffer.from(this.symbol, "utf-8"),
      decimalBytes,
      Buffer.from(this.maxSupply.toString(16), "hex"),
      isFreezableBytes,
    ]);
  }
}

export class IssueAnnouncement {
    constructor(
        public chroma: Chroma,
        public amount: bigint
    ) {};

    public toPixelAnnouncementData() {
        return { chroma: this.chroma.xonly.toString("hex"), amount: this.amount };
    } 
}

export class FreezeAnnouncement {
    constructor (
        public outpoint: FreezeTxToggle
    ) {};
}

export interface IssueData {
    announcement: { chroma: string, amount: bigint };
    input_proofs: Map<number, PixelProof>;
    output_proofs: Map<number, PixelProof>;
}

export interface TransferData {
    input_proofs: Map<number, PixelProof>;
    output_proofs: Map<number, PixelProof>;
}

export interface FreezeTxToggle {
    txid: string,
    vout: number
}

export enum YuvTransactionStatus {
    None = "none",
    Pending = "pending",
    Checked = "checked",
    Attached = "attached"
}


export class YuvTransactionDto {
    constructor(public bitcoin_tx: BitcoinTransactionDto, public tx_type: YuvTransactionTypeDto) {}

    public static fromYuvTransaction(tx: YuvTransaction): YuvTransactionDto {
        return new YuvTransactionDto(
            BitcoinTransactionDto.fromBitcoinTransaction(tx.bitcoin_tx),
            YuvTransactionTypeDto.fromYuvTransactionType(tx.tx_type)
        )
    }

    public toYuvTransaction(): YuvTransaction {
        let txType = plainToInstance(YuvTransactionTypeDto, this.tx_type);
        let bitcoinTx = plainToInstance(BitcoinTransactionDto, this.bitcoin_tx);
        return {
            tx_type: YuvTransactionTypeDto.toYuvTransactionType(txType),
            bitcoin_tx: BitcoinTransactionDto.toTransaction(bitcoinTx)
        } as YuvTransaction;
    }
}

export class YuvTransactionTypeDto {
    constructor(public type: YuvTransactionTypeEnum, public data: YuvTransactionTypeDataDto) {}

    public static fromYuvTransactionType(txType: YuvTransactionType): YuvTransactionTypeDto {
        let data: YuvTransactionTypeDataDto;

        switch(txType.type) {
            case YuvTransactionTypeEnum.Issue: {
                let txData = txType.data as IssueData;
                let outputProofs = new Map<number, PixelProofDto>();
                for(let [key, value] of txData.output_proofs.entries()) {
                    const pixelProof = PixelProofDto.fromPixelProof(value);
                    outputProofs = outputProofs.set(key, pixelProof);
                }

                data = {
                    output_proofs: outputProofs,
                    announcement: txData.announcement,
                }
                break;
            }
            case YuvTransactionTypeEnum.Transfer: {
                let txData = txType.data as TransferData;
                
                let inputProofs = new Map<number, PixelProofDto>();
                for(let [key, value] of txData.input_proofs.entries()) {
                    let pixelProof = PixelProofDto.fromPixelProof(value);
                    inputProofs = inputProofs.set(key, pixelProof);
                }

                let outputProofs = new Map<number, PixelProofDto>();
                for(let [key, value] of txData.output_proofs.entries()) {
                    let pixelProof = PixelProofDto.fromPixelProof(value);
                    outputProofs = outputProofs.set(key, pixelProof);
                }

                data = {
                    input_proofs: inputProofs,
                    output_proofs: outputProofs
                }
                break;
            }
            case YuvTransactionTypeEnum.Announcement: {
                let txData = txType.data as AnnouncementData
                
                if(txData instanceof ChromaAnnouncement) {
                    let {name, symbol, decimal} = txData;
                    data = {
                        [AnnouncementDataType.Chroma]: {
                            chroma: txData.chroma.xonly.toString("hex"),
                            name,
                            symbol,
                            decimal,
                            max_supply: txData.maxSupply,
                            is_freezable: txData.isFreezable
                        }
                    } as AnnouncementDataDto;
                } else if (txData instanceof IssueAnnouncement) {
                    data = {
                        [AnnouncementDataType.Issue]: {
                            chroma: txData.chroma.xonly.toString("hex"),
                        }
                    } as AnnouncementDataDto;
                } else if (txData instanceof FreezeAnnouncement) {
                    data = {
                        [AnnouncementDataType.Freeze]: new FreezeAnnouncement(txData.outpoint)
                    } as AnnouncementDataDto;
                }

                break;
            }
        }

        return new YuvTransactionTypeDto(
            txType.type,
            data!
        )
    }

    public static toYuvTransactionType(dto: YuvTransactionTypeDto): YuvTransactionType {
        let data: YuvTransactionTypeData;
        
        switch(dto.type) {
            case YuvTransactionTypeEnum.Issue: {
                let txData = dto.data as IssueDataDto;
                let outputProofs = new Map<number, PixelProof>();
                for(let key in txData.output_proofs) {
                    let pixelProof = txData.output_proofs[key] as PixelProofDto;
                    pixelProof = plainToInstance(PixelProofDto, pixelProof);
                    outputProofs = outputProofs.set(+key, PixelProofDto.toPixelProof(pixelProof));
                }
                
                data = {
                    announcement: txData.announcement,
                    output_proofs: outputProofs,

                } as IssueData;
                break;
            }
            case YuvTransactionTypeEnum.Transfer: {
                let txData = dto.data as TransferDataDto;

                let inputProofs = new Map<number, PixelProof>();
                for(let key in txData.input_proofs) {
                    let pixelProof = txData.input_proofs[key] as PixelProofDto;
                    pixelProof = plainToInstance(PixelProofDto, pixelProof)
                    inputProofs = inputProofs.set(+key, PixelProofDto.toPixelProof(pixelProof));
                }

                let outputProofs = new Map<number, PixelProof>();
                for(let key in txData.output_proofs) {
                    let pixelProof = txData.output_proofs[key] as PixelProofDto;
                    pixelProof = plainToInstance(PixelProofDto, pixelProof)
                    outputProofs = outputProofs.set(+key, PixelProofDto.toPixelProof(pixelProof));
                }

                data = {
                    input_proofs: inputProofs,
                    output_proofs: outputProofs
                } as TransferData;

                break;
            }
            case YuvTransactionTypeEnum.Announcement: {
                let txData = dto.data as any;

                if (txData[AnnouncementDataType.Chroma]) {
                    let announcement = txData[AnnouncementDataType.Chroma] as ChromaAnnouncementDto;
                    let {chroma, name, symbol, decimal, max_supply, is_freezable} = announcement;
                    data = new ChromaAnnouncement(
                        new Chroma(
                            Buffer.from(chroma, "hex")
                        ),
                        name,
                        symbol,
                        decimal,
                        max_supply,
                        is_freezable
                    ) as AnnouncementData;
                } else if (txData[AnnouncementDataType.Issue]) {
                    let announcement = txData[AnnouncementDataType.Issue] as IssueAnnouncementDto;
                    let {chroma, amount} = announcement;

                    data = new IssueAnnouncement(
                        new Chroma(
                            Buffer.from(chroma, "hex")
                        ),
                        amount
                    ) as AnnouncementData;
                } else if (txData[AnnouncementDataType.Freeze]) {
                    let announcement = txData[AnnouncementDataType.Freeze] as FreezeAnnouncement;
                    data = announcement as AnnouncementData;
                }

                break;
            }
        }
        return {
            type: dto.type,
            data: data!
        } as YuvTransactionType;
    }
}

export type YuvTransactionTypeDataDto = IssueDataDto | TransferDataDto | AnnouncementDataDto;

export interface IssueDataDto {
    output_proofs: any;
    announcement: object;
}

export interface TransferDataDto {
    input_proofs: any;
    output_proofs: any;
}

export type AnnouncementDataDto = {
    [AnnouncementDataType.Chroma]: ChromaAnnouncementDto
} | {
    [AnnouncementDataType.Issue]: IssueAnnouncementDto
} | {
    [AnnouncementDataType.Freeze]: FreezeAnnouncement
};

export interface ChromaAnnouncementDto {
    chroma: string,
    name: string,
    symbol: string,
    decimal: number,
    max_supply: bigint,
    is_freezable: boolean
}

export interface IssueAnnouncementDto {
    chroma: string,
    amount: bigint
}