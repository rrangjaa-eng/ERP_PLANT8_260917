import { z } from "zod";
import { env } from "@/lib/env";
import type { SettingDef } from "@/domain/settings/registry";
import { ALWAYS_ON_ACTION_TYPES, CORE_ACTION_TYPES, type CoreActionType } from "@/domain/action-log/record";

// ROADMAP Phase 3 성공 기준 4가 열거한 키의 정본. 각 항목이 namespace(설정
// 화면 섹션)·label(짧은 이름)·hint(한 문장, 최대 한 줄)·schema(범위·타입만,
// 반올림 없음)·kind(historized|simple)를 갖는다.

// ── 지금 읽히는 키 (예외 표시 없음) ─────────────────────────────────────

// 로그인 잠금 — domain/auth/lockout.ts의 lockoutConfig()가 환경 변수 대신
// 이 두 키를 읽는다. 환경 변수는 이 default의 출처로만 남는다.
export const AUTH_LOCKOUT_THRESHOLD: SettingDef<number> = {
  key: "auth.lockout.threshold",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "로그인 잠금 임계값",
  hint: "이 횟수만큼 연속 실패하면 로그인을 잠급니다.",
  namespace: "로그인 잠금",
  default: env.LOCKOUT_THRESHOLD,
};

export const AUTH_LOCKOUT_WINDOW_MINUTES: SettingDef<number> = {
  key: "auth.lockout.window_minutes",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "로그인 잠금 창(분)",
  hint: "이 시간(분) 안의 실패만 잠금 판정에 셉니다.",
  namespace: "로그인 잠금",
  default: env.LOCKOUT_WINDOW_MINUTES,
};

// 로그인 속도 제한 최대치(RATE_LIMIT_LOGIN_MAX)는 등록하지 않는다(planner
// 결정) — lib/auth.ts:57이 better-auth rateLimit.customRules에 부팅 시
// 한 번 싣는 값이라 런타임 레지스트리에 등록하면 화면에 보이지만 효력이
// 없는 손잡이가 된다. 그 값은 환경 변수로 남는다.

// action_log.optional_types — ADMN-10의 "어떤 행동을 핵심으로 남길지
// 설정에서 고른다". 끌 수 없는 종류(ALWAYS_ON_ACTION_TYPES)는 이 키의
// 선택지에서 제외한다 — zod enum 자체가 그 값을 받으면 거부한다.
const OPTIONAL_ACTION_TYPES = CORE_ACTION_TYPES.filter(
  (type): type is CoreActionType => !(ALWAYS_ON_ACTION_TYPES as readonly string[]).includes(type),
);

export const ACTION_LOG_OPTIONAL_TYPES: SettingDef<CoreActionType[]> = {
  key: "action_log.optional_types",
  kind: "simple",
  schema: z.array(z.enum(OPTIONAL_ACTION_TYPES as [CoreActionType, ...CoreActionType[]])),
  label: "기록할 행동 종류",
  hint: "여기서 고른 종류만 행동 로그에 남습니다(핵심 로그는 항상 켜져 있어 목록에 없습니다).",
  namespace: "행동 로그",
  default: [...OPTIONAL_ACTION_TYPES],
};

// ── 뒤 페이즈가 읽는 키 (readBy 표시 있음) ──────────────────────────────

export const TAX_VAT_RATE: SettingDef<number> = {
  key: "tax.vat.rate",
  kind: "historized",
  schema: z.coerce.number().min(0).max(1),
  label: "부가세율",
  hint: "적용 시작일부터 이 비율로 부가세를 계산합니다.",
  namespace: "세율",
  default: 0.1,
};

export const TAX_WITHHOLDING_OTHER_INCOME_RATE: SettingDef<number> = {
  key: "tax.withholding.other_income.rate",
  kind: "historized",
  schema: z.coerce.number().min(0).max(1),
  label: "기타소득 원천징수율",
  hint: "기타소득 지급액에서 이 비율만큼 원천징수합니다.",
  namespace: "세율",
  default: 0.088,
};

export const TAX_WITHHOLDING_BUSINESS_INCOME_RATE: SettingDef<number> = {
  key: "tax.withholding.business_income.rate",
  kind: "historized",
  schema: z.coerce.number().min(0).max(1),
  label: "사업소득 원천징수율",
  hint: "사업소득 지급액에서 이 비율만큼 원천징수합니다.",
  namespace: "세율",
  default: 0.033,
};

