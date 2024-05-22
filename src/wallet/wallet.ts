import { ECPairInterface } from "ecpair";
import { BitcoinUtxo, YuvUtxo } from "../types/bitcoin-utxo";
import { Psbt, Transaction, address, networks, payments } from "bitcoinjs-lib";
import { TransactionBuilder } from "../transaction/transaction-builder";
import { toOddParity, toXOnly } from "../utils/buffer";
import { EsploraApi } from "../api/esplora";
import { YuvJsonRPC } from "../api/yuv";
import { plainToClassFromExist, plainToInstance } from "class-transformer";
import {
  AnnouncementData,
  ChromaAnnouncement,
  IssueAnnouncement,
  TransferData,
  YuvTransaction,
  YuvTransactionDto,
  YuvTransactionType,
  YuvTransactionTypeEnum,
} from "../types/yuv-transaction";
import { filterUniqueUtxo } from "../utils/bitcoin";
import { ECPair } from "../utils/constants";
import { PixelProof, getPixelDataFromProof } from "../types/pixel-proof";
import { PixelInput, BitcoinInput, TxInput } from "../types/input";
import { BitcoinOutput, PixelOutput, TxOutput } from "../types/output";
import { YuvUtxosCoinSelection } from "../coinselection/yuv-utxos";
import { BtcUtxosCoinSelection } from "../coinselection/btc-utxos";
import { Pixel } from "../types/pixel";
import { Chroma, ChromaInfo } from "../types/chroma";
import { Luma } from "../types/luma";
import { Payment } from "../types/payment";
import { publicKeyToAddress } from "../../address";
import { toNetworkType } from "../../network";
import { AddressType } from "../../types";
import { JSONParse } from "../utils/json";
import { BtcMetadata } from "../types/bitcoin-transaction";

export class Wallet {
  private yuvUtxos: Array<YuvUtxo> = [];
  private unspentYuvUtxos: Array<YuvUtxo> = [];
  private emptyYuvUtxos: Array<YuvUtxo> = [];
  private lastYuvPage: number = 0;
  private btcUtxos: Array<YuvUtxo | BitcoinUtxo> = [];
  private spentBtcUtxos: Array<YuvUtxo | BitcoinUtxo> = [];
  private unspentBtcUtxo: Array<YuvUtxo | BitcoinUtxo> = []
  private keyPair: ECPairInterface;
  private network: networks.Network;
  private builder: TransactionBuilder;
  private esploraApi: EsploraApi;
  private lrcNodeApi: YuvJsonRPC;
  private privateKeyHex: string;
  public p2trAddress: string;
  public p2wpkhAddress: string;
  public addressInnerKey: Buffer;
  public pubkey: Buffer;
  private tokenInfoMap: Map<string, ChromaInfo> = new Map();

  constructor(privateKeyHex: string, network: networks.Network) {
    this.privateKeyHex = privateKeyHex;
    this.network = network;
    this.keyPair = ECPair.fromPrivateKey(
      Buffer.from(this.privateKeyHex, "hex"),
      { network: network },
    );
    this.pubkey = this.keyPair.publicKey;
    this.builder = new TransactionBuilder(this.keyPair, network);
    this.addressInnerKey = toOddParity(toXOnly(this.keyPair.publicKey));

    const esploraUrl =
      network.bech32 === "tb"
        ? "https://mutinynet.com/api"
        : "https://blockstream.info/api";
    const lrcNodeUrl =
      network.bech32 === "tb"
        ? "http://54.215.221.246:18333"
        : "http://54.219.77.43:18333";
    this.esploraApi = new EsploraApi(esploraUrl);
    this.lrcNodeApi = new YuvJsonRPC(lrcNodeUrl);
    const pubkey = this.keyPair.publicKey.toString("hex");
    const networkType = toNetworkType(network);

    this.p2trAddress = publicKeyToAddress(
      pubkey,
      AddressType.P2TR,
      networkType,
    );
    this.p2wpkhAddress = publicKeyToAddress(
      pubkey,
      AddressType.P2WPKH,
      networkType,
    );
  }

