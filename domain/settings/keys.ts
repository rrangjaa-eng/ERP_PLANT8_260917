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
  default: 1300,
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
  PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES,
  PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES,
  PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE,
  PNL_START_GATE_WEEKS_AFTER_CUTOVER,
];
