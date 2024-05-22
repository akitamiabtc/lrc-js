import { toXOnly } from "../utils/buffer";
import { ChromaAnnouncement, ChromaAnnouncementDto } from "./yuv-transaction";

export class Chroma {
    xonly: Buffer;
    constructor(pubkey?: Buffer) {
        this.xonly = toXOnly(pubkey || Buffer.from(Array(32).fill(2)));
    }

  get inner() {
    return this.xonly;
  }
}

export class ChromaInfo {
  constructor(
    public announcement: ChromaAnnouncement | null,
    public totalSupply: bigint,
  ) {}

  public static fromChromaInfoDto(info: ChromaInfoDto): ChromaInfo {
    const announcement = info.announcement
      ? ChromaAnnouncement.fromChromaAnnouncementDto(info.announcement)
      : null;
    return new ChromaInfo(announcement, info.total_supply);
  }
}

export interface ChromaInfoDto {
  announcement: ChromaAnnouncementDto | null;
  total_supply: bigint;
}
