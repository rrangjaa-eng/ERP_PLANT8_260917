import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { Money } from "@/domain/money";
import type { TaxLinePart } from "@/domain/expenses/tax";

// 05-03: 지출결의 DTO 둘 — 문서 칸은 expense.value, 금액 칸(공급가액 · 세율 · 세액 · 지급 총액)은 expense.amount.

export type ExpenseDraftDto = {
  id: string;
  projectId: string | null;
  quoteLineId: string | null;
  vendorId: string | null;
  evidenceType: string | null;
  paymentMethod: string | null;
  scheduledPaymentDate: string | null;
  note: string | null;
  installment: boolean;
  version: number;
  supply: Money | null;
};

export const EXPENSE_DRAFT_DTO_SPEC: DtoSpec<ExpenseDraftDto, ExpenseDraftDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "projectId", from: "projectId", infoItem: "expense.value" },
    { key: "quoteLineId", from: "quoteLineId", infoItem: "expense.value" },
    { key: "vendorId", from: "vendorId", infoItem: "expense.value" },
    { key: "evidenceType", from: "evidenceType", infoItem: "expense.value" },
    { key: "paymentMethod", from: "paymentMethod", infoItem: "expense.value" },
    { key: "scheduledPaymentDate", from: "scheduledPaymentDate", infoItem: "expense.value" },
    { key: "note", from: "note", infoItem: "expense.value" },
    { key: "installment", from: "installment", infoItem: "expense.value" },
    { key: "version", from: "version", infoItem: "expense.value" },
    { key: "supply", from: "supply", infoItem: "expense.amount" },
  ],
};

export type ExpenseDocumentDto = ExpenseDraftDto & {
  number: string | null;
  drafterName: string;
  projectName: string | null;
  projectNumber: string | null;
  // 견적 표의 줄 번호 — 문서 화면 · 결재 시트 `견적 줄` 값 앞 조각.
  lineNo: number | null;
  itemName: string | null;
  vendorName: string | null;
  // 코드표 이름(증빙 종류 · 지급 방식) — 값(코드)은 evidenceType · paymentMethod.
  evidenceTypeName: string | null;
  paymentMethodName: string | null;
  installmentSeq: number | null;
  // 05-07 팀 비용 문서(프로젝트 · 견적 줄 없음) — 귀속 팀 이름(저장 때 고정) · 종류 · 사용일 · 내용. 견적 줄 문서는 null.
  teamExpenseKind: string | null;
  teamExpenseKindLabel: string | null;
  usageDate: string | null;
  content: string | null;
  teamName: string | null;
  statusWord: string;
  instanceId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  taxRuleKind: string | null;
  taxRate: string | null;
  vatKrw: number | null;
  withholdingKrw: number | null;
  companyBorneKrw: number | null;
  payableKrw: number | null;
  // 계산 한 줄 — 제출 뒤 문서는 저장된 스냅숏, 작성 중은 지금 기준 계산. 조각의 emphasis가 숫자 700 표식(금액 정보 항목).
  taxLine: { text: string; parts: TaxLinePart[] } | null;
  // 05-06 세율 바뀜 — 번호 있는 문서만, 저장 스냅숏 값 대 지금 기준 재계산 값이 다를 때 한 줄(같으면 null). 조각 모양은 taxLine과 같다.
  taxDrift: { text: string; parts: TaxLinePart[] } | null;
  // 05-05 폼 자동 채움 재료(작성 중에만 채운다) — 거래처 기본 증빙 종류 이름 · 견적 줄 실행가 줄(외화면 둘째 줄) · 분할 지급 갈래와 힌트 한 줄.
  defaultEvidenceName: string | null;
  executionLines: string[];
  installmentMode: "checkbox" | "fixed" | "none";
  installmentText: string | null;
};