export const TAX_WITHHOLDING_OTHER_INCOME_EXEMPT_THRESHOLD: SettingDef<number> = {
  key: "tax.withholding.other_income.exempt_threshold",
  kind: "historized",
  schema: z.coerce.number().int().min(0),
  label: "기타소득 원천징수 면제 기준(지급액)",
  hint: "지급액이 이 금액 이하이면 원천징수하지 않습니다.",
  namespace: "세율",
  default: 125000,
};

export const TAX_COMPANY_BORNE_RATE: SettingDef<number> = {
  key: "tax.company_borne.rate",
  kind: "historized",
  schema: z.coerce.number().min(0).max(1),
  label: "회사 대납 세율",
  hint: "회사가 대신 부담하는 세금의 비율입니다.",
  namespace: "세율",
  default: 0.088,
};

export const TAX_COMPANY_BORNE_METHOD_VALUES = ["flat", "gross_up"] as const;
export type TaxCompanyBorneMethod = (typeof TAX_COMPANY_BORNE_METHOD_VALUES)[number];

export const TAX_COMPANY_BORNE_METHOD: SettingDef<TaxCompanyBorneMethod> = {
  key: "tax.company_borne.method",
  kind: "historized",
  schema: z.enum(TAX_COMPANY_BORNE_METHOD_VALUES),
  label: "회사 대납 계산 방식",
  hint: "단순 비율(flat) 또는 gross-up 중 하나를 고릅니다.",
  namespace: "세율",
  default: "flat",
};

// 규칙 종류별 적용 기준일(Eng OV-5) — 이 설정은 "어느 날짜 필드를 기준으로
// 삼는지"만 담고, 미지급 시 지급 예정일로 넘어가는 등의 대체 규칙은 Phase 4의
// 금액 모듈이 구현한다(경계: 03-RESEARCH.md §5).
export const TAX_BASIS_DATE_VALUES = ["payment_date", "evidence_date", "issue_date", "document_date"] as const;
export type TaxBasisDate = (typeof TAX_BASIS_DATE_VALUES)[number];

export const TAX_BASIS_DATE_WITHHOLDING: SettingDef<TaxBasisDate> = {
  key: "tax.basis_date.withholding",
  kind: "simple",
  schema: z.enum(TAX_BASIS_DATE_VALUES),
  label: "원천징수 적용 기준일",
  hint: "지급일(미지급이면 지급 예정일)을 기준으로 세율을 조회합니다.",
  namespace: "세율",
  default: "payment_date",
};

export const TAX_BASIS_DATE_VAT: SettingDef<TaxBasisDate> = {
  key: "tax.basis_date.vat",
  kind: "simple",
  schema: z.enum(TAX_BASIS_DATE_VALUES),
  label: "부가세 적용 기준일",
  hint: "증빙일(없으면 작성일)을 기준으로 세율을 조회합니다.",
  namespace: "세율",
  default: "evidence_date",
};

export const TAX_ROUNDING_VAT_UNIT: SettingDef<number> = {
  key: "tax.rounding.vat_unit",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "부가세 절사 단위(원)",
  hint: "이 단위 미만은 절사합니다.",
  namespace: "절사",
  default: 1,
};

export const TAX_ROUNDING_WITHHOLDING_UNIT: SettingDef<number> = {
  key: "tax.rounding.withholding_unit",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "원천징수 절사 단위(원)",
  hint: "이 단위 미만은 절사합니다.",
  namespace: "절사",
  default: 10,
};

export const TAX_ROUNDING_MIN_WITHHOLDING: SettingDef<number> = {
  key: "tax.rounding.min_withholding",
  kind: "simple",
  schema: z.coerce.number().int().min(0),
  label: "최소 징수액(원)",
  hint: "이 금액 미만이면 원천징수하지 않습니다.",
  namespace: "절사",
  default: 0,
};

// 04-02 Task 1 ③(D-71) — 통화별 최근 환율. 실제 환율은 견적 줄·매출 각
// 행에 저장되므로 이 키는 새 외화 줄의 환율 칸 기본값일 뿐이다(정본이
// 아니다). KRW는 키를 만들지 않는다 — 환율 1로 고정(domain/money/currency.ts).
export const FX_RECENT_RATE_USD: SettingDef<number> = {
  key: "fx.recent_rate.USD",
  kind: "simple",
  schema: z.coerce.number().positive(),
  label: "USD 최근 환율",
  hint: "새 외화 줄의 환율 칸 기본값입니다 — 환율을 적은 저장마다 갱신됩니다.",
  namespace: "환율",
  numberKind: "fxRate",
  default: 1300,
};