  async syncWallet(): Promise<void> {
    let [yuvTxs, lastPage] = await this.lrcNodeApi.listLrcUtxosByWalletToPage(
      this.lastYuvPage,
      this.addressInnerKey.toString("hex"),
    );

    let newYuvTxs = yuvTxs.map((txDto) =>
      plainToInstance(YuvTransactionDto, txDto).toYuvTransaction(),
    );

    let yuvUtxos = new Array<YuvUtxo>();

    let emptyYuvUtxos = new Array<YuvUtxo>();

    for (const tx of newYuvTxs) {
      let [newYuvUtxos, newEmptyYuvUtxos] = YuvUtxo.fromYuvTransaction(
        tx,
        this.addressInnerKey.toString("hex"),
      );

      for (const yuvUtxo of newYuvUtxos) {
        let txout = await this.esploraApi.getSpendingStatus(
          yuvUtxo.txid,
          yuvUtxo.vout,
        );
        if (!txout.spent) {
          yuvUtxos.push(yuvUtxo);
        }
      }

      for (const emptyUtxo of newEmptyYuvUtxos) {
        let txout = await this.esploraApi.getSpendingStatus(
          emptyUtxo.txid,
          emptyUtxo.vout,
        );
        if (!txout.spent) {
          emptyYuvUtxos.push(emptyUtxo);
        }
      }
    }

    yuvUtxos = filterUniqueUtxo(this.yuvUtxos, yuvUtxos);
    emptyYuvUtxos = filterUniqueUtxo(this.emptyYuvUtxos, emptyYuvUtxos);

    this.yuvUtxos = [...this.yuvUtxos, ...yuvUtxos];
    this.emptyYuvUtxos = [...this.emptyYuvUtxos, ...emptyYuvUtxos];
    this.lastYuvPage = lastPage;

    // Get bitcoin utxos
    const bech32Address = payments.p2wpkh({
      pubkey: this.keyPair.publicKey,
      network: this.network,
    }).address!;
    this.btcUtxos = await this.esploraApi.listBitcoinUtxo(bech32Address);

    // filter unspent btc
    let unspentBtcUtxos = new Array<BitcoinUtxo>();
    for (let utxo of this.btcUtxos) {
      let txout = await this.esploraApi.getSpendingStatus(
        utxo.txid,
        utxo.vout,
      );
      if (txout.spent == false) {
        unspentBtcUtxos.push(utxo);
      }
    }
    this.btcUtxos = unspentBtcUtxos;


    // Filter unspent YUV utxos
    let unspentYuvUtxos = new Array<YuvUtxo>();
    for (let yuvUtxo of [...this.unspentYuvUtxos, ...yuvUtxos]) {
      let txout = await this.esploraApi.getSpendingStatus(
        yuvUtxo.txid,
        yuvUtxo.vout,
      );
      if (txout.spent == false) {
        unspentYuvUtxos.push(yuvUtxo);
      }
    }
    this.unspentYuvUtxos = unspentYuvUtxos;

    // Filter zero output YUV utxos
    let unspentEmptyYuvUtxos = new Array<YuvUtxo>();
    for (let emptyUtxo of this.emptyYuvUtxos) {
      let txout = await this.esploraApi.getSpendingStatus(
        emptyUtxo.txid,
        emptyUtxo.vout,
      );
      if (txout.spent == false) {
        unspentEmptyYuvUtxos.push(emptyUtxo);
      }
    }

    // this.btcUtxos = [...this.btcUtxos];
    this.btcUtxos = [...this.btcUtxos, ...unspentEmptyYuvUtxos];
    console.log('this utxos', this.btcUtxos);
  }

