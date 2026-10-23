import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { Money } from "@/domain/money";
import type { TaxLinePart } from "@/domain/expenses/tax";
import type { PaymentAccount } from "@/domain/payments";

// 05-03: 지출결의 DTO 둘 — 문서 칸은 expense.value, 금액 칸(공급가액 · 세율 · 세액 · 지급 총액)은 expense.amount.

export type ExpenseDraftDto = {
  id: string;
  projectId: string | null;
  quoteLineId: string | null;
  vendorId: string | null;
  evidenceType: string | null;
  paymentMethod: string | null;
  // 07 D-715 — 유효 예정일(수동 ?? 자동). 저장 칸은 지급 권한자 수동값만.
  scheduledPaymentDate: string | null;
  scheduledPaymentManual: boolean;
  // 07-16(D-714 · J10): 기안자가 적는 희망 지급일 · 사유(둘 다 있거나 둘 다 없다 — 07-02 CHECK). 경영관리 판단 재료라 예정일 계산에 들지 않는다.
  requestedPaymentDate: string | null;
  requestedPaymentReason: string | null;
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
    { key: "scheduledPaymentManual", from: "scheduledPaymentManual", infoItem: "expense.value" },
    { key: "requestedPaymentDate", from: "requestedPaymentDate", infoItem: "expense.value" },
    { key: "requestedPaymentReason", from: "requestedPaymentReason", infoItem: "expense.value" },
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
  // 06.5 D-6517: 직원 지급처 이름(사람 정보) · 문서 날짜의 그 직원 소속 팀(팀 정보) — 거래처 지급처면 null.
  payeeUserName: string | null;
  payeeTeamName: string | null;
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
  // 06-28(S23): 종결 문서의 메타 재료(종결한 사람 이름 · 서울 MM-DD · 사유 원문) — 종결 아니면 null.
  closure: { byName: string; on: string; reason: string } | null;
  // 06-28(S23): 종결 확인 모달 재료 — 반려 · 회수(번호 있음 · 종결 아님) 문서를 보는 기안자 · 지급 권한자에게만, 그 밖은 null(버튼 없음).
  // 부제 = `{번호} · {항목} · {공급가}`(공급가는 금액을 볼 수 있을 때만), 결과 줄 = 열리는 줄 문 · 되돌림 없음.
  closeDialog: { subtitle: string; resultLines: string[] } | null;
  // 06-10: 선결제 표시 · 사유 · 증빙일 — 폼이 저장값을 다시 그리고 문서 화면이 사유 줄을 그린다(증빙 금액 칸은 06.5 D-6520으로 걷었다).
  prepaid: boolean;
  prepaidReason: string | null;
  evidenceDate: string | null;
  // 06.5 V15(카드 ①): 회사 대납 면제의 받는 인원 — 금액 정보 항목(금액을 못 보는 계급에는 빠진다).
  recipientCount: number;
  // 07(D-715 · D-731 · C6): 자동 계산일(수동이어도 셈함) · 밀림 사유 · 규칙 줄(07-01 payRuleLine) · 수동 날짜가 지급 요일이 아니면 `{요일}요일 아님`(07-01 payOffWeekdayText).
  autoPaymentDate: string;
  paymentPushReason: "cutoff" | "no-slot" | null;
  paymentRuleLine: string;
  paymentOffWeekday: string | null;
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
    { key: "payeeUserName", from: "payeeUserName", infoItem: "person.value" },
    { key: "payeeTeamName", from: "payeeTeamName", infoItem: "team.value" },
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
    { key: "closure", from: "closure", infoItem: "expense.value" },
    { key: "closeDialog", from: "closeDialog", infoItem: "expense.value" },
    { key: "prepaid", from: "prepaid", infoItem: "expense.value" },
    { key: "prepaidReason", from: "prepaidReason", infoItem: "expense.value" },
    { key: "evidenceDate", from: "evidenceDate", infoItem: "expense.value" },
    { key: "recipientCount", from: "recipientCount", infoItem: "expense.amount" },
    { key: "autoPaymentDate", from: "autoPaymentDate", infoItem: "expense.value" },
    { key: "paymentPushReason", from: "paymentPushReason", infoItem: "expense.value" },
    { key: "paymentRuleLine", from: "paymentRuleLine", infoItem: "expense.value" },
    { key: "paymentOffWeekday", from: "paymentOffWeekday", infoItem: "expense.value" },
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
  // 06.5 D-6517: 직원 지급처 이름(사람 정보) — 상세 행 `지급처` 값은 거래처 이름 → 직원 이름.
  payeeUserName: string | null;
  evidenceTypeName: string | null;
  // 06.5 V15: 회사 대납 문서의 받는 인원(금액 정보 항목) — 회사 대납이 아니면 null(상세 행 없음).
  recipientCount: number | null;
  supply: Money | null;
  taxLine: string | null;
  // 05-10: 세율 바뀜 한 줄(번호 있는 문서에서 저장 스냅숏 ≠ 지금 기준 재계산일 때) · 살아 있는 증빙 파일(주소 없음).
  taxDriftText: string | null;
  evidenceFiles: { id: string; name: string; sizeBytes: number; contentType: string }[];
  // 06.1-14(G15 · 카드 G-N2): 보이는 파일이 0인데 숨긴 G15 파일이 있는 문서의 잠김 행 글자(건수 · 파일 이름 없음), 아니면 null.
  hiddenEvidenceNotice: string | null;
  // 07 D-715 — 유효 예정일(수동 ?? 자동). 저장 칸은 지급 권한자 수동값만.
  scheduledPaymentDate: string | null;
  scheduledPaymentManual: boolean;
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
    { key: "payeeUserName", from: "payeeUserName", infoItem: "person.value" },
    { key: "evidenceTypeName", from: "evidenceTypeName", infoItem: "expense.value" },
    { key: "recipientCount", from: "recipientCount", infoItem: "expense.amount" },
    { key: "supply", from: "supply", infoItem: "expense.amount" },
    { key: "taxLine", from: "taxLine", infoItem: "expense.amount" },
    { key: "taxDriftText", from: "taxDriftText", infoItem: "expense.amount" },
    { key: "evidenceFiles", from: "evidenceFiles", infoItem: "expense.value" },
    { key: "hiddenEvidenceNotice", from: "hiddenEvidenceNotice", infoItem: "expense.value" },
    { key: "scheduledPaymentDate", from: "scheduledPaymentDate", infoItem: "expense.value" },
    { key: "scheduledPaymentManual", from: "scheduledPaymentManual", infoItem: "expense.value" },
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
  // 07-16(SC-02 · K19 · D-731): 폼 읽기 줄 `지급 예정일` — 유효 예정일 · 수동 지정 · 규칙 줄(07-01 payRuleLine).
  scheduledPaymentDate: string | null;
  scheduledPaymentManual: boolean;
  paymentRuleLine: string;
};