// 04-26(D-86 · S4) — 한 차수에 둘 수 있는 견적 줄 수. 보관된 줄은 빼고 조정·견적 외 비용·취소 줄은 센다.
// 서버 게이트 quote.line-cap과 견적 표(「줄 추가」·키·붙여넣기)가 같은 값을 쓴다 — 상한은 줄을 더할 때만 막는다.
export const QUOTE_LINE_MAX_PER_REVISION: SettingDef<number> = {
  key: "quote_line.max_per_revision",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "차수당 견적 줄 상한",
  hint: "한 차수에 둘 수 있는 견적 줄 수를 정합니다(조정·취소 줄 포함).",
  namespace: "견적 표",
  default: 300,
};

// 완료 처리 강행 허용 — 점검 항목별 boolean 셋(03-CONTEXT.md Claude's
// Discretion: on/off 하나가 아니라 점검 항목별로 넉넉하게).
export const PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES: SettingDef<boolean> = {
  key: "project.force_complete.allow_open_expenses",
  kind: "simple",
  schema: z.boolean(),
  label: "미결 지출결의가 있어도 완료 처리 허용",
  hint: "켜면 미결 지출결의가 있어도 프로젝트를 완료 처리할 수 있습니다.",
  namespace: "완료 처리 강행",
  default: false,
  readBy: { phase: "6" },
};

export const PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES: SettingDef<boolean> = {
  key: "project.force_complete.allow_unmatched_estimate_lines",
  kind: "simple",
  schema: z.boolean(),
  label: "미매칭 견적 줄이 있어도 완료 처리 허용",
  hint: "켜면 지출결의에 매칭되지 않은 견적 줄이 있어도 완료 처리할 수 있습니다.",
  namespace: "완료 처리 강행",
  default: false,
  readBy: { phase: "6" },
};

export const PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE: SettingDef<boolean> = {
  key: "project.force_complete.allow_missing_revenue",
  kind: "simple",
  schema: z.boolean(),
  label: "매출 미입력이어도 완료 처리 허용",
  hint: "켜면 매출이 입력되지 않아도 프로젝트를 완료 처리할 수 있습니다.",
  namespace: "완료 처리 강행",
  default: false,
  readBy: { phase: "6" },
};

// 04-14(D-43 · ROADMAP 기준 3) — 고객 승인 게이트(`quote.customer-approval`). 끄면 현재 차수가 미승인이어도
// 지출결의를 올린다. Phase 5 지출결의가 읽는다.
export const PROJECT_CUSTOMER_APPROVAL_GATE: SettingDef<boolean> = {
  key: "project.customer_approval_gate",
  kind: "simple",
  schema: z.boolean(),
  label: "고객 승인 게이트",
  hint: "끄면 고객 승인 전 차수에서도 지출결의를 올릴 수 있습니다.",
  namespace: "프로젝트",
  default: true,
  readBy: { phase: "5" },
};

// 04-05(ADMN-09) — 프로젝트 문서 번호 서식. 문서 종류별 키 묶음(Claude
// 재량 항목, `domain/document-numbering/index.ts` 머리 주석에 근거 셋
// 기록) — 접두어·연도 자릿수·순번 자릿수·구분자·순번 시작값 다섯 다
// 단순값이다(서식을 바꿔도 이미 매긴 번호는 그대로라 과거 시점 조회가
// 필요 없다). 기본값은 `docs/inputs/phase-04-project-quote.md` §5가
// 확정한 프로젝트 서식(`26001` — 접두어 없음·연도 뒤 2자리·순번 3자리·
// 구분자 없음·순번 1부터)과 정확히 같다. 지출결의·연차·카드·구매 요청
// 서식 키는 그 문서가 생기는 페이즈가 `document_number.<종류>.*` 같은
// 형태로 이 파일에 더한다.
export const DOCUMENT_NUMBER_PROJECT_PREFIX: SettingDef<string> = {
  key: "document_number.project.prefix",
  kind: "simple",
  schema: z.string(),
  label: "프로젝트 번호 접두어",
  hint: "번호 맨 앞에 붙는 문자열입니다(기본값은 없음).",
  namespace: "문서 번호",
  default: "",
};

