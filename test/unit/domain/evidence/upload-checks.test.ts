import { describe, expect, it } from "vitest";
import {
  checkEvidenceUpload,
  duplicateScopeKinds,
  EVIDENCE_CONTENT_TYPES,
  EVIDENCE_DUPLICATE_HIDDEN,
  EVIDENCE_DUPLICATE_SAME_OWNER,
  EVIDENCE_UPLOAD_FAILED,
  EVIDENCE_WRONG_TYPE,
  evidenceDuplicateElsewhere,
  evidenceTooSmall,
  signatureMatches,
} from "@/domain/evidence/upload-checks";

// 05-04(EVID-01 · UI-SPEC Copywriting 「Error — 증빙 업로드」): 업로드 의도 전 검사 — 크기 · 형식 · 중복은 순수 판정이다.
// 문자열은 화면(05-05) · E2E가 import하는 상수 그대로다.

const MB = 1024 * 1024;
const SHA = "a".repeat(64);
const ok = { size: 212_000, contentType: "image/jpeg", sha256: SHA };
const tenMb = { maxBytes: 10 * MB, duplicates: [] };

describe("checkEvidenceUpload — 크기", () => {
  it("크기 0은 거부한다", () => {
    expect(checkEvidenceUpload({ ...ok, size: 0 }, tenMb)).toEqual({ ok: false, reason: EVIDENCE_UPLOAD_FAILED });
  });

  it("10MB 한도에서 12.4MB(13,002,342 바이트)는 크기 문구로 거부한다", () => {
    expect(checkEvidenceUpload({ ...ok, size: 13_002_342 }, tenMb)).toEqual({ ok: false, reason: "12.4MB · 10MB 초과 · 파일을 줄여 다시" });
  });

  it("한도를 조금 넘으면 반올림이 한도와 같아지지 않게 올려 적는다", () => {
    expect(checkEvidenceUpload({ ...ok, size: 10 * MB + 1 }, tenMb)).toEqual({ ok: false, reason: "10.1MB · 10MB 초과 · 파일을 줄여 다시" });
  });

  it("한도와 같은 크기는 통과한다", () => {
    expect(checkEvidenceUpload({ ...ok, size: 10 * MB }, tenMb)).toEqual({ ok: true });
  });
});

describe("checkEvidenceUpload — 형식", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"])("%s는 통과한다", (contentType) => {
    expect(checkEvidenceUpload({ ...ok, contentType }, tenMb)).toEqual({ ok: true });
  });

  it("허용 목록은 이미지 다섯 · PDF 하나다", () => {
    expect([...EVIDENCE_CONTENT_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);
  });

  it("text/html은 형식 문구로 거부한다", () => {
    expect(checkEvidenceUpload({ ...ok, contentType: "text/html" }, tenMb)).toEqual({ ok: false, reason: EVIDENCE_WRONG_TYPE });
    expect(EVIDENCE_WRONG_TYPE).toBe("이미지·PDF가 아님 · 사진이나 PDF로 다시");
  });
});

describe("checkEvidenceUpload — sha256", () => {
  it.each(["", "A".repeat(64), "a".repeat(63), "g".repeat(64)])("64자 소문자 16진이 아니면(%s) 거부한다", (sha256) => {
    expect(checkEvidenceUpload({ ...ok, sha256 }, tenMb)).toEqual({ ok: false, reason: EVIDENCE_UPLOAD_FAILED });
  });

  it("올리기 실패 문구", () => {
    expect(EVIDENCE_UPLOAD_FAILED).toBe("올리지 못함 · 다시 올리기");
  });
});

