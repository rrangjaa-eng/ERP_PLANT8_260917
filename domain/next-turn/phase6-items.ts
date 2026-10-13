import type { Viewer } from "@/domain/viewer";
import type { NextTurnEntry } from "@/domain/next-turn";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { sumKrw } from "@/domain/money";
import { listAllPaymentTargets } from "@/domain/payments/targets";
import { formatKrw } from "@/lib/format-number";
import { addDays } from "@/lib/kst-date";

// 06-23(S19 · UA-611 · O-15 · O-1): 「내 차례」 Phase 6 항목 — 05 공급 함수(listNextTurnItems)가 결재 · 막힘 뒤에 이어 붙인다.
// 경영관리 몫은 묶음 한 줄씩(목록이 다음 한 수 — 경영관리 전용 화면 없음), 정렬 · 6줄 절단은 ui buildNextTurnView가 한다.
// 원천마다 권한을 먼저 보고 없으면 부르지 않는다(T-06-111). 이유 칸은 05처럼 비우고 상황은 label에 둔다.

export type PaymentBundleTarget = { scheduledPaymentDate: string | null; evidenceStatus: string; payableKrw: number | null };

const PAYMENT_ACTION = { label: "지급 대상 보기", href: "/expenses?status=지급 대상" };

// 서울 달력 날짜의 그 주 일요일(월~일 주).
function sundayOf(today: string): string {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, (7 - weekday) % 7);
}

// 예정일 지남 · 오늘이 있으면 [오늘], 없고 이번 주(남은 날)에 예정이 있으면 [대기], 둘 다 없으면 줄 없음. 예정일 없는 대상 · 다음 주 이후는 세지 않는다(PN-1).
export function buildPaymentBundle(targets: readonly PaymentBundleTarget[], today: string, amountVisible = true): NextTurnEntry | null {
  const measure = (rows: readonly PaymentBundleTarget[]) => (amountVisible ? formatKrw(sumKrw(rows.map((row) => row.payableKrw ?? 0))) : "");
  const due = targets.filter((target) => target.scheduledPaymentDate !== null && target.scheduledPaymentDate <= today);
  if (due.length > 0) {
    const unconfirmed = due.filter((target) => target.evidenceStatus === "확인 전").length;
    const label = `지급 — 예정일 지남·오늘 ${due.length}건${unconfirmed > 0 ? ` · 확인 전 ${unconfirmed}건` : ""}`;
    return { key: "phase6-payment", tag: "오늘", label, reason: "", measureText: measure(due), action: PAYMENT_ACTION };
  }
  const sunday = sundayOf(today);
  const week = targets.filter((target) => target.scheduledPaymentDate !== null && target.scheduledPaymentDate <= sunday);
  if (week.length === 0) return null;
  return { key: "phase6-payment", tag: "대기", label: `지급 — 이번 주 ${week.length}건`, reason: "", measureText: measure(week), action: PAYMENT_ACTION };
}

export async function listPhase6NextTurnItems(viewer: Viewer, today: string): Promise<NextTurnEntry[]> {
  const entries: NextTurnEntry[] = [];
  if (await can(viewer, "expenses.payments", "write")) {
    // 06-15 지급 대상 정의 그대로 — 쪽 없는 함수 한 번(E-31). 묶음은 필터 전체 행으로 센다.
    const targets = await listAllPaymentTargets(viewer, {}, { today });
    const bundle = buildPaymentBundle(
      targets.map((target) => ({ scheduledPaymentDate: target.row.scheduledPaymentDate, evidenceStatus: target.evidenceStatus, payableKrw: target.payableKrw })),
      today,
      await visible(viewer, "expense.amount"),
    );
    if (bundle) entries.push(bundle);
  }
  return entries;
}