export const DOCUMENT_NUMBER_PROJECT_YEAR_DIGITS: SettingDef<number> = {
  key: "document_number.project.year_digits",
  kind: "simple",
  schema: z.coerce.number().int().min(1).max(4),
  label: "프로젝트 번호 연도 자릿수",
  hint: "연도를 뒤에서부터 이 자릿수만큼 씁니다(기본 2 → 26).",
  namespace: "문서 번호",
  default: 2,
};

export const DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS: SettingDef<number> = {
  key: "document_number.project.seq_digits",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "프로젝트 번호 순번 자릿수",
  hint: "순번을 이 자릿수만큼 0으로 채웁니다(넘치면 자릿수가 늘어나고 잘리지 않습니다).",
  namespace: "문서 번호",
  default: 3,
};

// 기본값이 빈 문자열이다 — 확정된 프로젝트 서식(`26001`)이 연도와 순번
// 사이에 구분자를 두지 않는다. z.string()은 값 자체(빈 문자열 포함)를
// 허용하고, 키가 아예 비어 값이 없는 상태(undefined)만 막는다 — 빈
// 문자열을 거부하면 이 기본 서식 자체가 저장 불가능해진다.
export const DOCUMENT_NUMBER_PROJECT_SEPARATOR: SettingDef<string> = {
  key: "document_number.project.separator",
  kind: "simple",
  schema: z.string(),
  label: "프로젝트 번호 구분자",
  hint: "연도와 순번 사이에 넣을 문자입니다(기본값은 없음).",
  namespace: "문서 번호",
  default: "",
};

export const DOCUMENT_NUMBER_PROJECT_SEQ_START: SettingDef<number> = {
  key: "document_number.project.seq_start",
  kind: "simple",
  schema: z.coerce.number().int().min(0),
  label: "프로젝트 번호 순번 시작값",
  hint: "연도가 바뀌어 순번이 다시 시작할 때의 첫 값입니다(기본 1).",
  namespace: "문서 번호",
  default: 1,
};

export const PNL_START_GATE_WEEKS_AFTER_CUTOVER: SettingDef<number> = {
  key: "pnl.start_gate.weeks_after_cutover",
  kind: "simple",
  schema: z.coerce.number().int().min(0),
  label: "손익 착수 대기 주수",
  hint: "전환 후 이 주(week)만큼 지나야 프로젝트 손익 계산을 시작합니다.",
  namespace: "손익",
  default: 2,
  readBy: { phase: "9" },
};

// 등록 키 전부를 순회할 수 있게 하나의 배열로 모은다 — 설정 화면·내보내기·
// 미사용 키 검출이 이 배열 하나만 본다. 값 타입이 키마다 달라 SettingDef<T>의
// 제네릭 T를 소거한다(unknown으로 widen) — 런타임 동작은 각 키의
// def.schema/def.kind가 결정하므로 여기서 타입 정보를 잃어도 안전하다.
export const SETTING_DEFS: SettingDef<unknown>[] = [
  AUTH_LOCKOUT_THRESHOLD,
  AUTH_LOCKOUT_WINDOW_MINUTES,
  ACTION_LOG_OPTIONAL_TYPES,
  TAX_VAT_RATE,
  TAX_WITHHOLDING_OTHER_INCOME_RATE,
  TAX_WITHHOLDING_BUSINESS_INCOME_RATE,
  TAX_WITHHOLDING_OTHER_INCOME_EXEMPT_THRESHOLD,
  TAX_COMPANY_BORNE_RATE,
  TAX_COMPANY_BORNE_METHOD,
  TAX_BASIS_DATE_WITHHOLDING,
  TAX_BASIS_DATE_VAT,
  TAX_ROUNDING_VAT_UNIT,
  TAX_ROUNDING_WITHHOLDING_UNIT,
  TAX_ROUNDING_MIN_WITHHOLDING,
  FX_RECENT_RATE_USD,
  QUOTE_LINE_MAX_PER_REVISION,
  DOCUMENT_NUMBER_PROJECT_PREFIX,
  DOCUMENT_NUMBER_PROJECT_YEAR_DIGITS,
  DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS,
  DOCUMENT_NUMBER_PROJECT_SEPARATOR,
  DOCUMENT_NUMBER_PROJECT_SEQ_START,
  PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES,
  PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES,
  PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE,
  PROJECT_CUSTOMER_APPROVAL_GATE,
  PNL_START_GATE_WEEKS_AFTER_CUTOVER,
];


