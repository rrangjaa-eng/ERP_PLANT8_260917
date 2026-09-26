import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { kstDateOf } from "@/lib/kst-date";
import { getLeave } from "@/domain/leave";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { KvList } from "@/ui/kv-list/KvList";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { formatLeavePeriod, HALF_LABELS, LEAVE_KIND_LABELS } from "../labels";
import { leaveStatusDisplay, toLeaveStatusKey } from "../status-display";
import styles from "../leave.module.css";

// 04.1-02 S3 첫 형태 — 머리(제목 · 번호 · 상태 태그) + KvList. 행동 줄 · 결재선 목록 · 잔고 행은 04.1-05.
// 메뉴 게이트가 아니라 문서 보임 규칙(기안자 · 지금 후보 · 처리자)만 따른다 — 그 밖은 404(getLeave → null).
// WR-07: 세션 검사를 이 페이지가 직접 한다.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeaveDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer } = await requireSession();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const leave = await getLeave(viewer, id);
  if (!leave) notFound();

  const statusKey = toLeaveStatusKey(leave.status);
  const status = statusKey ? leaveStatusDisplay(statusKey) : null;
  const period = leave.startDate && leave.endDate ? `${leave.startDate}${leave.endDate !== leave.startDate ? ` ~ ${leave.endDate}` : ""}` : "";
  const kindLabel = leave.kind ? `${LEAVE_KIND_LABELS[leave.kind] ?? leave.kind}${leave.half ? ` ${HALF_LABELS[leave.half] ?? leave.half}` : ""}` : "";

  return (
    <>
      <PageHeader title={`연차 — ${formatLeavePeriod(leave)}`} />
      <p className={styles.headerLine}>
        {leave.number ? <span>{leave.number}</span> : null}
        {status ? <StatusTag kind={status.kind}>{status.label}</StatusTag> : null}
      </p>
      <KvList
        items={[
          { label: "종류", value: kindLabel },
          { label: "기간", value: period },
          { label: "일수", value: leave.days ?? "" },
          { label: "비고", value: leave.note || "—" },
          { label: "기안", value: [leave.drafterName, leave.createdAt ? kstDateOf(leave.createdAt) : null].filter(Boolean).join(" · ") },
        ]}
      />
    </>
  );
}
