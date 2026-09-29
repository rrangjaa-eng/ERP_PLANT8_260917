import { crc32, inflateSync } from "node:zlib";
import { countInkPixels, SIGNATURE_MIN_INK_PIXELS } from "./signature-ink";

// 04.3-06 Task 1 ② — 서명 PNG 검사(순수, node:zlib만). 저장소에 올리기 전에
// 서버가 판정한다 — 클라이언트의 「서명 있음」을 믿지 않는다.

// 180 KiB — base64로 245,760바이트. 나머지 칸을 최대 길이로 채워도 공개 액션
// 본문 한도(MAX_ACTION_PAYLOAD_BYTES 262,144) 아래다(단위 테스트가 증명).
export const SIGNATURE_MAX_PNG_BYTES = 184_320;
export const SIGNATURE_BASE64_MAX_LENGTH = Math.ceil(SIGNATURE_MAX_PNG_BYTES / 3) * 4;

const WIDTH = 1040;
const HEIGHT = 400;
const BYTES_PER_PIXEL = 4;
const STRIDE = WIDTH * BYTES_PER_PIXEL;
const INFLATED_BYTES = HEIGHT * (1 + STRIDE);
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type SignaturePngInspection = { ok: true } | { ok: false; reason: "tooLarge" | "format" | "blank" };

const FORMAT = { ok: false, reason: "format" } as const;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// 청크 순회 — CRC · IHDR 첫 청크 · 끝 IEND(뒤 바이트 없음) · IDAT는 한 줄로 이어짐을 보고 IDAT를 모은다.
function collectIdat(bytes: Buffer): Buffer | null {
  const idat: Buffer[] = [];
  let offset = PNG_MAGIC.length;
  let first = true;
  let idatEnded = false; // IDAT 뒤에 다른 청크가 왔다 — 그 뒤 IDAT는 끊긴 것이다(PNG 명세: 연속).
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    const typeAndData = bytes.subarray(offset + 4, offset + 8 + length);
    if (crc32(typeAndData) !== bytes.readUInt32BE(offset + 8 + length)) return null;
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (first) {
      if (type !== "IHDR" || !isExpectedHeader(data)) return null;
      first = false;
    } else if (type === "IEND") {
      return end === bytes.length ? Buffer.concat(idat) : null;
    } else if (type === "IDAT") {
      if (idatEnded) return null;
      idat.push(data);
    } else if (type === "IHDR" || (type.charCodeAt(0) & 0x20) === 0) {
      // 두 번째 IHDR · 모르는 필수 청크(첫 글자 대문자) — 부속 청크만 건너뛴다.
      return null;
    } else if (idat.length > 0) {
      idatEnded = true;
    }
    offset = end;
  }
  return null; // IEND 없이 끝남
}

function isExpectedHeader(ihdr: Buffer): boolean {
  return (
    ihdr.length === 13 &&
    ihdr.readUInt32BE(0) === WIDTH &&
    ihdr.readUInt32BE(4) === HEIGHT &&
    ihdr[8] === 8 && // 비트 깊이
    ihdr[9] === 6 && // RGBA
    ihdr[10] === 0 &&
    ihdr[11] === 0 &&
    ihdr[12] === 0 // 비인터레이스
  );
}

// 줄마다 필터(0~4)를 되돌리며 잉크를 센다. 모르는 필터면 null.
function countInk(raw: Buffer): number | null {
  let previous = new Uint8Array(STRIDE);
  let current = new Uint8Array(STRIDE);
  let ink = 0;
  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * (1 + STRIDE);
    const filter = raw[rowStart];
    for (let i = 0; i < STRIDE; i++) {
      const value = raw[rowStart + 1 + i] ?? 0;
      const left = i >= BYTES_PER_PIXEL ? (current[i - BYTES_PER_PIXEL] ?? 0) : 0;
      const up = previous[i] ?? 0;
      const upLeft = i >= BYTES_PER_PIXEL ? (previous[i - BYTES_PER_PIXEL] ?? 0) : 0;
      let predictor: number;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      else return null;
      current[i] = (value + predictor) & 0xff;
    }
    ink += countInkPixels(current);
    [previous, current] = [current, previous];
  }
  return ink;
}

// @types/node은 info: true일 때의 반환 모양({ buffer, engine })을 적지 않는다.
type InflateInfo = { buffer: Buffer; engine: { bytesWritten: number } };

export function inspectSignaturePng(bytes: Buffer): SignaturePngInspection {
  if (bytes.length > SIGNATURE_MAX_PNG_BYTES) return { ok: false, reason: "tooLarge" };
  if (bytes.length < PNG_MAGIC.length || PNG_MAGIC.some((b, i) => bytes[i] !== b)) return FORMAT;

  const idat = collectIdat(bytes);
  if (!idat) return FORMAT;

  let raw: Buffer;
  try {
    // 선언 크기보다 크게 풀리면 여기서 멈춘다(압축 폭탄 방어). info의 engine.bytesWritten =
    // 스트림 끝까지 읽은 입력 바이트 — zlib은 끝 뒤 바이트를 조용히 버리므로 직접 비교한다.
    const inflated = inflateSync(idat, { maxOutputLength: INFLATED_BYTES, info: true }) as unknown as InflateInfo;
    if (inflated.engine.bytesWritten !== idat.length) return FORMAT;
    raw = inflated.buffer;
  } catch {
    return FORMAT;
  }
  if (raw.length !== INFLATED_BYTES) return FORMAT;

  const ink = countInk(raw);
  if (ink === null) return FORMAT;
  return ink < SIGNATURE_MIN_INK_PIXELS ? { ok: false, reason: "blank" } : { ok: true };
}