describe("checkEvidenceUpload — 중복", () => {
  it("같은 주인에 같은 파일이 있으면 `같은 파일이 이미 첨부됨`", () => {
    expect(checkEvidenceUpload(ok, { maxBytes: 10 * MB, duplicates: [{ sameOwner: true, visibleNumber: null }] })).toEqual({
      ok: false,
      reason: EVIDENCE_DUPLICATE_SAME_OWNER,
    });
    expect(EVIDENCE_DUPLICATE_SAME_OWNER).toBe("같은 파일이 이미 첨부됨");
  });

  it("다른 주인 · 볼 수 있음 · 번호 26001-0004면 번호를 싣는다", () => {
    expect(checkEvidenceUpload(ok, { maxBytes: 10 * MB, duplicates: [{ sameOwner: false, visibleNumber: "26001-0004" }] })).toEqual({
      ok: false,
      reason: "같은 파일이 26001-0004 증빙에 있음 · 다른 파일 고르기",
    });
    expect(evidenceDuplicateElsewhere("26001-0004")).toBe("같은 파일이 26001-0004 증빙에 있음 · 다른 파일 고르기");
  });

  it("다른 주인 · 못 봄이면 번호 없는 문구", () => {
    expect(checkEvidenceUpload(ok, { maxBytes: 10 * MB, duplicates: [{ sameOwner: false, visibleNumber: null }] })).toEqual({
      ok: false,
      reason: EVIDENCE_DUPLICATE_HIDDEN,
    });
    expect(EVIDENCE_DUPLICATE_HIDDEN).toBe("이미 첨부된 파일 · 다른 파일 고르기");
  });

  it("같은 주인 중복이 다른 주인 중복보다 먼저다", () => {
    const duplicates = [
      { sameOwner: false, visibleNumber: "26001-0004" },
      { sameOwner: true, visibleNumber: null },
    ];
    expect(checkEvidenceUpload(ok, { maxBytes: 10 * MB, duplicates })).toEqual({ ok: false, reason: EVIDENCE_DUPLICATE_SAME_OWNER });
  });

  it("못 보는 문서와 보는 문서가 함께면 번호 있는 문구다", () => {
    const duplicates = [
      { sameOwner: false, visibleNumber: null },
      { sameOwner: false, visibleNumber: "26001-0001" },
    ];
    expect(checkEvidenceUpload(ok, { maxBytes: 10 * MB, duplicates })).toEqual({
      ok: false,
      reason: "같은 파일이 26001-0001 증빙에 있음 · 다른 파일 고르기",
    });
  });
});

// 06-11(O-6 · DR-3 · UI-SPEC S7) — 중복 범위: 지출결의 증빙과 카드 사용의 카드 전표는 한 종류, 나머지는 자기 종류끼리만.
describe("duplicateScopeKinds", () => {
  it("expense → 지출결의 · 카드 전표", () => {
    expect(duplicateScopeKinds("expense")).toEqual(["expense", "corp_card_usage"]);
  });

  it("corp_card_usage → 같은 둘", () => {
    expect(duplicateScopeKinds("corp_card_usage")).toEqual(["expense", "corp_card_usage"]);
  });

  it("quote_revision · reserve_entry → 자기 종류만", () => {
    expect(duplicateScopeKinds("quote_revision")).toEqual(["quote_revision"]);
    expect(duplicateScopeKinds("reserve_entry")).toEqual(["reserve_entry"]);
  });

  it("표에 없는 종류 → 자기 하나", () => {
    expect(duplicateScopeKinds("something_new")).toEqual(["something_new"]);
  });
});

