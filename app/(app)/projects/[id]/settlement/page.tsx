import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { kstDateOf } from "@/lib/kst-date";
import "@/app/(app)/document-kinds";
import { getApprovalView, getDocumentKind, REJECT_REASON_EMPTY_MESSAGE, REJECT_REASON_MAX, REJECT_REASON_TOO_LONG_MESSAGE } from "@/domain/approvals";
import { getSettlement, periodText, SETTLEMENT_DOCUMENT_KIND } from "@/domain/settlements";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 3차 클래스를 직접 쓴다(지출결의 문서 화면 선례).
import buttonStyles from "@/ui/button/Button.module.css";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ApprovalRoute } from "@/ui/approval-route/ApprovalRoute";
import { leaveStatusWord, routeListSteps, toLeaveStatusKey, withdrawResultLines } from "@/app/(app)/leave/status-display";
import { SettlementActions } from "./settlement-actions";
import styles from "./settlement.module.css";

// 05-11(UI-SPEC S10 (나)): 정산 결재 문서 화면 — `DetailScreen`(제목 `정산 결재 — {프로젝트명}` · 태그 · 메타 프로젝트 번호) → 읽기 칸(KvList:
// 프로젝트 · 기간 · 담당 PM · 견적가 합 · 실행가 합 · 기안 · 결재선) → 04.1 행동 줄. 두 합은 서버가 `quote.amount`로 투영해 볼 수 없으면 행째 없고,
// 손익 행은 이 페이즈에 없다(PNL-01 · D11). 볼 수 없는 사람은 404(`layout.tsx`가 응답 전에 판정, 여기서도 null이면 404).
export const dynamic = "force-dynamic";

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer } = await requireSession();
  const { id } = await params;
  const doc = await getSettlement(viewer, { projectId: id });
  if (!doc) notFound();
  // 문서 보임(getSettlement)이 위에서 통과했다 — 결재 당사자가 아닌 전사 범위 보는 사람도 상태 · 결재선을 읽기만 한다.
  const view = await getApprovalView(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: id, readOnlyVisible: true });
  const statusKey = toLeaveStatusKey(view?.status);
  const actions = view?.actions ?? [];

  const dash = <span className={styles.muted}>—</span>;
  const projectText = [doc.projectNumber, doc.projectName].filter(Boolean).join(" ");
  const items: KvItem[] = [
    {
      label: "프로젝트",
      value: projectText ? (
        <Link href={`/projects/${id}`} scroll={false} className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}>
          {projectText}
        </Link>
      ) : (
        dash
      ),
    },
    { label: "기간", value: periodText(doc.startDate, doc.endDate) ?? dash },
    { label: "담당 PM", value: doc.pmName ?? dash },
  ];
  // G4 — 금액을 볼 수 없는 계급에는 두 행째 없다(투영에서 빠진 필드는 행을 만들지 않는다).
  if (doc.quoteTotalKrw !== undefined) items.push({ label: "견적가 합", value: <Num value={doc.quoteTotalKrw} /> });
  if (doc.executionTotalKrw !== undefined) items.push({ label: "실행가 합", value: <Num value={doc.executionTotalKrw} /> });
  items.push({ label: "기안", value: [doc.drafterName, doc.createdAt ? kstDateOf(doc.createdAt) : null].filter(Boolean).join(" · ") || dash });
  if (view?.steps && view.steps.length > 0) {
    items.push({ label: "결재선", value: <ApprovalRoute mode="list" steps={routeListSteps(view.steps)} endLines={view.endLines ?? []} /> });
  }

  return (
    <div className={styles.column}>
      <DetailScreen
        title={doc.projectName ? `정산 결재 — ${doc.projectName}` : "정산 결재"}
        status={statusKey ? <StatusTag status={leaveStatusWord(statusKey)} /> : undefined}
        meta={doc.projectNumber ? <Num value={doc.projectNumber} /> : undefined}
      >
        <KvList items={items} />
        <SettlementActions
          instanceId={view?.instanceId ?? null}
          version={view?.version ?? null}
          actions={actions}
          decision={
            view?.instanceId && view.version !== undefined
              ? {
                  instanceId: view.instanceId,
                  version: view.version,
                  kindLabel: getDocumentKind(SETTLEMENT_DOCUMENT_KIND).label,
                  subtitle: [doc.projectNumber, doc.drafterName, doc.projectName].filter(Boolean).join(" · "),
                  withdrawSubtitle: [doc.projectNumber, doc.projectName].filter(Boolean).join(" · "),
                  drafterName: view.drafterName ?? doc.drafterName ?? null,
                  withdrawLines: withdrawResultLines(view.steps),
                }
              : null
          }
          rejectMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
        />
      </DetailScreen>
    </div>
  );
}
