import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { countInkPixels, SIGNATURE_MIN_INK_PIXELS } from "@/domain/certs/signature-ink";
import {
  inspectSignaturePng,
  SIGNATURE_BASE64_MAX_LENGTH,
  SIGNATURE_MAX_PNG_BYTES,
} from "@/domain/certs/signature-png";
import { checkPayloadSize } from "@/lib/actions/payload-size";
import {
  chunkOffsets,
  encodePng,
  padPngTo,
  pngChunk,
  rgbaWithInk,
  signaturePngWithLine,
  SIG_HEIGHT,
  SIG_WIDTH,
} from "@/test/fixtures/signature-png";

// 04.3-06 Task 1 ② — 서명 PNG 검사(순수) · 잉크 측정 하나(checker-B W5).

describe("countInkPixels — 알파가 0이 아닌 픽셀 수", () => {
  it("알파 0만 → 0", () => {
    expect(countInkPixels(new Uint8Array(16))).toBe(0);
  });

  it("알파 1인 픽셀 하나 → 1", () => {
    const rgba = new Uint8Array(16);
    rgba[7] = 1;
    expect(countInkPixels(rgba)).toBe(1);
  });

  it("1040×400에 48×6 불투명 사각형 → 288", () => {
    expect(countInkPixels(rgbaWithInk([{ x: 10, y: 10, w: 48, h: 6 }]))).toBe(288);
  });

  it("Uint8ClampedArray(캔버스 getImageData)도 센다", () => {
    const rgba = new Uint8ClampedArray(rgbaWithInk([{ x: 0, y: 0, w: 2, h: 2 }]));
    expect(countInkPixels(rgba)).toBe(4);
  });

  it("하한은 288(논리 24 선 × 배율 2 × 굵기 6)", () => {
    expect(SIGNATURE_MIN_INK_PIXELS).toBe(288);
  });
});

describe("inspectSignaturePng — 빈 서명(잉크 하한)", () => {
  it("투명 1040×400(잉크 0) → blank", () => {
    expect(inspectSignaturePng(encodePng(rgbaWithInk([])))).toEqual({ ok: false, reason: "blank" });
  });

  it("지름 6 점 하나 → blank", () => {
    const rgba = new Uint8Array(SIG_WIDTH * SIG_HEIGHT * 4);
    let count = 0;
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        if ((x - 2.5) ** 2 + (y - 2.5) ** 2 <= 9) {
          rgba[((200 + y) * SIG_WIDTH + 500 + x) * 4 + 3] = 255;
          count++;
        }
      }
    }
    expect(count).toBeLessThan(40);
    expect(inspectSignaturePng(encodePng(rgba))).toEqual({ ok: false, reason: "blank" });
  });

  it("잉크 288픽셀(가로선 48×6) → ok", () => {
    const png = signaturePngWithLine(48);
    expect(countInkPixels(rgbaWithInk([{ x: 100, y: 300, w: 48, h: 6 }]))).toBe(288);
    expect(inspectSignaturePng(png)).toEqual({ ok: true });
  });

  it("잉크 276픽셀(가로선 46×6) → blank", () => {
    expect(inspectSignaturePng(signaturePngWithLine(46))).toEqual({ ok: false, reason: "blank" });
  });

  it("잉크 287픽셀(288 선에서 한 픽셀 투명) → blank", () => {
    const rgba = rgbaWithInk([{ x: 100, y: 300, w: 48, h: 6 }]);
    rgba[(300 * SIG_WIDTH + 100) * 4 + 3] = 0;
    expect(countInkPixels(rgba)).toBe(287);
    expect(inspectSignaturePng(encodePng(rgba))).toEqual({ ok: false, reason: "blank" });
  });

  it("같은 자리를 네 번 오간 왕복 낙서(잉크 24×6 = 144) → blank", () => {
    const stroke = { x: 300, y: 200, w: 24, h: 6 };
    const rgba = rgbaWithInk([stroke, stroke, stroke, stroke]);
    expect(countInkPixels(rgba)).toBe(144);
    expect(inspectSignaturePng(encodePng(rgba))).toEqual({ ok: false, reason: "blank" });
  });

  it.each([1, 2, 3, 4])("필터 %i(Sub · Up · Average · Paeth)로 걸러도 잉크 288 → ok", (filter) => {
    expect(inspectSignaturePng(signaturePngWithLine(48, { filter }))).toEqual({ ok: true });
  });

  it.each([1, 2, 3, 4])("필터 %i로 걸러도 잉크 287 → blank(되돌린 값으로 센다)", (filter) => {
    const rgba = rgbaWithInk([{ x: 100, y: 300, w: 48, h: 6 }]);
    rgba[(305 * SIG_WIDTH + 147) * 4 + 3] = 0;
    expect(inspectSignaturePng(encodePng(rgba, { filter }))).toEqual({ ok: false, reason: "blank" });
  });
});

