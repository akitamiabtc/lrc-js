import { PixelProof, PixelProofType, getPixelDataFromProof } from "./pixel-proof";
import { YuvTransaction, YuvTransactionTypeEnum, IssueData, TransferData } from "./yuv-transaction";

export interface BitcoinUtxoDto {
    txid: string,
    hex: string,
    vout: bigint,
    value: number,
    status: BitcoinUtxoStatusDto,
}

export interface BitcoinUtxoStatusDto {
    confirmed: boolean,
    block_height: number,
    block_hash: string,
    block_time: number
}

export class BitcoinUtxo {
    constructor(
        public txid: string,
        public vout: bigint,
        public satoshis: number,
        public status: BitcoinUtxoStatus,
        public hex: string = "",
    ) {};

    public static fromBitcoinUtxoDto(utxo: BitcoinUtxoDto): BitcoinUtxo {
        return new BitcoinUtxo (
            utxo.txid,
            utxo.vout,
            utxo.value,
            BitcoinUtxoStatus.fromBitcoinUtxoStatusDto(utxo.status)
        )
    }
}

export class YuvUtxo extends BitcoinUtxo {
    innerKey: string;

    constructor(
        txid: string,
        vout: bigint,
        satoshis: number,
        status: BitcoinUtxoStatus,
        public pixel: PixelProof,
        innerKey: string,
    ) {
        super(txid, vout, satoshis, status);
        this.innerKey = innerKey;
    };

    public static fromYuvTransaction(tx: YuvTransaction, innerKey: string): [Array<YuvUtxo>, Array<YuvUtxo>]  {
        let data = undefined;
        switch(tx.tx_type.type) {
            case YuvTransactionTypeEnum.Issue:
                data = tx.tx_type.data as IssueData;
                break;
            case YuvTransactionTypeEnum.Transfer:
                data = tx.tx_type.data as TransferData;
                break;
        }

        let yuvUtxos = Array<YuvUtxo>();
        let emptyUtxos = Array<YuvUtxo>();
        if(data) {
            data.output_proofs.forEach((value, key) => {
                let txid = tx.bitcoin_tx.getId();
                let vout = BigInt(key);
                let satoshis = tx.bitcoin_tx.outs[key].value;
                let status = new BitcoinUtxoStatus(
                    true,
                );

                let pixelData = getPixelDataFromProof(value);
                if(pixelData && pixelData.innerKey != innerKey) {
                    return;
                }

                
                if(!pixelData?.pixel || (pixelData.pixel.luma.amount == 0n)) {
                    // FIXME: do in a more pretty way
                    if(value.type === PixelProofType.EmptyPixel) {
                        value = {
                            type: PixelProofType.Sig,
                            data: {
                                pixel: pixelData.pixel,
                                innerKey: innerKey
                            }
                        }
                    }
                    
                    emptyUtxos.push(
                        new YuvUtxo(
                            txid,
                            vout,
                            satoshis,
                            status,
                            value,
                            innerKey,
                        )
                    )
                    return; 
                }
                
                yuvUtxos.push(new YuvUtxo(
                    txid,
                    vout,
                    satoshis,
                    status,
                    value,
                    innerKey,
                ))
            })
        }

        return [yuvUtxos, emptyUtxos]
    }
}


export class BitcoinUtxoStatus {
    constructor(
        public confirmed: boolean,
    ) {};

    public static fromBitcoinUtxoStatusDto(status: BitcoinUtxoStatusDto): BitcoinUtxoStatus {
        return new BitcoinUtxoStatus (
            status.confirmed,
        )
    }
}

export interface BitcoinTxOut {
    bestblock: string,
    confirmations: string,
    value: bigint,
    scriptPubKey: ScriptPubKey,
    coinbase: boolean
}

export interface ScriptPubKey {
    asm: string,
    desc: string,
    hex: string,
    address: string,
    type: string
}

export class BitcoinUtxoSpentStatus {
    constructor(
        public spent: boolean,
        public txid: string,
        public vin: bigint,
        public status: BitcoinUtxoStatus
    ) {};
}