export const EXPENSE_DOCUMENT_DTO_SPEC: DtoSpec<ExpenseDocumentDto, ExpenseDocumentDto> = {
  fields: [
    ...EXPENSE_DRAFT_DTO_SPEC.fields,
    { key: "number", from: "number", infoItem: "expense.value" },
    { key: "drafterName", from: "drafterName", infoItem: "expense.value" },
    { key: "projectName", from: "projectName", infoItem: "expense.value" },
    { key: "projectNumber", from: "projectNumber", infoItem: "expense.value" },
    { key: "lineNo", from: "lineNo", infoItem: "expense.value" },
    { key: "itemName", from: "itemName", infoItem: "expense.value" },
    { key: "vendorName", from: "vendorName", infoItem: "expense.value" },
    { key: "evidenceTypeName", from: "evidenceTypeName", infoItem: "expense.value" },
    { key: "paymentMethodName", from: "paymentMethodName", infoItem: "expense.value" },
    { key: "installmentSeq", from: "installmentSeq", infoItem: "expense.value" },
    { key: "teamExpenseKind", from: "teamExpenseKind", infoItem: "expense.value" },
    { key: "teamExpenseKindLabel", from: "teamExpenseKindLabel", infoItem: "expense.value" },
    { key: "usageDate", from: "usageDate", infoItem: "expense.value" },
    { key: "content", from: "content", infoItem: "expense.value" },
    { key: "teamName", from: "teamName", infoItem: "expense.value" },
    { key: "statusWord", from: "statusWord", infoItem: "expense.value" },
    { key: "instanceId", from: "instanceId", infoItem: "expense.value" },
    { key: "submittedAt", from: "submittedAt", infoItem: "expense.value" },
    { key: "createdAt", from: "createdAt", infoItem: "expense.value" },
    { key: "taxRuleKind", from: "taxRuleKind", infoItem: "expense.value" },
    { key: "taxRate", from: "taxRate", infoItem: "expense.amount" },
    { key: "vatKrw", from: "vatKrw", infoItem: "expense.amount" },
    { key: "withholdingKrw", from: "withholdingKrw", infoItem: "expense.amount" },
    { key: "companyBorneKrw", from: "companyBorneKrw", infoItem: "expense.amount" },
    { key: "payableKrw", from: "payableKrw", infoItem: "expense.amount" },
    { key: "taxLine", from: "taxLine", infoItem: "expense.amount" },
    { key: "taxDrift", from: "taxDrift", infoItem: "expense.amount" },
    { key: "defaultEvidenceName", from: "defaultEvidenceName", infoItem: "expense.value" },
    { key: "executionLines", from: "executionLines", infoItem: "expense.amount" },
    { key: "installmentMode", from: "installmentMode", infoItem: "expense.value" },
    { key: "installmentText", from: "installmentText", infoItem: "expense.amount" },
  ],
};

// 05-05 C1(ENG-17): 결재 시트 상세 — loadDetails는 구조 필드만, 행 문자열은 투영 뒤 buildDetailRows가 만든다. 공급가액 네 칸과 계산 한
// 줄 문자열은 expense.amount, 번호 · 프로젝트 · 견적 줄 · 회차 · 거래처 · 코드표 이름 · 지급 예정일 · 비고는 expense.value, 기안 이름 ·
// 기안일은 approval.value(04.1 결재함 DTO와 같은 항목) — 새 정보 항목 없음.
export type ExpenseDetailDto = {
  number: string | null;
  projectNumber: string | null;
  projectName: string | null;
  // 05-07 팀 비용 문서 — 견적 줄 문서는 teamName null.
  teamName: string | null;
  teamExpenseKindLabel: string | null;
  usageDate: string | null;
  content: string | null;
  lineNo: number | null;
  itemName: string | null;
  installment: boolean;
  installmentSeq: number | null;
  vendorName: string | null;
  evidenceTypeName: string | null;
  supply: Money | null;
  taxLine: string | null;
  scheduledPaymentDate: string | null;
  paymentMethodName: string | null;
  note: string | null;
  drafterName: string;
  createdAt: Date;
};

