import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { kstDateOf } from "@/lib/kst-date";
import "@/app/(app)/document-kinds";
import { listReasonOptions } from "@/domain/code-tables";
import { formatLeaveTitle, formatRequestBalanceRow, getLeave, LEAVE_CANCEL_KIND, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { previewLeaveCancel } from "@/domain/leave/cancel";
import { getLeaveBalanceForRequest } from "@/domain/leave/balance-service";
import {
  getApprovalView,
  getDocumentKind,
  REJECT_REASON_EMPTY_MESSAGE,
  REJECT_REASON_MAX,
  REJECT_REASON_TOO_LONG_MESSAGE,
} from "@/domain/approvals";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { PcOnly } from "@/app/(app)/admin/pc-only";
import buttonStyles from "@/ui/button/Button.module.css";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ApprovalRoute } from "@/ui/approval-route/ApprovalRoute";
import { DayNumbers } from "../day-numbers";
import { formatLeaveKind, formatLeavePeriod, type LeavePeriodSource } from "../labels";
import {
  cancelRouteListSteps,
  leaveDocumentStatusWord,
  previousRejectionLines,
  routeListSteps,
  seoulMinuteOf,
  toLeaveStatusKey,
  withdrawResultLines,
} from "../status-display";
import { previewRouteOrBlocked } from "../route-preview";
import { DocumentActions } from "./document-actions";
import type { LeaveCancelEntry } from "./cancel-request";
import { SubmittedToast } from "./submitted-toast";
import styles from "../leave.module.css";

