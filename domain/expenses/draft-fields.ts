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

export const expenseDraftFieldsSchema = z
  .object({
    vendorId: z.string().uuid().nullable(),
    evidenceType: z.string().min(1).max(100).nullable(),
    paymentMethod: z.string().min(1).max(100).nullable(),
    supply: z.object({ currency: z.enum(CURRENCIES), amount: z.number().min(0), fxRate: z.number() }).strict().nullable(),
    scheduledPaymentDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR).nullable(),
    note: z.string().max(EXPENSE_TEXT_MAX, `비고 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`).nullable(),
    installment: z.boolean(),
    teamExpenseKind: z.enum(TEAM_EXPENSE_KINDS).nullable(),
    usageDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR),
    content: z.string().max(EXPENSE_TEXT_MAX, `내용 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`).nullable(),
    // 06-10(EXP-13 · C6 기안자 몫): 선결제 표시 · 사유, 증빙 금액(공급가 자리) · 증빙일. 칸은 이 스키마 한 곳에만 더한다(E-19).
    prepaid: z.boolean(),
    prepaidReason: z.string().max(EXPENSE_TEXT_MAX, `선결제 사유 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`).nullable(),
    evidenceAmountKrw: z.number().nullable(),
    evidenceDate: z.string().nullable(),
  })
  .strict()
  .partial();
