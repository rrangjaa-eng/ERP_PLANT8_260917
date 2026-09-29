import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { kstDateOf } from "@/lib/kst-date";
import "@/app/(app)/document-kinds";
import { formatLeaveTitle, formatRequestBalanceRow, getLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { getLeaveBalanceForRequest } from "@/domain/leave/balance-service";
import {
  getApprovalView,
  REJECT_REASON_EMPTY_MESSAGE,
  REJECT_REASON_MAX,
  REJECT_REASON_TOO_LONG_MESSAGE,
} from "@/domain/approvals";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ApprovalRoute } from "@/ui/approval-route/ApprovalRoute";
import { DayNumbers } from "../day-numbers";
import { formatLeavePeriod, HALF_LABELS, LEAVE_KIND_LABELS } from "../labels";
import { leaveStatusDisplay, routeListSteps, seoulMinuteOf, toLeaveStatusKey, withdrawResultLines } from "../status-display";
import { previewRouteOrBlocked } from "../route-preview";
import { DocumentActions } from "./document-actions";
import { SubmittedToast } from "./submitted-toast";
import styles from "../leave.module.css";

// 04.1-02 S3 첫 형태 + 04.1-05(S3 · A3): 머리(제목 · 번호 · 상태 태그) + KvList(종류 · 기간 · (일수) · 비고 · (잔고) ·
// 기안 · 결재선) + 서버가 고른 행동 줄. 메뉴 게이트가 아니라 문서 보임 규칙(기안자 · 지금 후보 · 처리자)만
// 따른다 — 그 밖은 404(getLeave → null). 행동 줄 · 결재선 · 끝 줄은 getApprovalView가 준 목록을 그대로
// 넘긴다(화면은 상태로 행동을 고르거나 막힘을 추론하지 않는다). WR-07: 세션 검사를 이 페이지가 직접 한다.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IN_PROGRESS: readonly string[] = ["submitted", "in_review"];