// ── 04.1 연차 결재선(ADMN-04 결재 부분) · 연차 문서 번호 ─────────────────
// 결재선은 JSON 한 개가 아니라 필드 단위 키 17개다(자기 승인 1 + 4단 × 사용 ·
// 담당 계급 · 조직 범위 · 특정 부서). 기본값: 1단 팀장 × 기안자 팀 · 2단 본부
// 책임자 × 기안자 본부 · 3단 계급 무관 × 특정 부서(경영관리본부 — 시드가
// 채운다, 기본값 없음) · 4단 대표 × 전사, 넷 다 사용, 자기 승인 = 건너뜀.
// 제출은 이 17키를 SELECT 한 문장으로 읽는다(domain/leave — getSimpleSettingValues).
// 04.1-04는 이 파일을 고치지 않으므로 라벨 · 힌트 · 선택지 라벨은 여기가 최종형이다.
export const APPROVAL_SELF_APPROVAL_VALUES = ["skip", "self_approve"] as const;
export type ApprovalSelfApprovalValue = (typeof APPROVAL_SELF_APPROVAL_VALUES)[number];
export const APPROVAL_ROUTE_SCOPE_VALUES = ["drafter_team", "drafter_org_unit", "company", "org_unit"] as const;
export type ApprovalRouteScopeValue = (typeof APPROVAL_ROUTE_SCOPE_VALUES)[number];

// "" = 특정 부서 없음(그 단계는 빈 자리). 그 밖은 uuid만 — 비uuid가 저장되면
// 제출의 scope_target_id(uuid) INSERT가 22P02로 실패한다(B-NEW02).
const ROUTE_ORG_UNIT_ID_SCHEMA = z.union([z.literal(""), z.string().uuid()]);
const ROUTE_NAMESPACE = "연차 결재선";

export const APPROVAL_ROUTE_LEAVE_SELF_APPROVAL: SettingDef<ApprovalSelfApprovalValue> = {
  key: "approval_route.leave.self_approval",
  kind: "simple",
  schema: z.enum(APPROVAL_SELF_APPROVAL_VALUES),
  label: "자기 승인",
  hint: "기안자가 그 단계 담당일 때",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { skip: "건너뜀", self_approve: "본인 승인" },
  default: "skip",
};

export const APPROVAL_ROUTE_LEAVE_STEP1_ENABLED: SettingDef<boolean> = {
  key: "approval_route.leave.step1.enabled",
  kind: "simple",
  schema: z.boolean(),
  label: "1단 사용",
  hint: "새 문서부터 적용 · 진행 중 문서는 그대로",
  namespace: ROUTE_NAMESPACE,
  default: true,
};

export const APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID: SettingDef<string> = {
  key: "approval_route.leave.step1.role_id",
  kind: "simple",
  schema: z.string(),
  label: "1단 담당 계급",
  hint: "계급 무관 = 그 범위의 누구나",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { "": "계급 무관" },
  dynamicOptions: "roles",
  default: "role-team-lead",
};

export const APPROVAL_ROUTE_LEAVE_STEP1_SCOPE: SettingDef<ApprovalRouteScopeValue> = {
  key: "approval_route.leave.step1.scope",
  kind: "simple",
  schema: z.enum(APPROVAL_ROUTE_SCOPE_VALUES),
  label: "1단 조직 범위",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { drafter_team: "기안자 팀", drafter_org_unit: "기안자 본부", company: "전사", org_unit: "특정 부서" },
  default: "drafter_team",
};

export const APPROVAL_ROUTE_LEAVE_STEP1_ORG_UNIT_ID: SettingDef<string> = {
  key: "approval_route.leave.step1.org_unit_id",
  kind: "simple",
  schema: ROUTE_ORG_UNIT_ID_SCHEMA,
  label: "1단 특정 부서",
  namespace: ROUTE_NAMESPACE,
  dynamicOptions: "org_units",
  default: "",
};

