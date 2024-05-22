import { classToPlain, instanceToPlain } from "class-transformer";
import { url } from "inspector";
import { BitcoinTxOut } from "../types/bitcoin-utxo";
import { PixelProofDto, PixelProofType, SigPixelProofDataDto, MultisigPixelProofDataDto } from "../types/pixel-proof";
import { YuvTransactionStatusDto, YuvTransactionDto, YuvTransactionTypeEnum, IssueDataDto, TransferDataDto, YuvTransaction } from "../types/yuv-transaction";
import { JSONStringify } from "../utils/json";
import { ChromaInfo, ChromaInfoDto } from "../types/chroma";

interface RpcResponse<T> {
  result: T;
  error: any;
  id: number | string; // Match your response structure 
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any[] | object;
  id: string | number | null;
}

export interface JsonRpcAuth {
  username: string,
  password: string
}

export class YuvJsonRPC {
  private readonly url: string;
  private readonly auth?: JsonRpcAuth;

  constructor(url: string, auth?: JsonRpcAuth) {
    this.url = url;
    this.auth = auth;
  }

  async getChromaInfo(chroma: string): Promise<ChromaInfo> {
    let data = await this.makeJsonRpcCall<ChromaInfoDto>("getchromainfo", [
      chroma,
    ]);

    return ChromaInfo.fromChromaInfoDto(data);
  }

  async getRawYuvTx(txId: string): Promise<YuvTransactionStatusDto> {
    return await this.makeJsonRpcCall<YuvTransactionStatusDto>("getrawyuvtransaction", [txId])
  }

  async getTxOut(txId: string, index: number, bitcoinApiUrl: string, auth: JsonRpcAuth): Promise<BitcoinTxOut | null> {
    return await this.makeJsonRpcCall("gettxout", [txId, index]);
  }

  async listLrcUtxosForPage(page: number): Promise<Array<YuvTransactionDto>> {
    return await this.makeJsonRpcCall<Array<YuvTransactionDto>>('listyuvtransactions', [page])
  }

  async listLrcUtxosByWalletToPage(from: number, innerKey: string): Promise<[Array<YuvTransactionDto>, number]> {
    let utxosPage = await this.listLrcUtxosForPage(from);
    let utxos = utxosPage;
    let lastPage = from;
    while (utxosPage.length > 99) {
      utxosPage = await this.listLrcUtxosForPage(++lastPage);
      utxos = [...utxos, ...utxosPage];
    }

    return [utxos.filter((utxo) => {
      let yuvTx = utxo.tx_type;

      switch (yuvTx.type) {
        case YuvTransactionTypeEnum.Issue: {
          let data = yuvTx.data as IssueDataDto;

          const map = new Map(Object.entries(data.output_proofs));

          for (let proof of map.values()) {
            if (this.isOwnUtxo(proof as PixelProofDto, innerKey)) {
              return true;
            }
          }

          break;
        }
        case YuvTransactionTypeEnum.Transfer: {
          let data = yuvTx.data as TransferDataDto;

          const map = new Map(Object.entries(data.output_proofs));

          for (let proof of map.values()) {
            if (this.isOwnUtxo(proof as PixelProofDto, innerKey)) {
              return true;
            }
          }

          break;
        }
      }

      return false;
    }), lastPage]
  }

  isOwnUtxo(proof: PixelProofDto, innerKey: string): boolean {
    switch (proof.type) {
      case PixelProofType.Sig: {
        let data = proof.data as SigPixelProofDataDto;

        if (data.inner_key == innerKey) {
          return true;
        }

        break;
      }
      case PixelProofType.Multisig: {
        let data = proof.data as MultisigPixelProofDataDto;

        if (data.inner_keys.find((val) => val == innerKey)) {
          return true
        }

        break;
      }
    }

    return false
  }

  sendRawYuvTx(rawTx: YuvTransaction, maxBurnAmount?: number): Promise<boolean> {
    let tx: YuvTransactionDto = YuvTransactionDto.fromYuvTransaction(rawTx);
    let params: any[] = [tx];
    if (maxBurnAmount) {
      params.push(maxBurnAmount);
    }
    return this.makeJsonRpcCall("sendrawyuvtransaction", params);
  }

  async makeJsonRpcCall<T>(method: string, params: any[]): Promise<T> {
    const id = Math.floor(Math.random() * 100000); // Simple ID generation
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id
    };

    let body = instanceToPlain(request);

    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.auth ? { "Authorization": `Basic ${this.basicAuth(this.auth)}` } : {})
      },
      body: JSONStringify(body)
    });

    if (!response.ok) {
      throw new Error(`RPC call failed: ${response.status}`);
    }

    const data: RpcResponse<T> = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
    }

    return data.result;
  }

  private basicAuth(auth: JsonRpcAuth): string {
    const { username, password } = auth;
    return Buffer.from(`${username}:${password}`).toString("base64");
  }
}

