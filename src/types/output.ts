import { address } from "bitcoinjs-lib";
import { Pixel } from "./pixel";
import { PixelProof, PixelProofType } from "./pixel-proof";

export class TxOutput {
    type: string; 
    satoshis: number;
  
    constructor(type: string, satoshis: number) {
      this.type = type;
      this.satoshis = satoshis;
    }
  }
  
  export class BitcoinOutput extends TxOutput {
      receiverPubKey: Buffer;
    
      constructor(receiverPubKey: Buffer, satoshis: number) {
        super('BitcoinOutput', satoshis); // Initialize the base class with the type
        this.receiverPubKey = receiverPubKey;
      }
  
      public static createFromRaw(receiverBech32: string, satoshis: number): BitcoinOutput {
        const receiverAddr = address.fromBech32(receiverBech32);
        return new BitcoinOutput(receiverAddr.data, satoshis);
    }
  
    }
    
    export class PixelOutput extends TxOutput {
      receiverPubKey: Buffer;
      pixel: Pixel;
    
      constructor(receiverPubKey: Buffer, satoshis: number, pixel: Pixel) {
        super('PixelOutput', satoshis);
        this.receiverPubKey = receiverPubKey;
        this.pixel = pixel;
      }
  
      public static createFromRaw(receiverInnerKey: Buffer, satoshis: number, pixel: Pixel): PixelOutput {
        // TODO: check on receiver data
        return new PixelOutput(receiverInnerKey, satoshis, pixel); 
      }
  
      public toPixelProof(): PixelProof {
        if(this.pixel.isEmptyPixel()) {
            return {
              type: PixelProofType.EmptyPixel,
              data: {
                pixel: this.pixel,
                innerKey: this.receiverPubKey.toString('hex'),
              }
            }
          }
          return {
          type: PixelProofType.Sig,
          data: {
            innerKey: this.receiverPubKey.toString('hex'),
            pixel: this.pixel,
          }
        }
      }
    }
    
    export class OPReturnOutput extends TxOutput {
      data: Buffer[];
    
      constructor(satoshis: number, data: Buffer[]) {
        super('OPReturnOutput', satoshis);
        this.data = data;
      }
    }