export const APPROVAL_ROUTE_LEAVE_STEP2_ENABLED: SettingDef<boolean> = {
  key: "approval_route.leave.step2.enabled",
  kind: "simple",
  schema: z.boolean(),
  label: "2단 사용",
  hint: "새 문서부터 적용 · 진행 중 문서는 그대로",
  namespace: ROUTE_NAMESPACE,
  default: true,
};

export const APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID: SettingDef<string> = {
  key: "approval_route.leave.step2.role_id",
  kind: "simple",
  schema: z.string(),
  label: "2단 담당 계급",
  hint: "계급 무관 = 그 범위의 누구나",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { "": "계급 무관" },
  dynamicOptions: "roles",
  default: "role-division-head",
};

export const APPROVAL_ROUTE_LEAVE_STEP2_SCOPE: SettingDef<ApprovalRouteScopeValue> = {
  key: "approval_route.leave.step2.scope",
  kind: "simple",
  schema: z.enum(APPROVAL_ROUTE_SCOPE_VALUES),
  label: "2단 조직 범위",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { drafter_team: "기안자 팀", drafter_org_unit: "기안자 본부", company: "전사", org_unit: "특정 부서" },
  default: "drafter_org_unit",
};

export const APPROVAL_ROUTE_LEAVE_STEP2_ORG_UNIT_ID: SettingDef<string> = {
  key: "approval_route.leave.step2.org_unit_id",
  kind: "simple",
  schema: ROUTE_ORG_UNIT_ID_SCHEMA,
  label: "2단 특정 부서",
  namespace: ROUTE_NAMESPACE,
  dynamicOptions: "org_units",
  default: "",
};

export const APPROVAL_ROUTE_LEAVE_STEP3_ENABLED: SettingDef<boolean> = {
  key: "approval_route.leave.step3.enabled",
  kind: "simple",
  schema: z.boolean(),
  label: "3단 사용",
  hint: "새 문서부터 적용 · 진행 중 문서는 그대로",
  namespace: ROUTE_NAMESPACE,
  default: true,
};

export const APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID: SettingDef<string> = {
  key: "approval_route.leave.step3.role_id",
  kind: "simple",
  schema: z.string(),
  label: "3단 담당 계급",
  hint: "계급 무관 = 그 범위의 누구나",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { "": "계급 무관" },
  dynamicOptions: "roles",
  default: "",
};

export const APPROVAL_ROUTE_LEAVE_STEP3_SCOPE: SettingDef<ApprovalRouteScopeValue> = {
  key: "approval_route.leave.step3.scope",
  kind: "simple",
  schema: z.enum(APPROVAL_ROUTE_SCOPE_VALUES),
  label: "3단 조직 범위",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { drafter_team: "기안자 팀", drafter_org_unit: "기안자 본부", company: "전사", org_unit: "특정 부서" },
  default: "org_unit",
};

export const APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID: SettingDef<string> = {
  key: "approval_route.leave.step3.org_unit_id",
  kind: "simple",
  schema: ROUTE_ORG_UNIT_ID_SCHEMA,
  label: "3단 특정 부서",
  namespace: ROUTE_NAMESPACE,
  dynamicOptions: "org_units",
};

export const APPROVAL_ROUTE_LEAVE_STEP4_ENABLED: SettingDef<boolean> = {
  key: "approval_route.leave.step4.enabled",
  kind: "simple",
  schema: z.boolean(),
  label: "4단 사용",
  hint: "새 문서부터 적용 · 진행 중 문서는 그대로",
  namespace: ROUTE_NAMESPACE,
  default: true,
};

export const APPROVAL_ROUTE_LEAVE_STEP4_ROLE_ID: SettingDef<string> = {
  key: "approval_route.leave.step4.role_id",
  kind: "simple",
  schema: z.string(),
  label: "4단 담당 계급",
  hint: "계급 무관 = 그 범위의 누구나",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { "": "계급 무관" },
  dynamicOptions: "roles",
  default: "role-ceo",
};

export const APPROVAL_ROUTE_LEAVE_STEP4_SCOPE: SettingDef<ApprovalRouteScopeValue> = {
  key: "approval_route.leave.step4.scope",
  kind: "simple",
  schema: z.enum(APPROVAL_ROUTE_SCOPE_VALUES),
  label: "4단 조직 범위",
  namespace: ROUTE_NAMESPACE,
  optionLabels: { drafter_team: "기안자 팀", drafter_org_unit: "기안자 본부", company: "전사", org_unit: "특정 부서" },
  default: "company",
};