  changeNetwork(network: networks.Network): void {
    this.network = network;
    this.keyPair = ECPair.fromPrivateKey(
      Buffer.from(this.privateKeyHex, "hex"),
      { network: network },
    );
    this.pubkey = this.keyPair.publicKey;
    this.builder = new TransactionBuilder(this.keyPair, network);
    this.addressInnerKey = toOddParity(toXOnly(this.keyPair.publicKey));
    const esploraUrl =
      network.bech32 === "tb"
        ? "https://mutinynet.com/api"
        : "https://blockstream.info/api";
    const lrcNodeUrl =
      network.bech32 === "tb"
        ? "http://54.215.221.246:18333"
        : "http://54.219.77.43:18333";
    this.esploraApi = new EsploraApi(esploraUrl);
    this.lrcNodeApi = new YuvJsonRPC(lrcNodeUrl);

    const pubkey = this.keyPair.publicKey.toString("hex");
    const networkType = toNetworkType(network);
    this.p2trAddress = publicKeyToAddress(
      pubkey,
      AddressType.P2TR,
      networkType,
    );
    this.p2wpkhAddress = publicKeyToAddress(
      pubkey,
      AddressType.P2WPKH,
      networkType,
    );
  }

  getYuvUtxos(): YuvUtxo[] {
    return this.yuvUtxos;
  }

  getUnspentYuvUtxos(): YuvUtxo[] {
    return this.unspentYuvUtxos;
  }

  getBtcUtxos(): Array<YuvUtxo | BitcoinUtxo> {
    return this.btcUtxos;
  }

  getBtcBalance(): number {
    return this.btcUtxos.reduce((acc, utxo) => acc + utxo.satoshis, 0);
  }

  getChromaInfo(chroma: string): Promise<ChromaInfo> {
    return this.lrcNodeApi.getChromaInfo(chroma);
  }

  async getChromaInfoForWallet(chroma: string): Promise<any> {
    const yuvBalances = await this.getYuvBalances();

    const balance = yuvBalances.find((balance) => balance.chroma === chroma);

    const chromaInfo = this.tokenInfoMap.get(chroma)!;

    const info = {
      lrcBalance: {
        chroma: chroma,
        balance: balance ? Number(balance.balance) : 0,
      },
      lrcInfo: {
        chroma: chroma,
        name: chromaInfo.announcement?.name ? chromaInfo.announcement.name : `${chroma.slice(0, 4)}...${chroma.slice(-4)}`,
        symbol: chromaInfo.announcement?.symbol ? chromaInfo.announcement.symbol : `${chroma.slice(0, 3)}`,
        decimals: chromaInfo.announcement?.decimal ? chromaInfo.announcement.decimal : 0,
        maxSupply: chromaInfo.announcement?.maxSupply ? chromaInfo.announcement.maxSupply.toString() : "0",
        totalSupply: chromaInfo.totalSupply.toString(),
      },
    };
    return info;
  }

  async prepareAnnouncement(
    announcement: ChromaAnnouncement,
    feeRateVb: number,
  ): Promise<YuvTransaction> {
    const chromaAnnouncementOutput =
      await this.builder.buildAnnouncementOutput(announcement);
    const changeOutput = this.createRawBtcChangeOutput();
    const inputs = await this.createInputsFromUtxos(
      new BtcUtxosCoinSelection(this.btcUtxos).selectUtxos(
        0n,
        0n,
        2n,
        feeRateVb,
        true,
      ),
    );

    const tx = this.builder.buildAndSignTransaction(
      inputs,
      [chromaAnnouncementOutput],
      changeOutput,
      feeRateVb,
    );

    return this.convertToYuvTransaction(
      inputs,
      [chromaAnnouncementOutput, changeOutput],
      tx,
      YuvTransactionTypeEnum.Announcement,
      announcement,
    );
  }

  async prepareAnnounceWithFee(
    announcement: ChromaAnnouncement,
    feeRateVb: number,
    btcAddress: string,
    btcAmount: number
  ): Promise<YuvTransaction> {
    const chromaAnnouncementOutput = await this.builder.buildAnnouncementOutput(announcement);
    const changeOutput = this.createPixelBtcChangeOutput();
    const btcOutput = BitcoinOutput.createFromRaw(btcAddress, btcAmount);
    const inputs = await this.createInputsFromUtxos(
      new BtcUtxosCoinSelection(this.btcUtxos).selectUtxos(
        0n,
        0n,
        3n,
        feeRateVb,
      ),
    );

    const tx = this.builder.buildAndSignTransaction(
      inputs,
      [chromaAnnouncementOutput, btcOutput],
      changeOutput,
      feeRateVb,
    );

    return this.convertToYuvTransaction(
      inputs,
      [chromaAnnouncementOutput, btcOutput, changeOutput],
      tx,
      YuvTransactionTypeEnum.Announcement,
      announcement,
    );
  }

