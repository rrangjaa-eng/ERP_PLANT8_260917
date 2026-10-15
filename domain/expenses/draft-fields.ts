import { z } from "zod";
import { CURRENCIES } from "@/domain/money/currency";
import { isCalendarDate } from "@/lib/dates";

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
    scheduledPaymentDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR).nullable(),
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
