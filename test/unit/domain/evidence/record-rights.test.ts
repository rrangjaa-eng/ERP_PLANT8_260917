import { describe, expect, it } from "vitest";
import { evidenceAttachRefusal, evidenceRecordRights, type EvidenceOwnerState } from "@/domain/evidence";

// 06.1-06(RP-4 · UI-SPEC S7 열 줄): 문서 상태 × 보는 사람 → 증빙 기록 붙이기 · 떼기 · 잠김 줄 코드. 05 규칙표(OWNER_RULES.expense ·
// adderOf · addOpen) 위에 evidence.intake 갈래만 얹는다. 사람 플래그는 부르는 쪽이 트랜잭션 전에 읽어 넘긴다(DB 없음).

const DRAFTER = "user-drafter";

function owner(patch: Partial<EvidenceOwnerState> = {}): EvidenceOwnerState {
  return {
    id: "00000000-0000-4000-8000-0000000000e1",
    drafterId: DRAFTER,
    number: "EX-2026-0001",
    status: "rejected",
    updatedAt: new Date("2026-10-16T01:00:00Z"),
    version: 3,
    projectId: "00000000-0000-4000-8000-0000000000a1",
    instance: { id: "00000000-0000-4000-8000-0000000000b1", version: 2 },
    closed: false,
    projectCompleted: false,
    ...patch,
  };
}

const NONE = { intake: false, attachKey: false, voidKey: false, isDrafter: false, paid: false };
const AUTHOR = { ...NONE, isDrafter: true };
const INTAKE = { ...NONE, intake: true };
const INTAKE_ATTACH = { ...INTAKE, attachKey: true };
const VOIDER = { ...NONE, voidKey: true };
// 06.1-08(RP-4): 작성자 칸 — 기안자 ∧ expenses 쓰기. 05 drafterAdds · drafterRemoves를 그대로 부른다.
const AUTHOR_W = { ...AUTHOR, expensesWrite: true };

describe("evidenceRecordRights (06.1-06 RP-4 · UI-SPEC S7)", () => {
  it("S7 행 1 반려 · 회수 × evidence.intake = 붙이기 · 떼기", () => {
    expect(evidenceRecordRights(owner(), INTAKE)).toMatchObject({ attach: true, detach: "detach", lockLine: null });
    expect(evidenceRecordRights(owner({ status: "withdrawn" }), INTAKE)).toMatchObject({ attach: true, detach: "detach", lockLine: null });
  });

  it("S7 행 2 반려 · 회수 × 작성자 = 없음(작성자 갈래는 06.1-08) · 키 없는 사람도 없음", () => {
    expect(evidenceRecordRights(owner(), AUTHOR)).toMatchObject({ attach: false, detach: "none", lockLine: null });
    expect(evidenceRecordRights(owner(), NONE)).toMatchObject({ attach: false, detach: "none", lockLine: null });
  });

  it("S7 행 3 결재 중 × 작성자 = in_review_author", () => {
    expect(evidenceRecordRights(owner({ status: "in_review" }), AUTHOR)).toMatchObject({ attach: false, detach: "none", lockLine: "in_review_author" });
  });

  it("S7 행 4 결재 중 × evidence.intake ∧ expenses.evidence_attach = 붙이기 · in_review_no_detach", () => {
    expect(evidenceRecordRights(owner({ status: "submitted" }), INTAKE_ATTACH)).toMatchObject({ attach: true, detach: "none", lockLine: "in_review_no_detach" });
  });

  it("S7 행 5 결재 중 × evidence.intake만 = in_review_author", () => {
    expect(evidenceRecordRights(owner({ status: "in_review" }), INTAKE)).toMatchObject({ attach: false, detach: "none", lockLine: "in_review_author" });
  });

  it("S7 행 6 승인(완료 아님) × 작성자 = approved_void_only", () => {
    expect(evidenceRecordRights(owner({ status: "approved" }), AUTHOR)).toMatchObject({ attach: false, detach: "none", lockLine: "approved_void_only" });
  });

  it("S7 행 7 승인 × expenses.evidence_void = 떼기 void", () => {
    expect(evidenceRecordRights(owner({ status: "approved" }), VOIDER)).toMatchObject({ attach: false, detach: "void", lockLine: null });
    expect(evidenceRecordRights(owner({ status: "approved" }), { ...INTAKE_ATTACH, voidKey: true })).toMatchObject({ attach: true, detach: "void", lockLine: null });
  });

  it("S7 행 8 승인 × evidence.intake(무효 키 없음) = 붙이기는 (완료 프로젝트 ∨ 지급 전 — 카드 R1) ∧ 붙이기 키 ∧ 기안자 아님 · approved_void_only", () => {
    const approved = owner({ status: "approved" });
    expect(evidenceRecordRights(approved, INTAKE_ATTACH)).toMatchObject({ attach: true, detach: "none", lockLine: "approved_void_only" });
    expect(evidenceRecordRights(approved, { ...INTAKE_ATTACH, paid: true })).toMatchObject({ attach: false, detach: "none", lockLine: "approved_void_only" });
    expect(evidenceRecordRights(owner({ status: "approved", projectCompleted: true }), { ...INTAKE_ATTACH, paid: true })).toMatchObject({
      attach: true,
      detach: "none",
      lockLine: "approved_void_only",
    });
    expect(evidenceRecordRights(approved, INTAKE)).toMatchObject({ attach: false, detach: "none", lockLine: "approved_void_only" });
  });

  it("S7 행 9 승인 · 완료 프로젝트 × 작성자 = completed_project_author(우선순위 첫째)", () => {
    expect(evidenceRecordRights(owner({ status: "approved", projectCompleted: true }), AUTHOR)).toMatchObject({ attach: false, detach: "none", lockLine: "completed_project_author" });
  });

  it("S7 행 10 종결 · 읽기만 = 없음", () => {
    expect(evidenceRecordRights(owner({ closed: true }), { ...INTAKE_ATTACH, voidKey: true })).toMatchObject({ attach: false, detach: "none", lockLine: null });
    expect(evidenceRecordRights(owner({ status: "approved" }), NONE)).toMatchObject({ attach: false, detach: "none", lockLine: null });
  });

  it("기안자가 두 키를 가져도 결재 중 붙이기 없음(05 adderOf)", () => {
    expect(evidenceRecordRights(owner({ status: "in_review" }), { ...INTAKE_ATTACH, isDrafter: true })).toMatchObject({ attach: false, detach: "none", lockLine: "in_review_author" });
  });

  it("작성 중(번호 없음) 문서는 경영관리 1차 갈래가 없다(RP-8)", () => {
    expect(evidenceRecordRights(owner({ number: null, status: null, instance: null }), INTAKE_ATTACH)).toMatchObject({ attach: false, detach: "none", lockLine: null });
  });
});