// 04.1-02 S3 첫 형태 + 04.1-05(S3 · A3): 머리(`DetailScreen` 제목 · 상태 · 번호 메타) + KvList(종류 · 기간 · (일수) · 비고 · (잔고) ·
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
  // 07.2-15(S18 · PU10): 승인된 연차의 취소 결재(별도 문서 종류 leave_cancel · 같은 연차 id). 결재 중 · 반려 · 회수 · 승인이면 그 결재선 ·
  // 행동을 원 연차 대신 쓴다(원 연차는 승인으로 끝나 행동이 없다). 취소 결재 당사자가 아니면 null.
  const cancelView = leave.status === "approved" ? await getApprovalView(viewer, { kind: LEAVE_CANCEL_KIND, documentId: id }) : null;
  const cancelEntry = await leaveCancelEntry(viewer, id, leave, cancelView);

  const statusKey = toLeaveStatusKey(leave.status);
  const period = leave.startDate && leave.endDate ? `${leave.startDate}${leave.endDate !== leave.startDate ? ` ~ ${leave.endDate}` : ""}` : "";
  const kindLabel = formatLeaveKind(leave);

  // 잔고 행은 결재 중(진행 중) 문서에만 — 승인 · 반려 · 회수된 문서는 읽지도 그리지도 않는다(CXF-B-F03).
  const inProgress = view?.status !== undefined && IN_PROGRESS.includes(view.status);
  const balanceLines =
    inProgress && leave.kind ? formatRequestBalanceRow(await getLeaveBalanceForRequest(viewer, id), leave.kind) : null;

  const actions = view?.actions ?? [];
  const resubmitting = actions.includes("resubmit");
  // 취소 결재의 행동(결재자 승인 · 반려, 기안자 회수). 다시 요청(resubmit)은 폼이 아니라 `취소 다시 요청` 입구가 받는다.
  const cancelActions = (cancelView?.actions ?? []).filter((action) => action !== "resubmit");
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
  const steps = [...routeListSteps(view?.steps), ...cancelRouteListSteps(cancelView?.steps)];
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
    items.push({ label: "기안", value: [leave.drafterName, leave.createdAt ? kstDateOf(leave.createdAt) : null].filter(Boolean).join(" · ") });
    // 07.2-16(PU18 · S14): 다시 올라온 문서의 `지난 반려` — 진행 중인 취소 요청이 다시 올라온 것이면 그 반려, 아니면 연차의 반려(한 행).
    const previousRejection = cancelView?.previousRejection ?? view?.previousRejection;
    if (previousRejection) {
      items.push({
        label: "지난 반려",
        value: previousRejectionLines(previousRejection).map((line) => (
          <span key={line.tone} className={styles[`balance-${line.tone}`]}>
            {line.text}
          </span>
        )),
      });
    }
    items.push({ label: "결재선", value: route });
  }

  // 다시 신청 미리보기 — 지금 설정 · 소속으로 다시 해석한 제출 전 한 줄(S3 반려 편집).
  // 07.2-13(PU9): 첫 그림은 그 문서의 저장된 종류로 — 폼에서 종류를 바꾸면 폼 미리보기 액션이 새 종류로 다시 그린다.
  const { route: preview, blocked: routeBlocked } = resubmitting
    ? await previewRouteOrBlocked(viewer, leave.kind ? { leaveKind: leave.kind } : undefined)
    : { route: null, blocked: null };
  const skipped = preview?.steps.filter((step) => step.skipped).map((step) => `${step.label ?? ""} 단계 건너뜀(자기 승인 없음)`) ?? [];

  return (
    <DetailScreen
      title={formatLeaveTitle(leave)}
      status={statusKey ? <StatusTag status={leaveDocumentStatusWord(statusKey, leave.cancelState)} /> : undefined}
      meta={leave.number || undefined}
      // 07.4-02 D-7409: 결재 인스턴스가 있을 때만 머리 줄 2차 「인쇄」(새 탭). 폰(<700)에서는 PcOnly가 숨긴다.
      // 07.2-15: 취소가 최종 승인된 연차는 인쇄 입구가 없다(인쇄 주소도 404 — app/print/leaves/[id]/load.ts).
      actions={
        view?.instanceId && leave.cancelState !== "cancelled"
          ? {
              secondary: (
                <PcOnly>
                  <Link href={`/print/leaves/${id}`} target="_blank" rel="noopener" prefetch={false} className={`${buttonStyles.btn} ${buttonStyles.secondary}`}>
                    인쇄
                  </Link>
                </PcOnly>
              ),
            }
          : undefined
      }
    >
      <KvList items={items} />
      <DocumentActions
        {...(cancelView?.instanceId && cancelView.version !== undefined && cancelActions.length > 0
          ? {
              instanceId: cancelView.instanceId,
              version: cancelView.version,
              actions: cancelActions,
              decision: {
                instanceId: cancelView.instanceId,
                version: cancelView.version,
                kindLabel: getDocumentKind(LEAVE_CANCEL_KIND).label,
                subtitle: [leave.number, leave.drafterName, formatLeavePeriod(leave), leave.days].filter(Boolean).join(" · "),
                withdrawSubtitle: [leave.number, formatLeavePeriod(leave), leave.days].filter(Boolean).join(" · "),
                drafterName: cancelView.drafterName ?? leave.drafterName ?? null,
                withdrawLines: withdrawResultLines(cancelView.steps),
              },
            }
          : {
              instanceId: view?.instanceId ?? null,
              version: view?.version ?? null,
              actions,
              decision:
                view?.instanceId && view.version !== undefined
                  ? {
                      instanceId: view.instanceId,
                      version: view.version,
                      kindLabel: getDocumentKind(LEAVE_DOCUMENT_KIND).label,
                      subtitle: [leave.number, leave.drafterName, formatLeavePeriod(leave), leave.days].filter(Boolean).join(" · "),
                      withdrawSubtitle: [leave.number, formatLeavePeriod(leave), leave.days].filter(Boolean).join(" · "),
                      drafterName: view.drafterName ?? leave.drafterName ?? null,
                      withdrawLines: withdrawResultLines(view.steps),
                    }
                  : null,
            })}
        cancel={cancelEntry}
        rejectMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
        reasonOptions={await listReasonOptions(viewer, "reject_reason")}
        resubmit={
          resubmitting && leave.id && leave.kind && leave.startDate && leave.endDate && view?.version !== undefined
            ? {
                leaveId: leave.id,
                expectedVersion: view.version,
                initial: { kind: leave.kind, startDate: leave.startDate, endDate: leave.endDate, half: leave.half ?? null, startTime: leave.startTime ?? null, note: leave.note ?? null },
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
    </DetailScreen>
  );
}

// 07.2-15(S18): `취소 요청` · `취소 다시 요청` 입구 — 취소 결재가 없거나(처음) 반려 · 회수되어 다시 요청할 수 있을 때만. 입구 판정(연차 쓰기 ·
// 기안자 본인 · 원 연차 승인)과 결과 줄 이름은 제출과 같은 도메인 미리보기가 한다 — 통과하지 못하면(사용자에게 보일 거부) 입구를 그리지 않는다.
async function leaveCancelEntry(
  viewer: Awaited<ReturnType<typeof requireSession>>["viewer"],
  leaveId: string,
  leave: LeavePeriodSource & { status?: string | null; cancelState?: string },
  cancelView: Awaited<ReturnType<typeof getApprovalView>>,
): Promise<LeaveCancelEntry | null> {
  if (leave.status !== "approved" || leave.cancelState !== "none") return null;
  // 취소 결재가 이미 있으면(반려 · 회수) 엔진이 다시 요청을 허락할 때만 그 version으로.
  let resubmitVersion: number | null = null;
  if (cancelView?.instanceId) {
    if (!cancelView.actions?.includes("resubmit") || cancelView.version === undefined) return null;
    resubmitVersion = cancelView.version;
  }
  try {
    const { approverName } = await previewLeaveCancel(viewer, leaveId);
    return { leaveId, resubmitVersion, subtitle: formatLeavePeriod(leave), approverName };
  } catch (error) {
    if (error instanceof UserFacingError) return null;
    throw error;
  }
}