// 06.1-14(E14 · RP-14 · PA-MIN-WHEN): 증빙 최소 용량 설정(기본 0 = 끔) — 올리기 요청 때 선언 크기로 본다.
// 260907 server/src/storage.ts:706-708(expense.min_file_kb, 없으면 0) · :719-739.
describe("checkEvidenceUpload — 최소 용량", () => {
  const KB = 1024;

  it("최소 0(끔)이면 1바이트도 통과한다", () => {
    expect(checkEvidenceUpload({ ...ok, size: 1 }, { ...tenMb, minBytes: 0 })).toEqual({ ok: true });
  });

  it("최소 20KB · 선언 19KB면 `20KB 미만 · 원본 파일로 다시`", () => {
    expect(checkEvidenceUpload({ ...ok, size: 19 * KB }, { ...tenMb, minBytes: 20 * KB })).toEqual({ ok: false, reason: "20KB 미만 · 원본 파일로 다시" });
    expect(evidenceTooSmall(20)).toBe("20KB 미만 · 원본 파일로 다시");
  });

  it("최소와 같은 크기는 통과한다", () => {
    expect(checkEvidenceUpload({ ...ok, size: 20 * KB }, { ...tenMb, minBytes: 20 * KB })).toEqual({ ok: true });
  });

  it("크기 초과가 최소 용량보다 먼저다", () => {
    expect(checkEvidenceUpload({ ...ok, size: 13_002_342 }, { ...tenMb, minBytes: 20 * KB })).toEqual({ ok: false, reason: "12.4MB · 10MB 초과 · 파일을 줄여 다시" });
  });

  it("최소 용량은 형식 · 중복보다 먼저다", () => {
    const small = { ...ok, size: 19 * KB, contentType: "text/html" };
    expect(checkEvidenceUpload(small, { ...tenMb, minBytes: 20 * KB })).toEqual({ ok: false, reason: "20KB 미만 · 원본 파일로 다시" });
  });
});

// 06.1-14(E14 · RP-14 · PA-SIG-HEAD): 완료 통보가 저장소 머리 16바이트로 선언 형식의 서명을 대조한다 — 260907 sniffDocumentType 꼴 + WEBP.
describe("signatureMatches — 머리 서명", () => {
  const bytes = (...parts: Array<number[] | string>) =>
    Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? [...Buffer.from(part, "latin1")] : part)));
  const pad = (head: Uint8Array) => Uint8Array.from([...head, ...new Array<number>(Math.max(0, 16 - head.length)).fill(0)]);

  const jpeg = pad(bytes([0xff, 0xd8, 0xff, 0xe0]));
  const png = pad(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = pad(bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 "));
  const heic = pad(bytes([0, 0, 0, 0x18], "ftypheic"));
  const mif1 = pad(bytes([0, 0, 0, 0x18], "ftypmif1"));
  const pdf = pad(bytes("%PDF-1.4\n"));

  it.each([
    ["JPEG", jpeg, "image/jpeg"],
    ["PNG", png, "image/png"],
    ["WEBP", webp, "image/webp"],
    ["HEIC", heic, "image/heic"],
    ["HEIC 머리 · HEIF 선언", heic, "image/heif"],
    ["mif1 상표 · HEIC 선언", mif1, "image/heic"],
    ["PDF", pdf, "application/pdf"],
  ] as const)("%s → 참", (_, head, contentType) => {
    expect(signatureMatches(head, contentType)).toBe(true);
  });

  it.each(["heix", "hevc", "hevx", "msf1"])("HEIF 상표 %s → 참", (brand) => {
    expect(signatureMatches(pad(bytes([0, 0, 0, 0x18], `ftyp${brand}`)), "image/heif")).toBe(true);
  });

  it("PDF 머리를 PNG로 선언하면 거짓", () => {
    expect(signatureMatches(pdf, "image/png")).toBe(false);
  });

  it("RIFF지만 WEBP가 아니면(WAVE) 거짓", () => {
    expect(signatureMatches(pad(bytes("RIFF", [0, 0, 0, 0], "WAVE")), "image/webp")).toBe(false);
  });

  it("ftyp 상표가 목록 밖이면(mp42) 거짓", () => {
    expect(signatureMatches(pad(bytes([0, 0, 0, 0x18], "ftypmp42")), "image/heic")).toBe(false);
  });

  it("12바이트 미만 · null → 거짓", () => {
    expect(signatureMatches(bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(false);
    expect(signatureMatches(null, "image/jpeg")).toBe(false);
  });

  it("모르는 형식 → 거짓", () => {
    expect(signatureMatches(jpeg, "text/html")).toBe(false);
  });
});