export const EXPENSE_PREVIEW_DTO_SPEC: DtoSpec<ExpensePreviewDto, ExpensePreviewDto> = {
  fields: [
    { key: "taxLine", from: "taxLine", infoItem: "expense.amount" },
    { key: "block", from: "block", infoItem: "expense.value" },
    { key: "fieldErrors", from: "fieldErrors", infoItem: "expense.amount" },
    { key: "teamName", from: "teamName", infoItem: "expense.value" },
    { key: "scheduledPaymentDate", from: "scheduledPaymentDate", infoItem: "expense.value" },
    { key: "scheduledPaymentManual", from: "scheduledPaymentManual", infoItem: "expense.value" },
    { key: "paymentRuleLine", from: "paymentRuleLine", infoItem: "expense.value" },
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

// 05-08 목록 행(S8) — 문서 칸은 expense.value, 공급가액(금액 열 · 외화 2행)은 expense.amount(못 보는 계급에는 금액 열 · 합계가 없다).
// 기안 이름은 보는 사람의 범위가 자기 문서뿐이면 listExpenses가 싣지 않는다(구조 판정 — 항목 투영 밖).
export type ExpenseListRowDto = {
  id: string;
  number: string | null;
  // 「프로젝트 · 항목」 칸 1행 — 견적 줄 문서 `{프로젝트} · {항목}`(분할이면 ` N회차`), 팀 비용 `{팀} · {내용}`.
  title: string;
  // 팀 비용 2행 `프로젝트 미연결 · {종류}`(견적 줄 문서 null).
  unlinkedText: string | null;
  vendorName: string | null;
  // 06.5 D-6517: 직원 지급처 이름(사람 정보) — 지급처 열은 거래처 이름 → 직원 이름. 06.5-08 목록 검색이 이 칸을 이어 쓴다(EP2-D5).
  payeeUserName: string | null;
  supply: Money | null;
  // 07 D-715 — 유효 예정일(수동 ?? 자동). 저장 칸은 지급 권한자 수동값만.
  scheduledPaymentDate: string | null;
  scheduledPaymentManual: boolean;
  drafterName: string;
  // `작성 중` / `{단계} 결재 중` / `반려` / `회수` / `승인`, 날짜는 MM-DD(서울 — 반려 · 회수 · 승인만).
  statusWord: string;
  statusDate: string | null;
  // 06-20(UA-605) — 상태 칸 둘째 줄 `증빙 {N}일 경과`(기한 지난 선결제 · 지급 뒤). 없으면 키 없음.
  statusNote?: string | null;
};

export const EXPENSE_LIST_ROW_DTO_SPEC: DtoSpec<ExpenseListRowDto, ExpenseListRowDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "number", from: "number", infoItem: "expense.value" },
    { key: "title", from: "title", infoItem: "expense.value" },
    { key: "unlinkedText", from: "unlinkedText", infoItem: "expense.value" },
    { key: "vendorName", from: "vendorName", infoItem: "expense.value" },
    { key: "payeeUserName", from: "payeeUserName", infoItem: "person.value" },
    { key: "supply", from: "supply", infoItem: "expense.amount" },
    { key: "scheduledPaymentDate", from: "scheduledPaymentDate", infoItem: "expense.value" },
    { key: "scheduledPaymentManual", from: "scheduledPaymentManual", infoItem: "expense.value" },
    { key: "drafterName", from: "drafterName", infoItem: "expense.value" },
    { key: "statusWord", from: "statusWord", infoItem: "expense.value" },
    { key: "statusDate", from: "statusDate", infoItem: "expense.value" },
    { key: "statusNote", from: "statusNote", infoItem: "expense.value" },
  ],
};

