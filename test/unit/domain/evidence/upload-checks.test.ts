import { describe, expect, it } from "vitest";
import {
  checkEvidenceUpload,
  EVIDENCE_CONTENT_TYPES,
  EVIDENCE_DUPLICATE_HIDDEN,
  EVIDENCE_DUPLICATE_SAME_OWNER,
  EVIDENCE_UPLOAD_FAILED,
  EVIDENCE_WRONG_TYPE,
  evidenceDuplicateElsewhere,
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