export const EXPENSE_DETAIL_DTO_SPEC: DtoSpec<ExpenseDetailDto, ExpenseDetailDto> = {
  fields: [
    { key: "number", from: "number", infoItem: "expense.value" },
    { key: "projectNumber", from: "projectNumber", infoItem: "expense.value" },
    { key: "projectName", from: "projectName", infoItem: "expense.value" },
    { key: "teamName", from: "teamName", infoItem: "expense.value" },
    { key: "teamExpenseKindLabel", from: "teamExpenseKindLabel", infoItem: "expense.value" },
    { key: "usageDate", from: "usageDate", infoItem: "expense.value" },
    { key: "content", from: "content", infoItem: "expense.value" },
    { key: "lineNo", from: "lineNo", infoItem: "expense.value" },
    { key: "itemName", from: "itemName", infoItem: "expense.value" },
    { key: "installment", from: "installment", infoItem: "expense.value" },
    { key: "installmentSeq", from: "installmentSeq", infoItem: "expense.value" },
    { key: "vendorName", from: "vendorName", infoItem: "expense.value" },
    { key: "evidenceTypeName", from: "evidenceTypeName", infoItem: "expense.value" },
    { key: "supply", from: "supply", infoItem: "expense.amount" },
    { key: "taxLine", from: "taxLine", infoItem: "expense.amount" },
    { key: "scheduledPaymentDate", from: "scheduledPaymentDate", infoItem: "expense.value" },
    { key: "paymentMethodName", from: "paymentMethodName", infoItem: "expense.value" },
    { key: "note", from: "note", infoItem: "expense.value" },
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "createdAt", from: "createdAt", infoItem: "approval.value" },
  ],
};

// 05-06 미리보기 응답 — 계산 한 줄 · 회차 상한 칸 오류는 금액(expense.amount), 막힘 이유 · 대상은 문서 칸(expense.value). 문서 DTO의
// taxLine과 같은 항목이라 금액을 볼 수 없는 계급에는 미리보기에서도 한 줄이 없다.
export type ExpensePreviewDto = {
  taxLine: { text: string; parts: TaxLinePart[] } | null;
  // 05-06 Task 2 — 첫 막힘 글자 · 다음 한 수 대상 · 대상이 페이지 이동이면 그 주소(① 담당 PM 프로젝트 상세 · ④ 가장 최근 문서).
  block: { reason: string; target: string | null; href: string | null } | null;
  fieldErrors: { supplyAmount?: string; usageDate?: string };
  // 05-07 팀 비용 — 사용일 소속 팀 이름(사용일을 바꾸면 미리보기로 다시 온다). 견적 줄 문서 null.
  teamName: string | null;
};

export const EXPENSE_PREVIEW_DTO_SPEC: DtoSpec<ExpensePreviewDto, ExpensePreviewDto> = {
  fields: [
    { key: "taxLine", from: "taxLine", infoItem: "expense.amount" },
    { key: "block", from: "block", infoItem: "expense.value" },
    { key: "fieldErrors", from: "fieldErrors", infoItem: "expense.amount" },
    { key: "teamName", from: "teamName", infoItem: "expense.value" },
  ],
};

// 05-07 `/expenses/new` 첫 그림 — 사용일 기본(서울 오늘)과 그날 내 소속 팀 이름(소속 없으면 null).
export type ExpenseNewDefaultsDto = { usageDate: string; teamName: string | null; usageDateError: string | null };

export const EXPENSE_NEW_DEFAULTS_DTO_SPEC: DtoSpec<ExpenseNewDefaultsDto, ExpenseNewDefaultsDto> = {
  fields: [
    { key: "usageDate", from: "usageDate", infoItem: "expense.value" },
    { key: "teamName", from: "teamName", infoItem: "expense.value" },
    { key: "usageDateError", from: "usageDateError", infoItem: "expense.value" },
  ],
};

registerDto({ name: "expenseDraft", fields: EXPENSE_DRAFT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expenseDocument", fields: EXPENSE_DOCUMENT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expenseDetail", fields: EXPENSE_DETAIL_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expensePreview", fields: EXPENSE_PREVIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expenseNewDefaults", fields: EXPENSE_NEW_DEFAULTS_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
