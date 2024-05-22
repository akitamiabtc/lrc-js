import { networks } from "bitcoinjs-lib";
import { TxInput } from "./input";
import { TxOutput } from "./output";

export interface TransactionInput {
  privateKeyWIF: string;
  network: networks.Network;
  inputs: TxInput[];
  outputs: TxOutput[];
}
