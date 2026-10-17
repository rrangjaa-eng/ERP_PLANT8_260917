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

describe("evidenceRecordRights (06.1-06 RP-4 · UI-SPEC S7)", () => {
  it("S7 행 1 반려 · 회수 × evidence.intake = 붙이기 · 떼기", () => {
    expect(evidenceRecordRights(owner(), INTAKE)).toEqual({ attach: true, detach: "detach", lockLine: null });
    expect(evidenceRecordRights(owner({ status: "withdrawn" }), INTAKE)).toEqual({ attach: true, detach: "detach", lockLine: null });
  });

  it("S7 행 2 반려 · 회수 × 작성자 = 없음(작성자 갈래는 06.1-08) · 키 없는 사람도 없음", () => {
    expect(evidenceRecordRights(owner(), AUTHOR)).toEqual({ attach: false, detach: "none", lockLine: null });
    expect(evidenceRecordRights(owner(), NONE)).toEqual({ attach: false, detach: "none", lockLine: null });
  });

  it("S7 행 3 결재 중 × 작성자 = in_review_author", () => {
    expect(evidenceRecordRights(owner({ status: "in_review" }), AUTHOR)).toEqual({ attach: false, detach: "none", lockLine: "in_review_author" });
  });

  it("S7 행 4 결재 중 × evidence.intake ∧ expenses.evidence_attach = 붙이기 · in_review_no_detach", () => {
    expect(evidenceRecordRights(owner({ status: "submitted" }), INTAKE_ATTACH)).toEqual({ attach: true, detach: "none", lockLine: "in_review_no_detach" });
  });

  it("S7 행 5 결재 중 × evidence.intake만 = in_review_author", () => {
    expect(evidenceRecordRights(owner({ status: "in_review" }), INTAKE)).toEqual({ attach: false, detach: "none", lockLine: "in_review_author" });
  });

  it("S7 행 6 승인(완료 아님) × 작성자 = approved_void_only", () => {
    expect(evidenceRecordRights(owner({ status: "approved" }), AUTHOR)).toEqual({ attach: false, detach: "none", lockLine: "approved_void_only" });
  });

  it("S7 행 7 승인 × expenses.evidence_void = 떼기 void", () => {
    expect(evidenceRecordRights(owner({ status: "approved" }), VOIDER)).toEqual({ attach: false, detach: "void", lockLine: null });
    expect(evidenceRecordRights(owner({ status: "approved" }), { ...INTAKE_ATTACH, voidKey: true })).toEqual({ attach: true, detach: "void", lockLine: null });
  });

  it("S7 행 8 승인 × evidence.intake(무효 키 없음) = 붙이기는 (완료 프로젝트 ∨ 지급 전 — 카드 R1) ∧ 붙이기 키 ∧ 기안자 아님 · approved_void_only", () => {
    const approved = owner({ status: "approved" });
    expect(evidenceRecordRights(approved, INTAKE_ATTACH)).toEqual({ attach: true, detach: "none", lockLine: "approved_void_only" });
    expect(evidenceRecordRights(approved, { ...INTAKE_ATTACH, paid: true })).toEqual({ attach: false, detach: "none", lockLine: "approved_void_only" });
    expect(evidenceRecordRights(owner({ status: "approved", projectCompleted: true }), { ...INTAKE_ATTACH, paid: true })).toEqual({
      attach: true,
      detach: "none",
      lockLine: "approved_void_only",
    });
    expect(evidenceRecordRights(approved, INTAKE)).toEqual({ attach: false, detach: "none", lockLine: "approved_void_only" });
  });

  it("S7 행 9 승인 · 완료 프로젝트 × 작성자 = completed_project_author(우선순위 첫째)", () => {
    expect(evidenceRecordRights(owner({ status: "approved", projectCompleted: true }), AUTHOR)).toEqual({ attach: false, detach: "none", lockLine: "completed_project_author" });
  });

  it("S7 행 10 종결 · 읽기만 = 없음", () => {
    expect(evidenceRecordRights(owner({ closed: true }), { ...INTAKE_ATTACH, voidKey: true })).toEqual({ attach: false, detach: "none", lockLine: null });
    expect(evidenceRecordRights(owner({ status: "approved" }), NONE)).toEqual({ attach: false, detach: "none", lockLine: null });
  });

  it("기안자가 두 키를 가져도 결재 중 붙이기 없음(05 adderOf)", () => {
    expect(evidenceRecordRights(owner({ status: "in_review" }), { ...INTAKE_ATTACH, isDrafter: true })).toEqual({ attach: false, detach: "none", lockLine: "in_review_author" });
  });

  it("작성 중(번호 없음) 문서는 경영관리 1차 갈래가 없다(RP-8)", () => {
    expect(evidenceRecordRights(owner({ number: null, status: null, instance: null }), INTAKE_ATTACH)).toEqual({ attach: false, detach: "none", lockLine: null });
  });
});

describe("evidenceAttachRefusal (05 거부 상수 그대로)", () => {
  it("결재 중 → 결재 중 · 증빙 잠김 · 승인(지급 뒤) → 결재 중 아님 · 증빙은 작성자", () => {
    expect(evidenceAttachRefusal(owner({ status: "in_review" }))).toBe("결재 중 · 증빙 잠김");
    expect(evidenceAttachRefusal(owner({ status: "approved" }))).toBe("결재 중 아님 · 증빙은 작성자");
  });
});