  async prepareIssuance(
    tokens: Array<Payment>,
    feeRateVb: number,
  ): Promise<YuvTransaction> {
    const issuanceOutputs = this.createOutputs(tokens);
    const issuanceAnnouncementOutput =
      await this.builder.buildIssuanceOutput(issuanceOutputs);
    const changeOutput = this.createPixelBtcChangeOutput();
    const inputs = await this.createInputsFromUtxos(
      new BtcUtxosCoinSelection(this.btcUtxos).selectUtxos(
        0n,
        0n,
        BigInt(issuanceOutputs.length + 2),
        feeRateVb,
      ),
    );

    const tx = this.builder.buildAndSignTransaction(
      inputs,
      [issuanceAnnouncementOutput, ...issuanceOutputs],
      changeOutput,
      feeRateVb,
    );

    return this.convertToYuvTransaction(
      inputs,
      [issuanceAnnouncementOutput, ...issuanceOutputs, changeOutput],
      tx,
      YuvTransactionTypeEnum.Issue,
    );
  }

  async prepareTransfer(
    tokens: Array<Payment>,
    feeRateVb: number,
  ): Promise<YuvTransaction> {
    const yuvOutputs = this.createOutputs(tokens);
    const selectedYuvUtxos = new YuvUtxosCoinSelection(
      this.unspentYuvUtxos,
    ).selectUtxos(tokens);
    const yuvInputs = await this.createInputsFromUtxos(selectedYuvUtxos);
    const changeBtcOutput = this.createPixelBtcChangeOutput();
    const changeYuvOutputs = this.createYuvChangeOutputs(yuvInputs, yuvOutputs);
    const btcInputs = await this.createInputsFromUtxos(
      new BtcUtxosCoinSelection(this.btcUtxos).selectUtxos(
        0n,
        BigInt([...yuvInputs].length),
        BigInt([...yuvOutputs, ...changeYuvOutputs, changeBtcOutput].length),
        feeRateVb,
      ),
    );


    const tx = this.builder.buildAndSignTransaction(
      [...btcInputs, ...yuvInputs],
      [...yuvOutputs, ...changeYuvOutputs],
      changeBtcOutput,
      feeRateVb,
    );

    return this.convertToYuvTransaction(
      [...btcInputs, ...yuvInputs],
      [...yuvOutputs, ...changeYuvOutputs, changeBtcOutput],
      tx,
      YuvTransactionTypeEnum.Transfer,
    );
  }

  async getYuvBalances(): Promise<{ chroma: string; balance: bigint; name: string; symbol: string }[]> {
    const balances: { chroma: string; balance: bigint; name: string; symbol: string }[] = [];
    const chromaMap = new Map<string, { balance: bigint; name: string; symbol: string }>();

    for (const utxo of this.yuvUtxos) {
      const { chroma, luma } = getPixelDataFromProof(utxo.pixel)!.pixel!;
      const chromaHex = chroma.inner.toString("hex");

      if (!this.tokenInfoMap.has(chromaHex)) {
        const chromaInfo = await this.getChromaInfo(chromaHex);
        this.tokenInfoMap.set(chromaHex, chromaInfo);
      }

      const chromaInfo = this.tokenInfoMap.get(chromaHex);
      const name = chromaInfo.announcement?.name || `${chromaHex.slice(0, 3)}...${chromaHex.slice(-3)}`;
      const symbol = chromaInfo.announcement?.symbol || `${chromaHex.slice(0, 3)}`;

      if (chromaMap.has(chromaHex)) {
        const existing = chromaMap.get(chromaHex)!;
        chromaMap.set(chromaHex, { balance: existing.balance + luma.amount, name, symbol });
      } else {
        chromaMap.set(chromaHex, { balance: luma.amount, name, symbol });
      }
    }

    chromaMap.forEach((value, chroma) => {
      balances.push({ chroma, balance: value.balance, name: value.name, symbol: value.symbol });
    });

    return balances;
  }