export default async function LeaveDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { viewer } = await requireSession();
  const { id } = await params;
  const { submitted } = await searchParams;
  if (!UUID.test(id)) notFound();
  const leave = await getLeave(viewer, id);
  if (!leave) notFound();
  const view = await getApprovalView(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: id });

  const statusKey = toLeaveStatusKey(leave.status);
  const status = statusKey ? leaveStatusDisplay(statusKey) : null;
  const period = leave.startDate && leave.endDate ? `${leave.startDate}${leave.endDate !== leave.startDate ? ` ~ ${leave.endDate}` : ""}` : "";
  const kindLabel = leave.kind ? `${LEAVE_KIND_LABELS[leave.kind] ?? leave.kind}${leave.half ? ` ${HALF_LABELS[leave.half] ?? leave.half}` : ""}` : "";

  // 잔고 행은 결재 중(진행 중) 문서에만 — 승인 · 반려 · 회수된 문서는 읽지도 그리지도 않는다(CXF-B-F03).
  const inProgress = view?.status !== undefined && IN_PROGRESS.includes(view.status);
  const balanceLines =
    inProgress && leave.kind ? formatRequestBalanceRow(await getLeaveBalanceForRequest(viewer, id), leave.kind) : null;

  const actions = view?.actions ?? [];
  const resubmitting = actions.includes("resubmit");
  // 신청 직후 착지(`?submitted=1`, 신청 폼이 붙인다) — 결재 중이고 기안자(회수 가능)일 때만 토스트. 이름은 주소에
  // 싣지 않고 지금 단계 담당(투영된 이름)에서 만든다(04.1-06 DOM 감사 #3).
  const holderNames = (view?.steps ?? [])
    .filter((step) => step.state === "current" && step.holderNames)
    .map((step) => step.holderNames)
    .join(", ");
  const submittedToast =
    submitted === "1" && inProgress && actions.includes("withdraw")
      ? holderNames
        ? `연차 신청 · 결재 요청됨 → ${holderNames}`
        : "연차 신청 · 결재 요청됨"
      : null;
  const steps = routeListSteps(view?.steps);
  const route = <ApprovalRoute mode="list" steps={steps} endLines={view?.endLines ?? []} />;

  const items: KvItem[] = [];
  if (resubmitting) {
    // 반려된 내 문서 — 맨 위 `반려` 행(처리자 · 시각 + 사유), 아래는 값이 채워진 같은 폼(S3 · S2).
    const rejected = view?.steps?.find((step) => step.state === "rejected");
    items.push({
      label: "반려",
      value: (
        <>
          {[rejected?.actedByName, rejected?.actedAt ? seoulMinuteOf(rejected.actedAt) : null].filter(Boolean).join(" · ")}
          {rejected?.reason ? <span className={styles.subLine}>사유 · {rejected.reason}</span> : null}
        </>
      ),
    });
  } else {
    items.push({ label: "종류", value: kindLabel }, { label: "기간", value: period });
    // `일수` 행은 잔고 행이 없을 때만 — 잔고 1행의 `이번 신청`과 같은 숫자를 두 자리에 쓰지 않는다(T8).
    if (!balanceLines) items.push({ label: "일수", value: <DayNumbers text={leave.days ?? ""} /> });
    items.push({ label: "비고", value: leave.note || "—" });
    if (balanceLines) {
      items.push({
        label: "잔고",
        value: balanceLines.map((line) => (
          <span key={line.text} className={styles[`balance-${line.tone}`]}>
            <DayNumbers text={line.text} />
          </span>
        )),
      });
    }
    items.push(
      { label: "기안", value: [leave.drafterName, leave.createdAt ? kstDateOf(leave.createdAt) : null].filter(Boolean).join(" · ") },
      { label: "결재선", value: route },
    );
  }

  // 다시 신청 미리보기 — 지금 설정 · 소속으로 다시 해석한 제출 전 한 줄(S3 반려 편집).
  const { route: preview, blocked: routeBlocked } = resubmitting ? await previewRouteOrBlocked(viewer) : { route: null, blocked: null };
  const skipped = preview?.steps.filter((step) => step.skipped).map((step) => `${step.label ?? ""} 단계 건너뜀(자기 승인 없음)`) ?? [];

  return (
    <>
      <PageHeader title={formatLeaveTitle(leave)} />
      <p className={styles.headerLine}>
        {leave.number ? <span>{leave.number}</span> : null}
        {status ? <StatusTag kind={status.kind}>{status.label}</StatusTag> : null}
      </p>
      <KvList items={items} />
      <DocumentActions
        instanceId={view?.instanceId ?? null}
        version={view?.version ?? null}
        actions={actions}
        decision={
          view?.instanceId && view.version !== undefined
            ? {
                instanceId: view.instanceId,
                version: view.version,
                subtitle: [leave.number, leave.drafterName, formatLeavePeriod(leave), leave.days].filter(Boolean).join(" · "),
                withdrawSubtitle: [leave.number, formatLeavePeriod(leave), leave.days].filter(Boolean).join(" · "),
                drafterName: view.drafterName ?? leave.drafterName ?? null,
                withdrawLines: withdrawResultLines(view.steps),
              }
            : null
        }
        rejectMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
        resubmit={
          resubmitting && leave.id && leave.kind && leave.startDate && leave.endDate && view?.version !== undefined
            ? {
                leaveId: leave.id,
                expectedVersion: view.version,
                initial: { kind: leave.kind, startDate: leave.startDate, endDate: leave.endDate, half: leave.half ?? null, note: leave.note ?? null },
              }
            : null
        }
        resubmitRoute={
          preview ? (
            <ApprovalRoute
              mode="line"
              drafter={preview.drafterName ?? ""}
              steps={preview.steps.filter((step) => !step.skipped).map((step) => ({ person: step.holderNames ?? "", label: step.label ?? "" }))}
              skippedNote={skipped.join(" · ") || null}
            />
          ) : routeBlocked ? (
            <span className={styles.blockedReason}>{routeBlocked}</span>
          ) : null
        }
      />
      {submittedToast ? <SubmittedToast message={submittedToast} href={`/leave/${id}`} /> : null}
    </>
  );
}