// 06-15(S1) — 지급 대상 행. 금액(지급 총액 · 이체액)은 expense.amount, 나머지는 expense.value. 고를 수 있는지 · 이유는 서버 판정
// (resolveExpenseActionRow)이라 문서 값과 같은 항목. 이 모듈은 누수 스캔이 이미 import한다(leak-scan.test.ts 무변경 — C18).
export type PaymentTargetRowDto = {
  id: string;
  number: string | null;
  title: string;
  vendorName: string | null;
  // 06.5 D-6517: 직원 지급처 이름(사람 정보) — 지급처 셀은 거래처 이름 → 직원 이름.
  payeeUserName: string | null;
  // 지급 방식 낱말(코드표 이름) — 계좌 칸은 06-20.
  paymentMethodName: string | null;
  scheduledPaymentDate: string | null;
  // 증빙 상태 낱말(`확인됨` · `확인 전` · `증빙 없음` · `면제` · `선결제`).
  evidenceStatus: string;
  payableKrw: number | null;
  // 이체액(읽기 — 편집은 06-17). 이 플랜에서는 지급 총액과 같다.
  transferKrw: number | null;
  version: number;
  selectable: boolean;
  reason: string | null;
  prepaid: boolean;
  quoteLineId: string | null;
  // 06-20(O-17) — 지급 권한자의 계좌이체 행에만 있는 키(domain/payments projectPaymentAccounts).
  account?: PaymentAccount;
  // 06.5-06(결정 맥락 11): 오늘(KST) 이체 파일에 담긴 가장 늦은 시각 HH:mm — 이체 파일 게이트를 가진 사람에게만, 아니면 null.
  transferFileAt: string | null;
  // 07-01(D-715 · D-742): scheduledPaymentDate는 유효 예정일(수동 ?? 자동). 수동 지정 여부 · 자동값 · 결재 마감(ISO) · 밀림 사유 · 계산 실패(R15).
  scheduledPaymentManual: boolean;
  autoPaymentDate: string;
  paymentCutoffAt: string;
  paymentPushReason: "cutoff" | "no-slot" | null;
  paymentScheduleFailed: boolean;
  // gate `payment.cutoff` 판정 이유(그 주 소속 — 통과면 null). 지급 처리 동작은 막지 않는다(D-703 · J7).
  paymentCutoffReason: string | null;
  // 07-23 N2 · B-P2-5: 지급처 거래처가 확인됐나(직원 지급처 · 거래처 없음이면 참 — 해당 없음) · 계좌가 바뀐 뒤 그 거래처로 아직 지급하지 않았나(AQ-36).
  // 화면은 계좌 아래 한 값 `확인 전 > 계좌 바뀜`. 둘 다 지급을 막지 않는다(G13 사후 확인).
  vendorConfirmed: boolean;
  accountChanged: boolean;
};