  async toBtcMetadata(tx: YuvTransaction): Promise<BtcMetadata> {
    const txid = tx.bitcoin_tx.getId();

    // Collect UTXOs being spent and calculate total input value
    const utxosSpent = {
      btc: [] as Array<{ txid: string; vout: number; value: number }>,
      yuv: [] as Array<{ txid: string; vout: number; value: number }>,
    };

    const inputValue = await Promise.all(
      tx.bitcoin_tx.ins.map(async (input, index) => {
        const prevTxid = input.hash.reverse().toString('hex');
        const prevVout = input.index;
        const utxoValue = await this.esploraApi.getUtxoValue(prevTxid, prevVout);

        const utxoData = {
          txid: prevTxid,
          vout: prevVout,
          value: utxoValue,
        };

        if (tx.tx_type.type === YuvTransactionTypeEnum.Transfer) {
          const transferData = tx.tx_type.data as TransferData;
          if (transferData.input_proofs.has(index)) {
            utxosSpent.yuv.push(utxoData);
          } else {
            utxosSpent.btc.push(utxoData);
          }
        } else {
          utxosSpent.btc.push(utxoData);
        }

        return utxoValue;
      })
    ).then((values) => values.reduce((sum, value) => sum + value, 0));

    // Calculate fees paid
    const outputValue = tx.bitcoin_tx.outs.reduce((sum, output) => sum + output.value, 0);
    const feesPaid = inputValue - outputValue;

    return {
      txid,
      feesPaid,
      utxosSpent,
    };
  }

  private convertToYuvTransaction(
    inputs: Array<TxInput>,
    outputs: Array<TxOutput>,
    transaction: Transaction,
    type: YuvTransactionTypeEnum,
    announcement?: AnnouncementData,
  ): YuvTransaction {
    const outputStartIndex =
      type === YuvTransactionTypeEnum.Announcement ||
        type === YuvTransactionTypeEnum.Issue
        ? 1
        : 0;
    const inputProofs = this.createInputProofs(inputs);
    const outputProofs = this.createOutputProofs(outputs, outputStartIndex);

    let txType: YuvTransactionType;

    switch (type) {
      case YuvTransactionTypeEnum.Announcement:
        if (!announcement) {
          throw new Error("Announcement data is not provided");
        }
        txType = {
          type: YuvTransactionTypeEnum.Announcement,
          data: announcement,
        };
        break;
      case YuvTransactionTypeEnum.Transfer:
        txType = {
          type: YuvTransactionTypeEnum.Transfer,
          data: {
            input_proofs: inputProofs,
            output_proofs: outputProofs,
          },
        };
        break;
      case YuvTransactionTypeEnum.Issue:
        const announcementInfo = {
          chroma: (outputs[1] as PixelOutput).pixel.chroma.inner.toString(
            "hex",
          ),
          amount: outputs
            .filter((output) => output instanceof PixelOutput)
            .reduce((acc, output) => {
              return acc + (output as PixelOutput).pixel.luma.amount;
            }, 0n),
        };
        txType = {
          type: YuvTransactionTypeEnum.Issue,
          data: {
            announcement: announcementInfo,
            input_proofs: inputProofs,
            output_proofs: outputProofs,
          },
        };
        break;
      default:
        throw new Error("Unsupported transaction type");
    }

    return {
      tx_type: txType,
      bitcoin_tx: transaction,
    };
  }

  private createYuvChangeOutputs(
    inputs: Array<TxInput>,
    outputs: Array<TxOutput>,
  ): Array<PixelOutput> {
    const amountsMap = new Map<
      string,
      { inputsSum: bigint; outputsSum: bigint }
    >();

    inputs.forEach((input) => {
      if (input instanceof PixelInput) {
        const chroma = input.proof.chroma.inner.toString("hex");
        if (amountsMap.get(chroma)) {
          const data = amountsMap.get(chroma)!;
          data.inputsSum += input.proof.luma.amount;
          amountsMap.set(chroma, data);
          return;
        }
        amountsMap.set(chroma, {
          inputsSum: input.proof.luma.amount,
          outputsSum: BigInt(0),
        });
      }
    });

    outputs.forEach((output) => {
      if (output instanceof PixelOutput) {
        const chroma = output.pixel.chroma.inner.toString("hex");
        const data = amountsMap.get(chroma)!;
        data.outputsSum += output.pixel.luma.amount;
      }
    });

    let changeOutputs = new Array<PixelOutput>();
    amountsMap.forEach((value, key) => {
      const changeAmount = value.inputsSum - value.outputsSum;
      if (changeAmount > 0) {
        changeOutputs.push(
          this.createYuvChangeOutput(
            new Pixel(
              new Luma(changeAmount),
              new Chroma(Buffer.from(key, "hex")),
            ),
          ),
        );
      }
    });

    return changeOutputs;
  }

