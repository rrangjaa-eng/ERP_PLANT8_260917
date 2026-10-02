import { crc32, deflateSync } from "node:zlib";

// 04.3-06 — 서명 PNG 표본을 만드는 작은 인코더(node:zlib만, 새 의존성 없음).
// 단위(signature-png) · 통합(cert-submit) 테스트가 같이 쓴다.

export const SIG_WIDTH = 1040;
export const SIG_HEIGHT = 400;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type InkRect = { x: number; y: number; w: number; h: number };

export function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

// 투명 바탕에 불투명 사각형들을 찍은 RGBA 바이트.
export function rgbaWithInk(rects: InkRect[], width = SIG_WIDTH, height = SIG_HEIGHT): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) rgba[(y * width + x) * 4 + 3] = 255;
    }
  }
  return rgba;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// 줄마다 같은 필터(0~4)로 걸러 만든 IDAT 원문.
function filterRows(rgba: Uint8Array, width: number, height: number, filter: number): Buffer {
  const stride = width * 4;
  const out = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    out[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const cur = rgba[y * stride + i] ?? 0;
      const left = i >= 4 ? (rgba[y * stride + i - 4] ?? 0) : 0;
      const up = y > 0 ? (rgba[(y - 1) * stride + i] ?? 0) : 0;
      const upLeft = y > 0 && i >= 4 ? (rgba[(y - 1) * stride + i - 4] ?? 0) : 0;
      let value = cur;
      if (filter === 1) value = cur - left;
      else if (filter === 2) value = cur - up;
      else if (filter === 3) value = cur - Math.floor((left + up) / 2);
      else if (filter === 4) value = cur - paeth(left, up, upLeft);
      out[y * (stride + 1) + 1 + i] = value & 0xff;
    }
  }
  return out;
}

export type EncodeOptions = {
  width?: number;
  height?: number;
  bitDepth?: number;
  colorType?: number;
  interlace?: number;
  filter?: number;
  // IEND 앞에 끼울 청크(부속 청크 등).
  extraChunks?: Buffer[];
  // IDAT 원문을 직접 준다(압축 폭탄 · 잘린 본문 표본).
  rawIdat?: Buffer;
};

export function encodePng(rgba: Uint8Array, opts: EncodeOptions = {}): Buffer {
  const width = opts.width ?? SIG_WIDTH;
  const height = opts.height ?? SIG_HEIGHT;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = opts.bitDepth ?? 8;
  ihdr[9] = opts.colorType ?? 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = opts.interlace ?? 0;
  const raw = opts.rawIdat ?? filterRows(rgba, width, height, opts.filter ?? 0);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    ...(opts.extraChunks ?? []),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// 가로선 length × 6(굵기) — 잉크 픽셀 = length × 6.
export function signaturePngWithLine(length: number, opts: EncodeOptions = {}): Buffer {
  return encodePng(rgbaWithInk([{ x: 100, y: 300, w: length, h: 6 }]), opts);
}

// 유효 PNG를 tEXt 부속 청크로 정확히 size바이트까지 채운다.
export function padPngTo(png: Buffer, size: number): Buffer {
  const iendLength = 12;
  const body = png.subarray(0, png.length - iendLength);
  const overhead = 12 + "pad".length + 1; // 길이 · 형식 · CRC + 키워드 + NUL
  const fill = size - png.length - overhead;
  if (fill < 0) throw new Error(`padPngTo: ${size}바이트보다 이미 크다`);
  const text = pngChunk("tEXt", Buffer.concat([Buffer.from("pad\0", "latin1"), Buffer.alloc(fill, 0x61)]));
  return Buffer.concat([body, text, png.subarray(png.length - iendLength)]);
}

// 청크 경계 목록(시그니처 뒤) — CRC 바꾸기 · IEND 떼기 표본용.
export function chunkOffsets(png: Buffer): { type: string; start: number; end: number }[] {
  const out: { type: string; start: number; end: number }[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + 12 + length;
    out.push({ type, start: offset, end });
    offset = end;
  }
  return out;
}