describe("inspectSignaturePng — 형식", () => {
  const ink = rgbaWithInk([{ x: 100, y: 300, w: 60, h: 6 }]);

  it("1040×399 → format", () => {
    const rgba = rgbaWithInk([{ x: 100, y: 300, w: 60, h: 6 }], SIG_WIDTH, 399);
    expect(inspectSignaturePng(encodePng(rgba, { height: 399 }))).toEqual({ ok: false, reason: "format" });
  });

  it("8비트 RGB(색 형식 2) → format", () => {
    expect(inspectSignaturePng(encodePng(ink, { colorType: 2 }))).toEqual({ ok: false, reason: "format" });
  });

  it("16비트 → format", () => {
    expect(inspectSignaturePng(encodePng(ink, { bitDepth: 16 }))).toEqual({ ok: false, reason: "format" });
  });

  it("인터레이스 → format", () => {
    expect(inspectSignaturePng(encodePng(ink, { interlace: 1 }))).toEqual({ ok: false, reason: "format" });
  });

  it("PNG 시그니처가 아닌 본문 → format", () => {
    expect(inspectSignaturePng(Buffer.from("not a png at all"))).toEqual({ ok: false, reason: "format" });
    expect(inspectSignaturePng(Buffer.alloc(0))).toEqual({ ok: false, reason: "format" });
  });

  it("잘린 IDAT(선언 크기보다 짧게 풀림) → format", () => {
    const full = signaturePngWithLine(60);
    const rawShort = Buffer.alloc(100 * (1 + SIG_WIDTH * 4));
    expect(inspectSignaturePng(encodePng(ink, { rawIdat: rawShort }))).toEqual({ ok: false, reason: "format" });
    // 청크 길이가 본문을 넘는 잘린 파일.
    expect(inspectSignaturePng(full.subarray(0, full.length - 40))).toEqual({ ok: false, reason: "format" });
  });

  it("잉크 충분 + IDAT CRC 한 바이트 바꿈 → format", () => {
    const png = Buffer.from(signaturePngWithLine(60));
    const idat = chunkOffsets(png).find((c) => c.type === "IDAT");
    if (!idat) throw new Error("IDAT 없음");
    png[idat.end - 1] = (png[idat.end - 1] ?? 0) ^ 0xff;
    expect(inspectSignaturePng(png)).toEqual({ ok: false, reason: "format" });
  });

  it("잉크 충분 + 끝 IEND를 뗌 → format", () => {
    const png = signaturePngWithLine(60);
    expect(inspectSignaturePng(png.subarray(0, png.length - 12))).toEqual({ ok: false, reason: "format" });
  });

  it("잉크 충분 + IEND 뒤에 바이트가 더 붙음 → format", () => {
    const png = signaturePngWithLine(60);
    expect(inspectSignaturePng(Buffer.concat([png, Buffer.from([0])]))).toEqual({ ok: false, reason: "format" });
  });

  it("IDAT가 선언 크기(1,664,400바이트)보다 크게 풀림(압축 폭탄) → format", () => {
    const bomb = Buffer.alloc(400 * (1 + SIG_WIDTH * 4) + 4096);
    expect(inspectSignaturePng(encodePng(ink, { rawIdat: bomb }))).toEqual({ ok: false, reason: "format" });
  });

  it("알 수 없는 필터 번호(5) → format", () => {
    const raw = Buffer.alloc(400 * (1 + SIG_WIDTH * 4));
    raw[0] = 5;
    expect(inspectSignaturePng(encodePng(ink, { rawIdat: raw }))).toEqual({ ok: false, reason: "format" });
  });
});

