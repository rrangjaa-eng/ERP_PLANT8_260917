import type { Viewer } from "@/domain/viewer";
import type { NextTurnEntry } from "@/domain/next-turn";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { sumKrw } from "@/domain/money";
import { listAllPaymentTargets } from "@/domain/payments/targets";
import { payWeekIndex } from "@/domain/payments/pay-schedule";
import { summarizeOpenIssueRequests, type OpenIssueRequestSummary } from "@/domain/issue-requests";
import { computePreSettleCheck, loadPreSettleInputs } from "@/domain/pre-settle-check";
import { projectRowScope } from "@/domain/projects/visibility";
import { findCardSlipWaiting, findOldestRequestedPurchaseAt, listSettlingProjectsOfPm } from "@/repositories/next-turn";
import { listPurchaseRequestEstimates } from "@/repositories/purchase-requests";
import { seoulToday } from "@/lib/dates";
import { formatKrw } from "@/lib/format-number";

// 06-23(S19 · UA-611 · O-15 · O-1): 「내 차례」 Phase 6 항목 — 05 공급 함수(listNextTurnItems)가 결재 · 막힘 뒤에 이어 붙인다.
// 경영관리 몫은 묶음 한 줄씩(목록이 다음 한 수 — 경영관리 전용 화면 없음), 정렬 · 6줄 절단은 ui buildNextTurnView가 한다.
// 원천마다 권한을 먼저 보고 없으면 부르지 않는다(T-06-111). 07.1 W4(PA2): 묶음 줄은 label을 `{항목} {n}건`으로 짧게 두고 상황은 이유 칸에 둔다(폰에서 3줄이 되지 않게).

export type PaymentBundleTarget = { scheduledPaymentDate: string | null; evidenceStatus: string; payableKrw: number | null };

const PAYMENT_ACTION = { label: "지급 대상 보기", href: "/expenses?status=지급 대상" };

// 예정일 지남 · 오늘이 있으면 [오늘], 없고 이번 주(남은 날)에 예정이 있으면 [대기], 둘 다 없으면 줄 없음. 예정일 없는 대상 · 다음 주 이후는 세지 않는다(PN-1).
export function buildPaymentBundle(targets: readonly PaymentBundleTarget[], today: string, amountVisible = true): NextTurnEntry | null {
  const measure = (rows: readonly PaymentBundleTarget[]) => (amountVisible ? formatKrw(sumKrw(rows.map((row) => row.payableKrw ?? 0))) : "");
  const due = targets.filter((target) => target.scheduledPaymentDate !== null && target.scheduledPaymentDate <= today);
  if (due.length > 0) {
    const unconfirmed = due.filter((target) => target.evidenceStatus === "확인 전").length;
    const reason = `예정일 지남·오늘${unconfirmed > 0 ? ` · 확인 전 ${unconfirmed}건` : ""}`;
    return { key: "phase6-payment", tag: "오늘", label: `지급 ${due.length}건`, reason, measureText: measure(due), action: PAYMENT_ACTION };
  }
  // 이번 주(월~일) = 지급 주 셈 한 곳(D-715 payWeekIndex).
  const week = targets.filter((target) => target.scheduledPaymentDate !== null && payWeekIndex(target.scheduledPaymentDate, today) <= 0);
  if (week.length === 0) return null;
  return { key: "phase6-payment", tag: "대기", label: `지급 ${week.length}건`, reason: "이번 주", measureText: measure(week), action: PAYMENT_ACTION };
}

// 구매 요청 — 건수 · 합계는 06-14 목록 합계가 쓰는 견적 질의(필터 전체), 가장 오래된 날짜는 서버 집계의 서울 날짜(E-54).
export function buildPurchaseBundle(input: { count: number; estimateKrw: number | null; oldestRequestedOn: string | null }): NextTurnEntry | null {
  if (input.count === 0 || input.oldestRequestedOn === null) return null;
  return {
    key: "phase6-purchase",
    tag: "대기",
    label: `구매 요청 ${input.count}건`,
    reason: `신청 · 가장 오래된 ${input.oldestRequestedOn.slice(5)}`,
    measureText: input.estimateKrw === null ? "" : formatKrw(input.estimateKrw),
    action: { label: "구매 요청 보기", href: "/cards/purchases" },
  };
}

// 전표 대기(07.1-17 PD1 · U-11) — 법인카드로 먼저 결제했고 전표가 아직 안 붙은 구매 완료. 금액 칸은 비운다. 0건이면 줄이 없다.
export function buildCardSlipWaitingBundle(input: { count: number; oldestCompletedOn: string | null }): NextTurnEntry | null {
  if (input.count === 0 || input.oldestCompletedOn === null) return null;
  return {
    key: "phase6-card-slip",
    tag: "대기",
    label: `전표 대기 ${input.count}건`,
    reason: `결제 완료 · 가장 오래된 ${input.oldestCompletedOn.slice(5)}`,
    measureText: "",
    action: { label: "구매 요청 보기", href: "/cards/purchases" },
  };
}

// 매출 발행 요청 — 06-21 요약 하나(프로젝트 목록 링크와 같은 함수). 가장 이른 희망일이 오늘이거나 그 전이면 [오늘]. 공급가 키가 없으면(가림) 빈 글자.
export function buildIssueBundle(summary: OpenIssueRequestSummary | null, today: string): NextTurnEntry | null {
  if (!summary || summary.count === 0 || !summary.earliestDesiredDate) return null;
  return {
    key: "phase6-issue",
    tag: summary.earliestDesiredDate <= today ? "오늘" : "대기",
    label: `매출 발행 요청 ${summary.count}건`,
    reason: `희망 ${summary.earliestDesiredDate.slice(5)}`,
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
    // 07-06(D-715): 예정일 = 그 목록이 이미 셈한 유효 예정일(PaySchedule — 로더를 다시 부르지 않는다).
    const targets = await listAllPaymentTargets(viewer, {}, { today });
    const bundle = buildPaymentBundle(
      targets.map((target) => ({ scheduledPaymentDate: target.schedule.payDate, evidenceStatus: target.evidenceStatus, payableKrw: target.payableKrw })),
      today,
      await visible(viewer, "expense.amount"),
    );
    if (bundle) entries.push(bundle);
  }
  if (await can(viewer, "cards.purchases", "write")) {
    // 07.1-17(PF2): 목록 전체(행 · 줄 번호 · 붙임 수 · 투영)를 읽지 않는다 — 목록 합계(`listPurchaseRequests` totals)와 같은 견적 질의.
    // 이 갈래는 `cards.purchases` write 안이라 범위가 전부다(`listAccess`와 같은 판단). 금액 가림은 목록과 같다.
    const estimates = await listPurchaseRequestEstimates(viewer, { scope: { kind: "all" }, filter: { status: "requested" } });
    const oldest = await findOldestRequestedPurchaseAt(viewer);
    const bundle = buildPurchaseBundle({
      count: estimates.length,
      estimateKrw: (await visible(viewer, "purchase_request.amount")) ? sumKrw(estimates) : null,
      oldestRequestedOn: oldest ? seoulToday(oldest) : null,
    });
    if (bundle) entries.push(bundle);
    const waiting = await findCardSlipWaiting(viewer);
    const slip = buildCardSlipWaitingBundle({ count: waiting.count, oldestCompletedOn: waiting.oldestCompletedAt ? seoulToday(waiting.oldestCompletedAt) : null });
    if (slip) entries.push(slip);
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
