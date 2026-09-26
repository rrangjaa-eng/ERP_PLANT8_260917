import { z } from "zod";
import { env } from "@/lib/env";
import type { SettingDef } from "@/domain/settings/registry";
import { ALWAYS_ON_ACTION_TYPES, CORE_ACTION_TYPES, type CoreActionType } from "@/domain/action-log/record";
import { normalizeContactPhone } from "@/domain/certs/format";

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

// 04.3-02(규약 C1) — 확인증 기능의 두 번째 게이트(설정). 환경 게이트
// CERT_FEATURE_ALLOWED가 "true"일 때만 SETTING_DEFS에 실린다(아래 참고) —
// 환경 게이트가 꺼져 있으면 이 키는 설정 화면에 줄이 없고
// setSimpleSettingAction이 등록되지 않은 키로 거부한다. 프로덕션 배포는
// Phase 11 전까지 CERT_FEATURE_ALLOWED를 두지 않는다(D-1107).
export const CERT_ENABLED: SettingDef<boolean> = {
  key: "cert.enabled",
  kind: "simple",
  schema: z.boolean(),
  label: "확인증 기능 사용",
  hint: "환경 게이트가 켜져 있을 때만 이 설정으로 확인증 기능을 켤 수 있습니다.",
  namespace: "확인증",
  default: false,
};

// 04.3-02 Task 2 ④ — 규약 C1의 나머지 여덟 키(환경 게이트·cert.enabled는
// Task 1이 이미 등록). 링크 만료 시간·보존 연수·행사별 문의 전화 사본
// 기본값·확인증 번호 서식 다섯. 이 여덟 키는 전부 이 태스크의 코드
// (createEvent·verifyLast4·allocateDocumentNumber)가 읽는다
// (registry-coverage).
export const CERT_LINK_EXPIRE_HOURS: SettingDef<number> = {
  key: "cert.link.expire_hours",
  kind: "simple",
  schema: z.coerce.number().int().min(1).max(720),
  label: "확인증 링크 유효 시간(시간)",
  hint: "행사 링크를 만든 뒤 이 시간(시간)이 지나면 링크가 닫힙니다.",
  namespace: "확인증",
  default: 72,
};

export const CERT_RETENTION_YEARS: SettingDef<number> = {
  key: "cert.retention.years",
  kind: "simple",
  schema: z.coerce.number().int().min(1).max(20),
  label: "확인증 보존 연수",
  hint: "제출된 확인증의 개인정보를 이 연수만큼 보존한 뒤 파기합니다.",
  namespace: "확인증",
  default: 5,
};

// 문의 전화는 당첨자 전화(normalizePhone)와 계약이 다르다 — 지역번호·
// 대표번호도 받는다(normalizeContactPhone). 빈 문자열은 허용하되(비우면
// 새 행사만 못 만든다, UI-SPEC A12) 값이 있으면 형식을 검증해 숫자만
// 저장한다.
export const CERT_CONTACT_PHONE: SettingDef<string> = {
  key: "cert.contact_phone",
  kind: "simple",
  schema: z.string().transform((value, ctx) => {
    if (value === "") return "";
    const normalized = normalizeContactPhone(value);
    if (normalized === null) {
      ctx.addIssue({ code: "custom", message: "전화번호 형식이 아닙니다 · 02-1234-5678처럼 적어 주세요" });
      return z.NEVER;
    }
    return normalized;
  }),
  label: "수령자 문의 전화",
  hint: "확인증 화면에 보일 문의 전화번호입니다(행사를 만들 때 이 값이 그 행사에 복사됩니다).",
  namespace: "확인증",
  default: "",
};

// 04.3-03 Task 1 ① — 전화번호 뒤 4자리 짧은 잠김 두 키(CONTEXT 「이미 확정된
// 입력」 5회 · 3분이 기본값). 누적 잠김 문턱 20은 설정이 아니라
// domain/certs/verify-lock.ts의 고정 상수다(소유자 결정 2026-09-24).
export const CERT_VERIFY_MAX_ATTEMPTS: SettingDef<number> = {
  key: "cert.verify.max_attempts",
  kind: "simple",
  schema: z.coerce.number().int().min(1).max(20),
  label: "확인증 전화번호 틀림 한도(회)",
  hint: "수령자가 전화번호 뒤 4자리를 이 횟수만큼 틀리면 그 자리의 확인이 잠시 잠깁니다.",
  namespace: "확인증",
  default: 5,
};

export const CERT_VERIFY_LOCK_MINUTES: SettingDef<number> = {
  key: "cert.verify.lock_minutes",
  kind: "simple",
  schema: z.coerce.number().int().min(1).max(60),
  label: "확인증 전화번호 잠금 시간(분)",
  hint: "틀림 한도에 닿은 자리는 이 시간(분) 동안 확인할 수 없습니다.",
  namespace: "확인증",
  default: 3,
};

export const DOCUMENT_NUMBER_CERT_PREFIX: SettingDef<string> = {
  key: "document_number.cert.prefix",
  kind: "simple",
  schema: z.string(),
  label: "확인증 번호 접두어",
  hint: "번호 맨 앞에 붙는 문자열입니다(기본 CERT-).",
  namespace: "문서 번호",
  default: "CERT-",
};

export const DOCUMENT_NUMBER_CERT_YEAR_DIGITS: SettingDef<number> = {
  key: "document_number.cert.year_digits",
  kind: "simple",
  schema: z.coerce.number().int().min(1).max(4),
  label: "확인증 번호 연도 자릿수",
  hint: "연도를 뒤에서부터 이 자릿수만큼 씁니다(기본 4 → 2026).",
  namespace: "문서 번호",
  default: 4,
};

export const DOCUMENT_NUMBER_CERT_SEQ_DIGITS: SettingDef<number> = {
  key: "document_number.cert.seq_digits",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "확인증 번호 순번 자릿수",
  hint: "순번을 이 자릿수만큼 0으로 채웁니다(넘치면 자릿수가 늘어나고 잘리지 않습니다).",
  namespace: "문서 번호",
  default: 4,
};

export const DOCUMENT_NUMBER_CERT_SEPARATOR: SettingDef<string> = {
  key: "document_number.cert.separator",
  kind: "simple",
  schema: z.string(),
  label: "확인증 번호 구분자",
  hint: "연도와 순번 사이에 넣을 문자입니다(기본 -).",
  namespace: "문서 번호",
  default: "-",
};

export const DOCUMENT_NUMBER_CERT_SEQ_START: SettingDef<number> = {
  key: "document_number.cert.seq_start",
  kind: "simple",
  schema: z.coerce.number().int().min(0),
  label: "확인증 번호 순번 시작값",
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
  ...(env.CERT_FEATURE_ALLOWED === "true" ? [CERT_ENABLED] : []),
  CERT_LINK_EXPIRE_HOURS,
  CERT_RETENTION_YEARS,
  CERT_CONTACT_PHONE,
  CERT_VERIFY_MAX_ATTEMPTS,
  CERT_VERIFY_LOCK_MINUTES,
  DOCUMENT_NUMBER_CERT_PREFIX,
  DOCUMENT_NUMBER_CERT_YEAR_DIGITS,
  DOCUMENT_NUMBER_CERT_SEQ_DIGITS,
  DOCUMENT_NUMBER_CERT_SEPARATOR,
  DOCUMENT_NUMBER_CERT_SEQ_START,
];