  private createYuvChangeOutput(changePixel: Pixel): PixelOutput {
    return PixelOutput.createFromRaw(this.addressInnerKey, 1000, changePixel);
  }

  private createInputProofs(inputs: TxInput[]): Map<number, PixelProof> {
    const inputProofs = new Map<number, PixelProof>();
    inputs.forEach((input, index) => {
      if (input instanceof PixelInput) {
        inputProofs.set(index, input.toPixelProofs());
      }
    });
    return inputProofs;
  }

  async broadcast(transaction: YuvTransactionDto): Promise<boolean> {
    try {
      if (typeof transaction === "string") {
        transaction = JSONParse(transaction);
      }
      let dto = plainToInstance(YuvTransactionDto, transaction);
      let tx = dto.toYuvTransaction();
      if (transaction.tx_type.type === YuvTransactionTypeEnum.Transfer) {
        return await this.lrcNodeApi.sendRawYuvTx(tx);
      }
      else if (transaction.tx_type.type === YuvTransactionTypeEnum.Announcement || transaction.tx_type.type === YuvTransactionTypeEnum.Issue) {
        return await this.lrcNodeApi.sendRawYuvTx(
          tx,
          tx.bitcoin_tx.outs[0].value,
        );
      }

      throw new Error("Unsupported transaction type");
    }
    catch (e) {
      console.log("error: ", e);
    }
  }

  private createPixelBtcChangeOutput(): PixelOutput {
    return PixelOutput.createFromRaw(
      this.addressInnerKey,
      1000,
      new Pixel(new Luma(0n), new Chroma()),
    );
  }

  private createRawBtcChangeOutput(): BitcoinOutput {
    return new BitcoinOutput(
      this.addressInnerKey,
      1000,
    );
  }

  private createOutputProofs(
    outputs: TxOutput[],
    index: number = 0,
  ): Map<number, PixelProof> {
    const outputProofs = new Map<number, PixelProof>();
    outputs.forEach((output) => {
      if (output instanceof PixelOutput) {
        outputProofs.set(index++, output.toPixelProof());
      }
    });
    return outputProofs;
  }

  private async createInputsFromUtxos(
    utxos: Array<BitcoinUtxo | YuvUtxo>,
  ): Promise<TxInput[]> {
    return Promise.all(
      utxos.map(async (utxo) => {
        if (utxo instanceof YuvUtxo) {
          return PixelInput.createFromRaw(
            utxo.txid,
            Number(utxo.vout),
            await this.esploraApi.getTransactionHex(utxo.txid),
            utxo.satoshis,
            utxo.pixel.data.pixel,
            utxo.innerKey,
          );
        } else if (utxo instanceof BitcoinUtxo) {
          return BitcoinInput.createFromRaw(
            utxo.txid,
            Number(utxo.vout),
            await this.esploraApi.getTransactionHex(utxo.txid),
            utxo.satoshis,
          );
        } else {
          throw new Error("Failed to parse unknown type");
        }
      }),
    );
  }

  private createOutputs(
    amounts: Array<{ recipientP2TR: string; amount: bigint; chroma: string }>,
  ): Array<TxOutput> {
    return amounts.map((token) => {
      const pixel = new Pixel(
        new Luma(token.amount),
        new Chroma(Buffer.from(token.chroma, "hex")),
      );

      const addressParsed = address.fromBech32(token.recipientP2TR);
      return PixelOutput.createFromRaw(
        toOddParity(addressParsed.data),
        1000,
        pixel,
      );
    });
  }
}
