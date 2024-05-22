import { initEccLib, networks } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
// import * as ecc from 'tiny-secp256k1';
import ecc from "@bitcoinerlab/secp256k1";

// Initialize ECC library
initEccLib(ecc);

// Secp256k1 base point.
export const G = Buffer.from(
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "hex",
);

export const ECPair = ECPairFactory(ecc);
export const network = networks.regtest;

export const LUMA_SIZE = 32;
export const BLINDING_FACTOR_SIZE = 16;
export const MIN_DUST_AMOUNT = 1000;
export const DUST_AMOUNT = 300;

export const PARITY = Buffer.from([2]);
