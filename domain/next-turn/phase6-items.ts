import type { Viewer } from "@/domain/viewer";
import type { NextTurnEntry } from "@/domain/next-turn";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { sumKrw } from "@/domain/money";
import { listAllPaymentTargets } from "@/domain/payments/targets";
import { listPurchaseRequests } from "@/domain/purchase-requests";
import { summarizeOpenIssueRequests, type OpenIssueRequestSummary } from "@/domain/issue-requests";
import { computePreSettleCheck, loadPreSettleInputs } from "@/domain/pre-settle-check";
import { projectRowScope } from "@/domain/projects/visibility";
import { findOldestRequestedPurchaseAt, listSettlingProjectsOfPm } from "@/repositories/next-turn";
import { seoulToday } from "@/lib/dates";
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

// 구매 요청 — 건수 · 합계는 06-14 목록의 서버 합계(필터 전체), 가장 오래된 날짜는 서버 집계의 서울 날짜(E-54).
export function buildPurchaseBundle(input: { count: number; estimateKrw: number | null; oldestRequestedOn: string | null }): NextTurnEntry | null {
  if (input.count === 0 || input.oldestRequestedOn === null) return null;
  return {
    key: "phase6-purchase",
    tag: "대기",
    label: `구매 요청 — 신청 ${input.count}건 · 가장 오래된 ${input.oldestRequestedOn.slice(5)}`,
    reason: "",
    measureText: input.estimateKrw === null ? "" : formatKrw(input.estimateKrw),
    action: { label: "구매 요청 보기", href: "/cards/purchases" },
  };
}

// 매출 발행 요청 — 06-21 요약 하나(프로젝트 목록 링크와 같은 함수). 가장 이른 희망일이 오늘이거나 그 전이면 [오늘]. 공급가 키가 없으면(가림) 빈 글자.
export function buildIssueBundle(summary: OpenIssueRequestSummary | null, today: string): NextTurnEntry | null {
  if (!summary || summary.count === 0 || !summary.earliestDesiredDate) return null;
  return {
    key: "phase6-issue",
    tag: summary.earliestDesiredDate <= today ? "오늘" : "대기",
    label: `매출 발행 요청 — ${summary.count}건 · 희망 ${summary.earliestDesiredDate.slice(5)}`,
    reason: "",
    measureText: summary.supplyKrw === undefined ? "" : formatKrw(summary.supplyKrw),
    action: { label: "발행 요청 보기", href: "/projects/issue-requests" },
  };
}

// PM 완료 전 점검 — 막힘이 1건 이상인 정산 프로젝트마다 한 줄(건수 = 06-19 점검의 막힘 건수, 프로젝트 전체 · 종결 제외).
export function buildPreSettleBlockedItems(rows: readonly { projectId: string; projectName: string; blockedCount: number }[]): NextTurnEntry[] {
  return rows
    .filter((row) => row.blockedCount > 0)
    .map((row) => ({
      key: `phase6-presettle-${row.projectId}`,
      tag: "막힘",
      label: `${row.projectName} — 완료 전 점검 ${row.blockedCount}건`,
      reason: "",
      measureText: "—",
      action: { label: "점검 보기", href: `/projects/${row.projectId}#pre-settle-check` },
    }));
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
  if (await can(viewer, "cards.purchases", "write")) {
    const list = await listPurchaseRequests(viewer, { status: "requested" }, today);
    const oldest = await findOldestRequestedPurchaseAt(viewer);
    const bundle = buildPurchaseBundle({ count: list.totals.count, estimateKrw: list.totals.estimateKrw, oldestRequestedOn: oldest ? seoulToday(oldest) : null });
    if (bundle) entries.push(bundle);
  }
  if (await can(viewer, "projects.revenue", "write")) {
    const bundle = buildIssueBundle(await summarizeOpenIssueRequests(viewer), today);
    if (bundle) entries.push(bundle);
  }
  // E-31: 사전 조회는 정산 프로젝트가 있을 때만 한 번(입력이 프로젝트와 무관 — 06-19), 계산은 프로젝트마다 한 번(풀 — tx 없음).
  const settling = await listSettlingProjectsOfPm(viewer, await projectRowScope(viewer), viewer.id);
  if (settling.length > 0) {
    const inputs = await loadPreSettleInputs(viewer);
    const rows = [];
    for (const project of settling) {
      const check = await computePreSettleCheck(viewer, project.id, inputs);
      rows.push({ projectId: project.id, projectName: project.name, blockedCount: check.blockedCount });
    }
    entries.push(...buildPreSettleBlockedItems(rows));
  }
  return entries;
}
