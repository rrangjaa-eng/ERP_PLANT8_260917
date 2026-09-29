import { requireSession } from "@/lib/viewer";
import { kstDateOf } from "@/lib/kst-date";
import "@/app/(app)/document-kinds";
import {
  listMyInbox,
  REJECT_REASON_EMPTY_MESSAGE,
  REJECT_REASON_MAX,
  REJECT_REASON_TOO_LONG_MESSAGE,
  type ApprovalInboxItemDto,
} from "@/domain/approvals";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { formatLeavePeriod, type LeavePeriodSource } from "@/app/(app)/leave/labels";
import { leaveStatusDisplay, routeListSteps, toLeaveStatusKey, withdrawResultLines } from "@/app/(app)/leave/status-display";
import { InboxTable, type InboxRow } from "./inbox-table";
import type { ApprovalSheetItem, SheetDetailRow } from "./approval-sheet";
import type { DecisionTarget } from "./decision-dialogs";

// 04.1-02 S4 첫 형태 — 개인 결재함. 메뉴 게이트가 없다(세션만) — 내용은 결재선 후보 · 처리 기록으로만
// 정해진다(listMyInbox). 그룹 `내 결재`(지금 내가 담당) · `처리함`(내가 처리한 최근 50건).
// 문서 종류 등록은 document-kinds 한 곳으로 보장한다(CEO-3). WR-07: 세션 검사를 이 페이지가 직접 한다.
export const dynamic = "force-dynamic";

type LeaveSummary = LeavePeriodSource & { days?: string; number?: string | null };

// 반려 · 회수 확인 재료(S6) — 부제는 서버 값으로만(번호 · 기안자 · 종류 기간 · 일수, 빠진 조각은 뺀다).
function toDecision(item: Partial<ApprovalInboxItemDto>, summary: LeaveSummary): DecisionTarget | null {
  if (!item.instanceId || item.version === undefined) return null;
  const period = formatLeavePeriod(summary);
  return {
    instanceId: item.instanceId,
    version: item.version,
    subtitle: [summary.number, item.drafterName, period, summary.days].filter(Boolean).join(" · "),
    withdrawSubtitle: [summary.number, period, summary.days].filter(Boolean).join(" · "),
    drafterName: item.drafterName ?? null,
    withdrawLines: withdrawResultLines(item.steps),
  };
}

// 종류가 준 상세 행(같은 라벨이 이어지면 한 칸의 여러 줄 — 잔고 1행 · 2행 · 잔여 초과)을 라벨 · 값 목록으로.
function sheetRows(rows: NonNullable<ApprovalInboxItemDto["detail"]>["rows"]): SheetDetailRow[] {
  const grouped: SheetDetailRow[] = [];
  for (const row of rows) {
    const last = grouped[grouped.length - 1];
    if (last && last.label === row.label) last.lines.push({ text: row.value, tone: row.tone });
    else grouped.push({ label: row.label, lines: [{ text: row.value, tone: row.tone }] });
  }
  return grouped;
}

// 04.1-05(S5): `내 결재` 항목의 결재 시트 재료 — 서버가 준 상세 · 결재선 · 가능 행동을 그대로 옮긴다.
function toSheet(item: Partial<ApprovalInboxItemDto>): ApprovalSheetItem | null {
  if (!item.instanceId || item.version === undefined || !item.detail || !item.actions) return null;
  return {
    instanceId: item.instanceId,
    version: item.version,
    title: item.detail.title,
    subtitle: item.detail.subtitle,
    rows: sheetRows(item.detail.rows),
    steps: routeListSteps(item.steps),
    endLines: item.endLines ?? [],
    actions: item.actions,
  };
}

function toRow(item: Partial<ApprovalInboxItemDto>, group: InboxRow["group"]): InboxRow {
  const summary = (item.summary ?? {}) as LeaveSummary;
  const statusKey = group === "processed" ? toLeaveStatusKey(item.status) : null;
  const status = statusKey ? leaveStatusDisplay(statusKey, { stepLabel: item.stepLabel }) : null;
  return {
    id: `${group}:${item.instanceId ?? item.documentId ?? ""}`,
    group,
    instanceId: item.instanceId ?? null,
    version: item.version ?? null,
    href: item.href ?? null,
    document: [item.kindLabel, formatLeavePeriod(summary)].filter(Boolean).join(" · "),
    drafter: [item.drafterName, item.submittedAt ? kstDateOf(item.submittedAt).slice(5) : null].filter(Boolean).join(" · "),
    days: summary.days ?? "",
    status,
    sheet: group === "mine" ? toSheet(item) : null,
    decision: group === "mine" ? toDecision(item, summary) : null,
  };
}

export default async function ApprovalsPage() {
  const { viewer } = await requireSession();
  // 상세까지 한 번에 — 같은 노출 메모 · 종류마다 loadDetails 한 번(CEO-17).
  const inbox = await listMyInbox(viewer, { withDetails: true });
  const rows = [...inbox.mine.map((item) => toRow(item, "mine")), ...inbox.processed.map((item) => toRow(item, "processed"))];

  return (
    <>
      <PageHeader title="결재" subtitle="내가 처리할 결재 문서" />
      {rows.length === 0 ? (
        <ListEmpty message="결재할 건이 없습니다" action={{ label: "연차 목록 보기", href: "/leave" }} />
      ) : (
        <InboxTable
          rows={rows}
          rejectMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
        />
      )}
    </>
  );
}
