import { describe, expect, it } from "vitest";
import {
  RRN_CLOSED,
  afterRrnSave,
  hideRrn,
  isRrnDirty,
  revealedRrn,
} from "@/app/(app)/certs/submissions/[id]/rrn-state";

// 04.3-07 검토 반영 — I4 주민등록번호 칸 상태(순수 함수). 원래 번호는 평문으로 두지 않고 숫자 지문만 둔다.

const ORIGINAL = "930412-2123458";

describe("isRrnDirty — 숫자만 비교(검토 R-L1)", () => {
  it("연 직후 · 하이픈만 뺀 같은 번호는 바뀐 칸이 아니다", () => {
    const open = revealedRrn(ORIGINAL);
    expect(isRrnDirty(open)).toBe(false);
    expect(isRrnDirty({ ...open, input: "9304122123458" })).toBe(false);
    expect(isRrnDirty({ ...open, input: "930412-1234560" })).toBe(true);
  });

  it("고친 채 가렸다가 다시 열어 원래 번호로 되돌리면 바뀐 칸이 아니다", () => {
    const edited = { ...revealedRrn(ORIGINAL), input: "930412-1234560" };
    const masked = hideRrn(edited);
    expect(masked.open).toBe(false);
    expect(isRrnDirty(masked)).toBe(true);

    const reopened = { ...masked, open: true, input: ORIGINAL };
    expect(isRrnDirty(reopened)).toBe(false);
  });

  it("상태 어디에도 원래 번호 평문이 없다(입력 칸 값 말고는)", () => {
    const edited = { ...revealedRrn(ORIGINAL), input: "930412-1234560" };
    expect(JSON.stringify(hideRrn(edited))).not.toContain("2123458");
    expect(JSON.stringify({ ...revealedRrn(ORIGINAL), input: null })).not.toContain("2123458");
  });

  it("고치지 않고 가리면 닫힌 상태(평문 없음)", () => {
    expect(hideRrn(revealedRrn(ORIGINAL))).toEqual(RRN_CLOSED);
  });
});

describe("afterRrnSave — 보낸 값 기준(DOM 감사 H1)", () => {
  it("보낸 번호와 지금 번호가 같으면 닫는다", () => {
    const edited = { ...revealedRrn(ORIGINAL), input: "930412-1234560" };
    expect(afterRrnSave(edited, "930412-1234560")).toEqual(RRN_CLOSED);
  });

  it("대기 중 번호를 또 고쳤으면 닫지 않고, 저장된 번호 기준으로 바뀐 칸이다", () => {
    const current = { ...revealedRrn(ORIGINAL), input: "930412-1234577" };
    const next = afterRrnSave(current, "930412-1234560");
    expect(next.open).toBe(true);
    expect(next.input).toBe("930412-1234577");
    expect(isRrnDirty(next)).toBe(true);
    expect(isRrnDirty({ ...next, input: "930412-1234560" })).toBe(false);
  });

  it("번호를 보내지 않은 저장은 고치지 않은 번호 칸을 닫고, 고친 번호는 남긴다", () => {
    expect(afterRrnSave(revealedRrn(ORIGINAL), null)).toEqual(RRN_CLOSED);
    expect(afterRrnSave(RRN_CLOSED, null)).toEqual(RRN_CLOSED);
    const edited = { ...revealedRrn(ORIGINAL), input: "930412-1234560" };
    expect(afterRrnSave(edited, null)).toEqual(edited);
  });
});
