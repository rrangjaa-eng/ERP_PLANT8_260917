import { describe, expect, it } from "vitest";
import {
  evidenceKindLabel,
  evidenceRecordStatus,
  evidenceVisibilityCell,
  evidenceVisibilityLabel,
  type EvidenceRecordStatusInput,
} from "@/domain/evidence-records/status";

// 06.1-05(D-6112 · SP-6101) — 증빙 기록 한 줄의 상태 낱말 · 2행. 한 값 규칙 보관됨 > 카드 미등록 > 확인 필요 > 붙음 > 미공개 > 팀 공개 >
// 본부 공개의 첫 값 하나만 서고, 2행 규칙(DA-5 사유 그대로 · DA-9 음수 · DA-11 저장 당시 본부 · RP-15 ⑴ G15 종류)도 이 함수 하나에 있다.

function input(patch: Partial<EvidenceRecordStatusInput>): EvidenceRecordStatusInput {
  return {
    archived: false,
    isCardFormat: false,
    corpCardId: null,
    cardLabel: null,
    needsCheck: null,
    attached: false,
    negative: false,
    visibility: "private",
    teamName: null,
    divisionName: null,
    privateTypeName: null,
    ...patch,
  };
}

const CARD = "00000000-0000-4000-8000-000000000001";

describe("evidenceRecordStatus (06.1-05 한 값 규칙)", () => {
  it("보관 + 붙음 → 보관됨(보관이 맨 앞)", () => {
    expect(evidenceRecordStatus(input({ archived: true, attached: true, visibility: "team", teamName: "기획1팀" }))).toEqual({ word: "보관됨", detail: null });
  });

  it("카드 서식 + 카드 id 없음 + 확인 필요 → 카드 미등록 · 2행 카드 · 담당", () => {
    const status = evidenceRecordStatus(input({ isCardFormat: true, corpCardId: null, cardLabel: "신한 1234", needsCheck: "해외 이용 · 원화 금액 확인" }));
    expect(status).toEqual({ word: "카드 미등록", detail: "신한 1234 · 카드 등록은 관리자" });
  });

  it("확인 필요 + 붙음 → 확인 필요 · 2행 사유 글 그대로(DA-5)", () => {
    const status = evidenceRecordStatus(input({ isCardFormat: true, corpCardId: CARD, cardLabel: "비씨 5678", needsCheck: "취소 표시 줄 · 원거래 확인", attached: true }));
    expect(status).toEqual({ word: "확인 필요", detail: "취소 표시 줄 · 원거래 확인" });
  });

  it("붙음 + 팀 공개 → 붙음(문서 번호 2행은 06.1-06)", () => {
    expect(evidenceRecordStatus(input({ attached: true, visibility: "team", teamName: "기획1팀" }))).toEqual({ word: "붙음", detail: null });
  });

  it("미공개 → 미공개 · 2행 없음", () => {
    expect(evidenceRecordStatus(input({ isCardFormat: true, corpCardId: CARD, cardLabel: "롯데 4321" }))).toEqual({ word: "미공개", detail: null });
  });

  it("미공개 + 합계 음수 → 미공개 · 2행 음수 안내(DA-9)", () => {
    expect(evidenceRecordStatus(input({ negative: true }))).toEqual({ word: "미공개", detail: "음수 · 원거래 문서에 붙이기" });
  });

  it("팀 공개 → 팀 공개 · 2행 팀 이름", () => {
    expect(evidenceRecordStatus(input({ visibility: "team", teamName: "기획1팀" }))).toEqual({ word: "팀 공개", detail: "기획1팀" });
  });

  it("본부 공개 → 본부 공개 · 2행 저장 당시 본부 이름(DA-11)", () => {
    expect(evidenceRecordStatus(input({ visibility: "division", divisionName: "기획본부" }))).toEqual({ word: "본부 공개", detail: "기획본부 공개" });
  });

  it("(RP-15 ⑴) 경영관리만 종류 + 저장값 팀 공개 + 안 붙음 → 미공개 · 2행 종류 이름", () => {
    const status = evidenceRecordStatus(input({ privateTypeName: "개인카드 전표", visibility: "team", teamName: "기획1팀" }));
    expect(status).toEqual({ word: "미공개", detail: "개인카드 전표 · 경영관리만" });
  });
});