describe("evidenceAttachRefusal (05 거부 상수 그대로)", () => {
  it("결재 중 → 결재 중 · 증빙 잠김 · 승인(지급 뒤) → 결재 중 아님 · 증빙은 작성자", () => {
    expect(evidenceAttachRefusal(owner({ status: "in_review" }))).toBe("결재 중 · 증빙 잠김");
    expect(evidenceAttachRefusal(owner({ status: "approved" }))).toBe("결재 중 아님 · 증빙은 작성자");
  });
});

// 06.1-08(RP-4): 작성자 칸 둘 — 같은 입력의 05 기안자 규칙(addOpen 기안자 갈래 · drafterRemoves)과 갈리지 않는다.
describe("evidenceRecordRights 작성자 칸 (06.1-08 RP-4)", () => {
  const author = (rights: ReturnType<typeof evidenceRecordRights>) => ({ attach: rights.authorAttach, detach: rights.authorDetach });

  it("작성 중(번호 없음) · 반려 · 회수 × 기안자(expenses 쓰기) = 붙이기 · 자기 떼기", () => {
    const draft = owner({ number: null, status: null, instance: null });
    expect(author(evidenceRecordRights(draft, AUTHOR_W))).toEqual({ attach: true, detach: true });
    expect(author(evidenceRecordRights(owner(), AUTHOR_W))).toEqual({ attach: true, detach: true });
    expect(author(evidenceRecordRights(owner({ status: "withdrawn" }), AUTHOR_W))).toEqual({ attach: true, detach: true });
  });

  it("기안자가 아니거나 expenses 쓰기가 없으면 둘 다 거짓", () => {
    expect(author(evidenceRecordRights(owner(), { ...AUTHOR_W, isDrafter: false }))).toEqual({ attach: false, detach: false });
    expect(author(evidenceRecordRights(owner(), AUTHOR))).toEqual({ attach: false, detach: false });
    expect(author(evidenceRecordRights(owner(), { ...AUTHOR_W, expensesWrite: false }))).toEqual({ attach: false, detach: false });
  });

  it("결재 중 × 기안자 = 둘 다 거짓 · 잠김 줄 in_review_author 그대로", () => {
    const rights = evidenceRecordRights(owner({ status: "in_review" }), AUTHOR_W);
    expect(author(rights)).toEqual({ attach: false, detach: false });
    expect(rights.lockLine).toBe("in_review_author");
  });

  it("승인(완료 아님) × 기안자 = 붙이기만 · approved_void_only", () => {
    const rights = evidenceRecordRights(owner({ status: "approved" }), AUTHOR_W);
    expect(author(rights)).toEqual({ attach: true, detach: false });
    expect(rights.lockLine).toBe("approved_void_only");
  });

  it("승인 · 완료 프로젝트 × 기안자 = 둘 다 거짓 · completed_project_author", () => {
    const rights = evidenceRecordRights(owner({ status: "approved", projectCompleted: true }), AUTHOR_W);
    expect(author(rights)).toEqual({ attach: false, detach: false });
    expect(rights.lockLine).toBe("completed_project_author");
  });

  it("완료 프로젝트의 반려 문서는 05 파일 길처럼 열린다(PA-DONEDRAFT)", () => {
    expect(author(evidenceRecordRights(owner({ projectCompleted: true }), AUTHOR_W))).toEqual({ attach: true, detach: true });
  });

  it("종결 = 둘 다 거짓", () => {
    expect(author(evidenceRecordRights(owner({ closed: true }), AUTHOR_W))).toEqual({ attach: false, detach: false });
    expect(author(evidenceRecordRights(owner({ closed: true, status: "approved" }), AUTHOR_W))).toEqual({ attach: false, detach: false });
  });

  it("경영관리 칸(attach · detach)은 작성자 칸에 영향받지 않는다", () => {
    expect(evidenceRecordRights(owner(), { ...AUTHOR_W, intake: true })).toMatchObject({ attach: true, detach: "detach", authorAttach: true, authorDetach: true });
  });
});
