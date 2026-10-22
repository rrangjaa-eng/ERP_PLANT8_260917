import { z } from "zod";
import { CURRENCIES } from "@/domain/money/currency";
import { isCalendarDate } from "@/lib/dates";
import { REQUESTED_DATE_MISSING, REQUESTED_DATE_PASSED, REQUESTED_DATE_PAST, REQUESTED_REASON_REQUIRED } from "@/domain/expenses/gate";

// 05 /review A12: 지출결의 칸 입력 스키마 하나 — 액션 입력 검증(칸 오류 문구)과 도메인 판정이 같은 스키마를 쓴다. 입력에 세액 · 지급 총액 ·
// 원화 칸은 없다(사람이 적는 금액은 공급가액 하나, 원화 환산 · 세금은 서버). 팀 id 칸도 없다(귀속 팀은 서버가 사용일 소속으로만 정한다).

// 05-07 팀 비용 종류(DB 체크 expenses_team_expense_kind_check와 같은 값).
export const TEAM_EXPENSE_KINDS = ["lost_bid", "team_overhead"] as const;
export type TeamExpenseKind = (typeof TEAM_EXPENSE_KINDS)[number];

// 비고 · 내용 상한(폼 긴 칸 maxLength와 같은 값).
export const EXPENSE_TEXT_MAX = 480;
export const DATE_FORMAT_ERROR = "날짜 형식 오류 · 2026-09-19처럼";
// 06.5 V15(카드 ①): 받는 인원 칸 오류는 한 문구 — 0 · 음수 · 소수 · 비움 · DB int4 상한 넘음이 모두 같은 글자다(UI-SPEC V15 「한 문구만」).
export const RECIPIENT_COUNT_INVALID = "받는 인원 1 미만 · 1 이상 적기";

export const expenseDraftFieldsSchema = z
  .object({
    vendorId: z.string().uuid().nullable(),
    // 06.5 D-6517: 직원 지급처(users.id는 text). 거래처 칸과 둘 중 하나 — 정리는 도메인이 한다(refine을 걸면 `.pick()`이 깨진다).
    payeeUserId: z.string().min(1).nullable(),
    evidenceType: z.string().min(1).max(100).nullable(),
    paymentMethod: z.string().min(1).max(100).nullable(),
    supply: z.object({ currency: z.enum(CURRENCIES), amount: z.number().min(0), fxRate: z.number() }).strict().nullable(),
    // 07-16(D-714): 작성자는 지급 예정일을 적지 않는다(지급 권한자 길 07-06 saveScheduledPayDate뿐) — 희망 지급일 · 희망 사유 한 쌍만.
    // 쌍 · 과거 판정은 refine이 아니라 requestedPaymentErrors(아래 — `.pick()`이 깨지지 않게). 사유는 앞뒤 공백을 뗀다(DB CHECK는 NULL 짝만 본다).
    requestedPaymentDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR).nullable(),
    requestedPaymentReason: z.string().trim().max(EXPENSE_TEXT_MAX, `희망 사유 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`).nullable(),
    note: z.string().max(EXPENSE_TEXT_MAX, `비고 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`).nullable(),
    installment: z.boolean(),
    teamExpenseKind: z.enum(TEAM_EXPENSE_KINDS).nullable(),
    usageDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR),
    content: z.string().max(EXPENSE_TEXT_MAX, `내용 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`).nullable(),
    // 06-10(EXP-13 · C6 기안자 몫): 선결제 표시 · 사유 · 증빙일. 칸은 이 스키마 한 곳에만 더한다(E-19). 증빙 금액 칸은 06.5 D-6520으로 걷었다.
    prepaid: z.boolean(),
    prepaidReason: z.string().max(EXPENSE_TEXT_MAX, `선결제 사유 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`).nullable(),
    // 증빙일은 05 날짜 검증(E-20 — 미래 허용).
    evidenceDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR).nullable(),
    // 06.5 카드 ①: 회사 대납 면제의 받는 인원(expenses.recipient_count · 체크 >= 1 · int4).
    recipientCount: z
      .number({ error: RECIPIENT_COUNT_INVALID })
      .int(RECIPIENT_COUNT_INVALID)
      .min(1, RECIPIENT_COUNT_INVALID)
      .max(2147483647, RECIPIENT_COUNT_INVALID),
  })
  .strict()
  .partial();

export type RequestedPaymentErrors = Partial<Record<"requestedPaymentDate" | "requestedPaymentReason", string>>;

// 저장은 저장된 희망일(stored — 새 문서는 null)과 다른 값만 과거를 본다. 제출은 지난 희망일을 `희망일 지남`으로 막는다.
export type RequestedPaymentCheck = { on: "save"; stored: string | null } | { on: "submit" };

// 07-16(SC-02 · AQ-10): 희망 지급일 · 사유 판정 — 둘 다 있거나 둘 다 없어야 하고(빈 사유 = 없음), 희망일은 오늘(넘긴 KST 날짜) 이후. 영업일은 따지지 않는다.
// 저장 경로(임시 저장 · 줄에서 만들기 · 팀 비용 첫 저장 · 제출)가 합친 값으로 부른다.
// 사용자 결정 2026-10-23(AQ-10 완화): 희망일이 지난 문서도 다른 칸은 저장 — 날짜를 바꿀 때만 검사.
export function requestedPaymentErrors(
  fields: { requestedPaymentDate?: string | null; requestedPaymentReason?: string | null },
  todayKst: string,
  check: RequestedPaymentCheck = { on: "save", stored: null },
): RequestedPaymentErrors {
  const date = fields.requestedPaymentDate ?? null;
  const reason = fields.requestedPaymentReason?.trim() ? fields.requestedPaymentReason : null;
  if (date === null) return reason === null ? {} : { requestedPaymentDate: REQUESTED_DATE_MISSING };
  if (date < todayKst) {
    if (check.on === "submit") return { requestedPaymentDate: REQUESTED_DATE_PASSED };
    if (date !== check.stored) return { requestedPaymentDate: REQUESTED_DATE_PAST };
  }
  return reason === null ? { requestedPaymentReason: REQUESTED_REASON_REQUIRED } : {};
}