// 공개 셀 — 고칠 수 있는 줄만 edit. 확인 필요 · 카드 미등록은 잠긴 셀(이유는 상태 2행), 붙음 · 음수 · 경영관리만 종류 · 보관은 `—`(UI-SPEC S2).
describe("evidenceVisibilityCell (06.1-05 공개 셀)", () => {
  it("공개할 수 있는 줄(미공개 · 팀 공개 · 본부 공개)은 edit", () => {
    expect(evidenceVisibilityCell(input({}))).toBe("edit");
    expect(evidenceVisibilityCell(input({ visibility: "team", teamName: "기획1팀" }))).toBe("edit");
    expect(evidenceVisibilityCell(input({ isCardFormat: true, corpCardId: CARD, visibility: "division", divisionName: "기획본부" }))).toBe("edit");
  });

  it("확인 필요 · 카드 미등록은 locked — 확인 필요 + 음수도 locked(확인 필요가 앞선다)", () => {
    expect(evidenceVisibilityCell(input({ needsCheck: "해외 이용 · 원화 금액 확인" }))).toBe("locked");
    expect(evidenceVisibilityCell(input({ isCardFormat: true, corpCardId: null }))).toBe("locked");
    expect(evidenceVisibilityCell(input({ needsCheck: "취소 표시 줄 · 원거래 확인", negative: true }))).toBe("locked");
  });

  it("붙음 · 음수 · 경영관리만 종류 · 보관은 readonly", () => {
    expect(evidenceVisibilityCell(input({ attached: true }))).toBe("readonly");
    expect(evidenceVisibilityCell(input({ negative: true }))).toBe("readonly");
    expect(evidenceVisibilityCell(input({ privateTypeName: "개인카드 전표" }))).toBe("readonly");
    expect(evidenceVisibilityCell(input({ archived: true, needsCheck: "해외 이용 · 원화 금액 확인" }))).toBe("readonly");
  });
});

// 공개 셀 글자 — 셀에 보이는 글자는 고른 라벨이다(UI-SPEC S2). 저장된 본부 공개 줄은 저장 당시 본부 이름(DA-11 하위).
describe("evidenceVisibilityLabel (06.1-05 공개 셀 글자)", () => {
  it("미공개 → 미공개 · 팀 공개 → {팀} 공개 · 본부 공개 → {저장 당시 본부} 공개", () => {
    expect(evidenceVisibilityLabel(input({}))).toBe("미공개");
    expect(evidenceVisibilityLabel(input({ visibility: "team", teamName: "기획1팀" }))).toBe("기획1팀 공개");
    expect(evidenceVisibilityLabel(input({ visibility: "division", divisionName: "기획본부" }))).toBe("기획본부 공개");
  });
});

// DA-8 · E42 — 2행 종류 글자. 당초 승인번호가 있는 세금계산서 · 계산서 줄은 `수정세금계산서` · `수정계산서`(새 태그 · 색 없음), 그 밖은 코드표 이름 그대로.
describe("evidenceKindLabel (06.1-05 DA-8 종류 글자)", () => {
  it("당초 승인번호가 있으면 세금계산서 → 수정세금계산서 · 계산서 → 수정계산서", () => {
    expect(evidenceKindLabel({ evidenceType: "tax_invoice", typeLabel: "세금계산서", originalApprovalNo: "20260615-10260615-71160001" })).toBe("수정세금계산서");
    expect(evidenceKindLabel({ evidenceType: "invoice", typeLabel: "계산서", originalApprovalNo: "20260615-10260615-71160001" })).toBe("수정계산서");
  });

  it("당초 승인번호가 없거나 다른 종류면 코드표 이름 그대로", () => {
    expect(evidenceKindLabel({ evidenceType: "tax_invoice", typeLabel: "세금계산서", originalApprovalNo: null })).toBe("세금계산서");
    expect(evidenceKindLabel({ evidenceType: "card_receipt", typeLabel: "카드 전표", originalApprovalNo: null })).toBe("카드 전표");
    expect(evidenceKindLabel({ evidenceType: "cash_receipt", typeLabel: null, originalApprovalNo: null })).toBeNull();
  });
});