describe("inspectSignaturePng — IDAT 이어짐 · zlib 끝 뒤 바이트(검토 M3)", () => {
  // 유효 PNG의 시그니처 · IHDR · IEND를 그대로 두고 그 사이 청크만 바꿔 끼운다.
  const base = signaturePngWithLine(60);
  const offsets = chunkOffsets(base);
  const ihdr = offsets.find((c) => c.type === "IHDR");
  const iend = offsets.find((c) => c.type === "IEND");
  if (!ihdr || !iend) throw new Error("IHDR · IEND 없음");
  const head = base.subarray(0, ihdr.end);
  const tail = base.subarray(iend.start);
  const raw = Buffer.alloc(400 * (1 + SIG_WIDTH * 4));
  for (let x = 100; x < 160; x++) {
    for (let y = 300; y < 306; y++) raw[y * (1 + SIG_WIDTH * 4) + 1 + x * 4 + 3] = 255;
  }
  const stream = deflateSync(raw);
  const half = Math.floor(stream.length / 2);
  const text = pngChunk("tEXt", Buffer.from("k\0v", "latin1"));
  const build = (...chunks: Buffer[]) => Buffer.concat([head, ...chunks, tail]);

  it("IDAT 둘이 바로 이어짐 → ok(대조군)", () => {
    const png = build(pngChunk("IDAT", stream.subarray(0, half)), pngChunk("IDAT", stream.subarray(half)));
    expect(inspectSignaturePng(png)).toEqual({ ok: true });
  });

  it("IDAT 사이에 부속 청크(tEXt)가 끼어 IDAT가 끊김 → format", () => {
    const png = build(pngChunk("IDAT", stream.subarray(0, half)), text, pngChunk("IDAT", stream.subarray(half)));
    expect(inspectSignaturePng(png)).toEqual({ ok: false, reason: "format" });
  });

  it("zlib 스트림이 끝난 뒤 같은 IDAT 안에 바이트가 더 있음 → format", () => {
    const png = build(pngChunk("IDAT", Buffer.concat([stream, Buffer.from("trailing")])));
    expect(inspectSignaturePng(png)).toEqual({ ok: false, reason: "format" });
  });

  it("zlib 스트림이 끝난 뒤 이어진 IDAT에 바이트가 더 있음 → format", () => {
    const png = build(pngChunk("IDAT", stream), pngChunk("IDAT", Buffer.from("trailing")));
    expect(inspectSignaturePng(png)).toEqual({ ok: false, reason: "format" });
  });
});

describe("inspectSignaturePng — 크기 상한(Codex #27)", () => {
  it("상한은 184,320바이트(180 KiB)", () => {
    expect(SIGNATURE_MAX_PNG_BYTES).toBe(184_320);
    expect(SIGNATURE_BASE64_MAX_LENGTH).toBe(245_760);
  });

  it("184,320바이트(부속 청크로 채운 유효 PNG) → ok", () => {
    const png = padPngTo(signaturePngWithLine(60), SIGNATURE_MAX_PNG_BYTES);
    expect(png.length).toBe(184_320);
    expect(inspectSignaturePng(png)).toEqual({ ok: true });
  });

  it("184,321바이트 → tooLarge", () => {
    const png = padPngTo(signaturePngWithLine(60), SIGNATURE_MAX_PNG_BYTES + 1);
    expect(png.length).toBe(184_321);
    expect(inspectSignaturePng(png)).toEqual({ ok: false, reason: "tooLarge" });
  });
});

describe("본문 한도 예산 — 서명 상한 + 나머지 칸 최대치가 262,144바이트 아래", () => {
  // 공개 제출 액션(app/c/[token]/actions.ts)의 칸 최대 길이. 이름 · 주소는 3바이트 한글.
  function maxPayload(signatureBytes: number) {
    return {
      token: "t".repeat(128),
      rowId: "00000000-0000-4000-8000-000000000000",
      proof: "p".repeat(128),
      name: "가".repeat(40),
      rrnFront6: "9".repeat(6),
      rrnBack7: "9".repeat(7),
      phone: "가".repeat(40),
      address: "가".repeat(200),
      consent: true,
      signaturePngBase64: padPngTo(signaturePngWithLine(60), signatureBytes).toString("base64"),
      idempotencyKey: "k".repeat(64),
      consentVersion: "가".repeat(20),
      retentionYears: 99,
      winnerVersion: 2_147_483_647,
      rrnRecheckConfirmed: true,
    };
  }

  it("서명 184,320바이트 + 모든 칸 최대 → checkPayloadSize ok", () => {
    const payload = maxPayload(SIGNATURE_MAX_PNG_BYTES);
    expect(payload.signaturePngBase64.length).toBe(SIGNATURE_BASE64_MAX_LENGTH);
    expect(checkPayloadSize(payload)).toEqual({ ok: true });
  });

  it("서명이 상한을 넘어도 본문 한도가 먼저 걸리지 않는다 — zod 최대 길이(칸 오류 signature)가 판정한다", () => {
    const payload = maxPayload(SIGNATURE_MAX_PNG_BYTES + 1);
    expect(payload.signaturePngBase64.length).toBeGreaterThan(SIGNATURE_BASE64_MAX_LENGTH);
    expect(checkPayloadSize(payload)).toEqual({ ok: true });
  });
});