export const PAYMENT_TARGET_ROW_DTO_SPEC: DtoSpec<PaymentTargetRowDto, PaymentTargetRowDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "number", from: "number", infoItem: "expense.value" },
    { key: "title", from: "title", infoItem: "expense.value" },
    { key: "vendorName", from: "vendorName", infoItem: "expense.value" },
    { key: "payeeUserName", from: "payeeUserName", infoItem: "person.value" },
    { key: "paymentMethodName", from: "paymentMethodName", infoItem: "expense.value" },
    { key: "scheduledPaymentDate", from: "scheduledPaymentDate", infoItem: "expense.value" },
    { key: "evidenceStatus", from: "evidenceStatus", infoItem: "expense.value" },
    { key: "payableKrw", from: "payableKrw", infoItem: "expense.amount" },
    { key: "transferKrw", from: "transferKrw", infoItem: "expense.amount" },
    { key: "version", from: "version", infoItem: "expense.value" },
    { key: "selectable", from: "selectable", infoItem: "expense.value" },
    { key: "reason", from: "reason", infoItem: "expense.value" },
    { key: "prepaid", from: "prepaid", infoItem: "expense.value" },
    { key: "quoteLineId", from: "quoteLineId", infoItem: "expense.value" },
    { key: "account", from: "account", infoItem: "vendor.value" },
    { key: "transferFileAt", from: "transferFileAt", infoItem: "expense.value" },
    { key: "scheduledPaymentManual", from: "scheduledPaymentManual", infoItem: "expense.value" },
    { key: "autoPaymentDate", from: "autoPaymentDate", infoItem: "expense.value" },
    { key: "paymentCutoffAt", from: "paymentCutoffAt", infoItem: "expense.value" },
    { key: "paymentPushReason", from: "paymentPushReason", infoItem: "expense.value" },
    { key: "paymentScheduleFailed", from: "paymentScheduleFailed", infoItem: "expense.value" },
    { key: "paymentCutoffReason", from: "paymentCutoffReason", infoItem: "expense.value" },
    { key: "vendorConfirmed", from: "vendorConfirmed", infoItem: "vendor.value" },
    { key: "accountChanged", from: "accountChanged", infoItem: "vendor.value" },
  ],
};

// 07-01(J11 데이터 — 화면은 07-16): 지금 승인되면 이번 주 · 다음 주에 들어갈 결재 중 지출결의. 지급 대상 groups · 합계에는 넣지 않는다.
export type ApprovingPaymentRowDto = {
  id: string;
  number: string | null;
  title: string;
  payableKrw: number | null;
  // 결재 상태 낱말(gate `payment.cutoff` 이유 — `결재 중`).
  status: string;
};

export const APPROVING_PAYMENT_ROW_DTO_SPEC: DtoSpec<ApprovingPaymentRowDto, ApprovingPaymentRowDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "number", from: "number", infoItem: "expense.value" },
    { key: "title", from: "title", infoItem: "expense.value" },
    { key: "payableKrw", from: "payableKrw", infoItem: "expense.amount" },
    { key: "status", from: "status", infoItem: "expense.value" },
  ],
};

// 06-20(S3 「지급 완료」 보기) — 지급 기록 행. 금액(이체액 · 차이)은 expense.amount, 나머지는 expense.value. 계좌 칸은 없다(O-17 — 대표가 읽는다).
// 지급 방식은 낱말만(지급 기록이 복사한 코드의 이름). 증빙 상태는 06-06 resolveEvidenceStatus(06.5 D-6520 — 증빙 금액 있음 칸 없음).
export type PaidPaymentRowDto = {
  id: string;
  number: string | null;
  title: string;
  vendorName: string | null;
  // 06.5 D-6517: 직원 지급처 이름(사람 정보).
  payeeUserName: string | null;
  paymentMethodName: string | null;
  payDate: string;
  transferKrw: number;
  diffKrw: number;
  diffReason: string | null;
  evidenceStatus: string;
  processedByName: string;
  version: number;
};

export const PAID_PAYMENT_ROW_DTO_SPEC: DtoSpec<PaidPaymentRowDto, PaidPaymentRowDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "number", from: "number", infoItem: "expense.value" },
    { key: "title", from: "title", infoItem: "expense.value" },
    { key: "vendorName", from: "vendorName", infoItem: "expense.value" },
    { key: "payeeUserName", from: "payeeUserName", infoItem: "person.value" },
    { key: "paymentMethodName", from: "paymentMethodName", infoItem: "expense.value" },
    { key: "payDate", from: "payDate", infoItem: "expense.value" },
    { key: "transferKrw", from: "transferKrw", infoItem: "expense.amount" },
    { key: "diffKrw", from: "diffKrw", infoItem: "expense.amount" },
    { key: "diffReason", from: "diffReason", infoItem: "expense.value" },
    { key: "evidenceStatus", from: "evidenceStatus", infoItem: "expense.value" },
    { key: "processedByName", from: "processedByName", infoItem: "expense.value" },
    { key: "version", from: "version", infoItem: "expense.value" },
  ],
};

registerDto({ name: "expenseDraft", fields: EXPENSE_DRAFT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expenseDocument", fields: EXPENSE_DOCUMENT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expenseDetail", fields: EXPENSE_DETAIL_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expensePreview", fields: EXPENSE_PREVIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expenseNewDefaults", fields: EXPENSE_NEW_DEFAULTS_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expenseListRow", fields: EXPENSE_LIST_ROW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "paymentTargetRow", fields: PAYMENT_TARGET_ROW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "approvingPaymentRow", fields: APPROVING_PAYMENT_ROW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "paidPaymentRow", fields: PAID_PAYMENT_ROW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