export const APPROVAL_ROUTE_LEAVE_STEP4_ORG_UNIT_ID: SettingDef<string> = {
  key: "approval_route.leave.step4.org_unit_id",
  kind: "simple",
  schema: ROUTE_ORG_UNIT_ID_SCHEMA,
  label: "4단 특정 부서",
  namespace: ROUTE_NAMESPACE,
  dynamicOptions: "org_units",
  default: "",
};

// 연차 문서 번호(계획 가정 1 — UI-SPEC Assumptions #16): 기본 `LV26-0001`.
export const DOCUMENT_NUMBER_LEAVE_PREFIX: SettingDef<string> = {
  key: "document_number.leave.prefix",
  kind: "simple",
  schema: z.string(),
  label: "연차 번호 접두어",
  hint: "번호 맨 앞에 붙는 문자열입니다(기본 LV).",
  namespace: "문서 번호",
  default: "LV",
};

export const DOCUMENT_NUMBER_LEAVE_YEAR_DIGITS: SettingDef<number> = {
  key: "document_number.leave.year_digits",
  kind: "simple",
  schema: z.coerce.number().int().min(1).max(4),
  label: "연차 번호 연도 자릿수",
  hint: "연도를 뒤에서부터 이 자릿수만큼 씁니다(기본 2 → 26).",
  namespace: "문서 번호",
  default: 2,
};

export const DOCUMENT_NUMBER_LEAVE_SEQ_DIGITS: SettingDef<number> = {
  key: "document_number.leave.seq_digits",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "연차 번호 순번 자릿수",
  hint: "순번을 이 자릿수만큼 0으로 채웁니다(넘치면 자릿수가 늘어나고 잘리지 않습니다).",
  namespace: "문서 번호",
  default: 4,
};

export const DOCUMENT_NUMBER_LEAVE_SEPARATOR: SettingDef<string> = {
  key: "document_number.leave.separator",
  kind: "simple",
  schema: z.string(),
  label: "연차 번호 구분자",
  hint: "연도와 순번 사이에 넣을 문자입니다(기본 -).",
  namespace: "문서 번호",
  default: "-",
};

export const DOCUMENT_NUMBER_LEAVE_SEQ_START: SettingDef<number> = {
  key: "document_number.leave.seq_start",
  kind: "simple",
  schema: z.coerce.number().int().min(0),
  label: "연차 번호 순번 시작값",
  hint: "연도가 바뀌어 순번이 다시 시작할 때의 첫 값입니다(기본 1).",
  namespace: "문서 번호",
  default: 1,
};

// SETTING_DEFS 선언 뒤에 덧붙이는 등록(파일 끝 덧붙이기 — 병합 충돌을 줄인다).
SETTING_DEFS.push(
  APPROVAL_ROUTE_LEAVE_SELF_APPROVAL,
  APPROVAL_ROUTE_LEAVE_STEP1_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP1_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP1_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP2_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP4_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP4_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP4_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP4_ORG_UNIT_ID,
  DOCUMENT_NUMBER_LEAVE_PREFIX,
  DOCUMENT_NUMBER_LEAVE_YEAR_DIGITS,
  DOCUMENT_NUMBER_LEAVE_SEQ_DIGITS,
  DOCUMENT_NUMBER_LEAVE_SEPARATOR,
  DOCUMENT_NUMBER_LEAVE_SEQ_START,
);

// 04.1-03(LEAV-01 · 입력 §5): 회계연도(1월 시작) 연차 일수 — 이력형이라 값을 바꿔도 지난
// 연도 잔고가 소급해 바뀌지 않는다(잔고는 각 회계연도 1월 1일 시점 값을 읽는다). 적용 시작일
// 1월 1일 강제와 지난 연도 거부는 04.1-04 레지스트리 검증이 한다.
export const LEAVE_ANNUAL_DAYS: SettingDef<number> = {
  key: "leave.annual_days",
  kind: "historized",
  schema: z.coerce.number().int().min(0).max(366),
  label: "연차 일수",
  hint: "회계연도(1월 시작)마다 부여 · 이월 없음",
  namespace: "연차",
  default: 15,
  effectiveFromRule: "year_start",
};

SETTING_DEFS.push(LEAVE_ANNUAL_DAYS);
