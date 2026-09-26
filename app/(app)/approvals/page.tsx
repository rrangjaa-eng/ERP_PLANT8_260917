import { requireSession } from "@/lib/viewer";
import { kstDateOf } from "@/lib/kst-date";
import "@/app/(app)/document-kinds";
import { listMyInbox, type ApprovalInboxItemDto } from "@/domain/approvals";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { formatLeavePeriod, type LeavePeriodSource } from "@/app/(app)/leave/labels";
import { leaveStatusDisplay, toLeaveStatusKey } from "@/app/(app)/leave/status-display";
import { InboxTable, type InboxRow } from "./inbox-table";

// 04.1-02 S4 첫 형태 — 개인 결재함. 메뉴 게이트가 없다(세션만) — 내용은 결재선 후보 · 처리 기록으로만
// 정해진다(listMyInbox). 그룹 `내 결재`(지금 내가 담당) · `처리함`(내가 처리한 최근 50건).
// 문서 종류 등록은 document-kinds 한 곳으로 보장한다(CEO-3). WR-07: 세션 검사를 이 페이지가 직접 한다.
export const dynamic = "force-dynamic";

type LeaveSummary = LeavePeriodSource & { days?: string };

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
  };
}

export default async function ApprovalsPage() {
  const { viewer } = await requireSession();
  const inbox = await listMyInbox(viewer);
  const rows = [...inbox.mine.map((item) => toRow(item, "mine")), ...inbox.processed.map((item) => toRow(item, "processed"))];

  return (
    <>
      <PageHeader title="결재" subtitle="내가 처리할 결재 문서" />
      {rows.length === 0 ? (
        <ListEmpty message="결재할 건이 없습니다" action={{ label: "연차 목록 보기", href: "/leave" }} />
      ) : (
        <InboxTable rows={rows} />
      )}
    </>
  );
}
