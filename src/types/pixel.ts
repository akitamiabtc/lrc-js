import { crypto } from 'bitcoinjs-lib';
import { plainToInstance } from 'class-transformer';
import { ECPairInterface } from 'ecpair';
import { privateNegate, privateAdd, pointMultiply, pointAdd } from 'tiny-secp256k1';
import { PARITY, G } from '../utils/constants';
import { Chroma } from './chroma';
import { Luma } from './luma';

export class PixelDto {
    constructor(public luma: LumaDto, public chroma: string) {}

    public static fromPixel(pixel: Pixel): PixelDto {
        return new PixelDto(
            LumaDto.fromLuma(pixel.luma),
            pixel.chroma.xonly.toString('hex')
        );
    } 

    public toPixel(): Pixel {
        let luma = plainToInstance(LumaDto, this.luma);
        return new Pixel(
            luma.toLuma(),
            new Chroma(
                Buffer.from(this.chroma, "hex")
            )
        )
    }
}

export class LumaDto {
    constructor(public amount: bigint, public blinding_factor: number[]) {}

    public static fromLuma(luma: Luma): LumaDto {
        return new LumaDto(
            luma.amount,
            Array.from(luma.blindingFactor)
        );
    } 

    public toLuma(): Luma {
        return new Luma(
            this.amount,
            this.blinding_factor ? Uint8Array.from(this.blinding_factor) : Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
        )
    }
}

export class Pixel {
    constructor(public luma: Luma, public chroma: Chroma) {}

    public static emptyPixel(): Pixel {
        return new Pixel(
            new Luma(0n, Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
            new Chroma(Buffer.from(Uint8Array.from(Array(32).fill(2))))
        )
    }

    public isEmptyPixel(): boolean {
        return this.chroma.xonly.every(b => b === 2);
    }

    public static pixelPrivateKey(keyPair: ECPairInterface, pixel: Pixel): Buffer {
        // hash(hash(Y),UV)
        const pxh = Pixel.pixelHash(pixel);
        let innerKey = keyPair.publicKey!;
        let privateKey = keyPair.privateKey!;

        if(innerKey[0] === 3) {
            innerKey = Buffer.concat([PARITY, innerKey.slice(1)]);
            privateKey = Buffer.from(privateNegate(privateKey));
        }
  
        // hash(pxh, innerKey)
        const pxhPubkey = crypto.sha256(Buffer.concat([pxh, innerKey]));
         
        const pxp = privateAdd(privateKey, pxhPubkey)!;
        return Buffer.from(pxp);
    }

    public static pixelHash(pixel: Pixel): Buffer {
        const y = pixel.luma;
        const uv = pixel.chroma;

        // hash(Y)
        const yHash = crypto.sha256(Buffer.from(y.toBytes()));
        // Ensure uv.inner is defined
        const uvInner = uv.xonly || Buffer.from(Array(32).fill(2));
        // hash(hash(Y),UV)
        const pxh = crypto.sha256(Buffer.concat([yHash, Buffer.from(uvInner)]));
        return pxh;
    }

    public static pixelPublicKey(innerKey: Buffer, pixel: Pixel): Buffer {
        // hash(hash(Y),UV)
        const pxh = Pixel.pixelHash(pixel);
    
        // hash(pxh, innerKey)
        const pxhPubkey = crypto.sha256(Buffer.concat([pxh, innerKey]));
    
        // hash(pxh, innerKey) * G
        const pxhPubkeyPoint = pointMultiply(G, pxhPubkey)!;
    
        // hash(pxh, innerKey) * G + innerKey
        const pixelKey = pointAdd(pxhPubkeyPoint, innerKey)!;
    
        return Buffer.from(pixelKey);
    }
};
