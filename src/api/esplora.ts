import {
  BitcoinUtxo,
  BitcoinUtxoDto,
  BitcoinUtxoSpentStatus,
} from "../types/bitcoin-utxo";

export class EsploraApi {
  private readonly esploraUrl: string;

  constructor(esploraUrl: string) {
    this.esploraUrl = esploraUrl;
  }

  async getTransactionHex(txid: string): Promise<string> {
    const url = `${this.esploraUrl}/tx/${txid}/hex`;

    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`API http call failed: ${response.status}`);
    }

    const data: string = await response.text();

    return data;
  }

  async listBitcoinUtxo(address: string): Promise<Array<BitcoinUtxo>> {
    const url = `${this.esploraUrl}/address/${address}/utxo`;

    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`API http call failed: ${response.status}`);
    }

    const data: Array<BitcoinUtxoDto> = await response.json();
    console.log('utxos', data);
    return data.map(BitcoinUtxo.fromBitcoinUtxoDto);
  }

  async getSpendingStatus(
    txid: string,
    vout: bigint,
  ): Promise<BitcoinUtxoSpentStatus> {
    const url = `${this.esploraUrl}/tx/${txid}/outspend/${vout}`;

    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`API http call failed: ${response.status}`);
    }

    const data: BitcoinUtxoSpentStatus = await response.json();

    return data;
  }


  async getUtxoValue(txid: string, vout: number): Promise<number> {
    const url = `${this.esploraUrl}/tx/${txid}`;

    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`API http call failed: ${response.status}`);
    }

    const data: any = await response.json();

    const utxoValue = data.vout[vout].value;

    return utxoValue;
  }
  
}
