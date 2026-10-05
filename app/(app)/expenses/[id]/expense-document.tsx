import Link from "next/link";
import "@/app/(app)/document-kinds";
import { getDocumentKind, REJECT_REASON_EMPTY_MESSAGE, REJECT_REASON_MAX, REJECT_REASON_TOO_LONG_MESSAGE, type ApprovalView } from "@/domain/approvals";
import type { ExpenseDocumentDto } from "@/domain/expenses";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { formatKrw } from "@/lib/format-number";
import { kstDateOf } from "@/lib/kst-date";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 3차 클래스를 직접 쓴다(holidays 선례).
import buttonStyles from "@/ui/button/Button.module.css";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ApprovalRoute } from "@/ui/approval-route/ApprovalRoute";
import type { AttachmentFile } from "@/ui/attachments/Attachments";
import { DocumentActions } from "@/app/(app)/leave/[id]/document-actions";
import { SubmittedToast } from "@/app/(app)/leave/[id]/submitted-toast";
import { routeListSteps, withdrawResultLines } from "@/app/(app)/leave/status-display";
import { expenseStatusWord } from "../status-display";
import type { EvidenceActions } from "@/domain/evidence";
import { EvidenceAttachments } from "./evidence-attachments";
import { SubmittedUndoToast } from "./submitted-undo-toast";
import { TaxParts } from "./tax-parts";
import styles from "./expense.module.css";

// 05-05(S7): 지출결의 문서 화면 — 제출 뒤. 읽기 칸(KvList) → `DetailScreen.Section 증빙` → 04.1 행동 줄. 행동 줄은 `getApprovalView`의 가능 행동 목록을
// 서버가 고른 그대로 그린다(연차 문서 화면의 `DocumentActions`를 옮기지 않고 재사용 — 폰 행동 줄 순서 · Tab · 간격 · Ctrl+Enter · 제출 중 규칙을 물려받는다).
// `resubmit` · `resubmitRoute`는 null — 지출결의 다시 제출은 폼이 한다(05-09).

const IN_PROGRESS: readonly string[] = ["submitted", "in_review"];

export function ExpenseDocument({
  expense,
  view,
  files,
  evidenceActions,
  maxMb,
  submitted,
}: {
  expense: Partial<ExpenseDocumentDto>;
  view: ApprovalView | null;
  files: AttachmentFile[];
  evidenceActions: EvidenceActions;
  maxMb: number;
  submitted: string | undefined;
}) {
  const id = expense.id ?? "";
  // 팀 비용 문서(프로젝트 · 견적 줄 없음 · 사용일 있음) — 머리 줄은 `지출결의 — {팀} · {내용}`, 프로젝트 칸은 `프로젝트 미연결 · {종류}`.
  const isTeam = Boolean(expense.usageDate);
  const target = isTeam ? [expense.teamName, expense.content].filter(Boolean).join(" · ") : [expense.projectName, expense.itemName].filter(Boolean).join(" · ");
  const title = target ? `지출결의 — ${target}` : "지출결의";
  const supply = expense.supply ?? null;
  const actions = view?.actions ?? [];
  const inProgress = view?.status !== undefined && IN_PROGRESS.includes(view.status);

  // 제출 직후 착지(`?submitted=1`) — 결재 중이고 기안자(회수 가능)일 때만 토스트. 이름은 주소에 싣지 않고 지금 단계 담당에서 만든다.
  // 05-09: 차수 2 이상이면 다시 제출 토스트, 둘 다 3차 `되돌리기`(확인 없는 즉시 회수 — 토스트가 지금 차수를 가진다).
  const holderNames = (view?.steps ?? [])
    .filter((step) => step.state === "current" && step.holderNames)
    .map((step) => step.holderNames)
    .join(", ");
  const submitLabel = (view?.round ?? 1) > 1 ? "지출결의 다시 제출" : "지출결의 제출";
  // 기안자가 지금 단계 담당이면(자기 승인) 결과 글자 대신 `본인 승인 차례` — 1차는 행동 줄의 `승인`이다.
  const selfTurn = actions.includes("approve") && Boolean(view?.steps?.some((step) => step.state === "current" && step.viewerHolds));
  const undoToast =
    submitted === "1" && inProgress && actions.includes("withdraw") && view?.round
      ? {
          round: view.round,
          message: selfTurn ? `${submitLabel} · 본인 승인 차례` : holderNames ? `${submitLabel} · 결재 요청됨 → ${holderNames}` : `${submitLabel} · 결재 요청됨`,
        }
      : null;
  const toast = !undoToast && submitted === "already" && expense.number ? `이미 제출됨 · ${expense.number}` : null;

  const dash = <span className={styles.muted}>—</span>;
  const items: KvItem[] = [
    {
      label: "프로젝트",
      value: isTeam ? (
        <span className={styles.muted}>{["프로젝트 미연결", expense.teamExpenseKindLabel].filter(Boolean).join(" · ")}</span>
      ) : expense.projectId && expense.projectName ? (
        <Link href={`/projects/${expense.projectId}`} scroll={false} className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}>
          {[expense.projectNumber, expense.projectName].filter(Boolean).join(" ")}
        </Link>
      ) : (
        dash
      ),
    },
  ];
  if (isTeam) {
    items.push(
      { label: "팀", value: expense.teamName ?? dash },
      { label: "사용일", value: expense.usageDate ?? dash },
      { label: "내용", value: expense.content ?? dash },
    );
  } else {
    items.push({ label: "견적 줄", value: expense.itemName ? [expense.lineNo, expense.itemName].filter(Boolean).join(" ") : dash });
  }
  if (expense.installment) items.push({ label: "분할 지급", value: expense.installmentSeq ? `${expense.installmentSeq}회차` : dash });
  items.push(
    { label: "거래처", value: expense.vendorName ?? dash },
    { label: "증빙 종류", value: expense.evidenceTypeName ?? dash },
  );
  // 금액을 볼 수 없는 계급에는 공급가액 행째 없다(투영에서 빠진 필드는 행을 만들지 않는다).
  if (supply) {
    items.push({
      label: "공급가액",
      value: (
        <>
          <Num value={supply.amountKrw} fx={supply.currency === "KRW" ? undefined : { currency: supply.currency, amount: supply.amount, rate: supply.fxRate }} />
          {expense.taxLine ? (
            <span className={styles.taxLine} data-testid="expense-tax-line">
              <TaxParts parts={expense.taxLine.parts} />
            </span>
          ) : null}
          {expense.taxDrift ? (
            <span className={styles.drift} data-testid="expense-tax-drift">
              <TaxParts parts={expense.taxDrift.parts} />
            </span>
          ) : null}
        </>
      ),
    });
  }
  items.push(
    { label: "지급 예정일", value: expense.scheduledPaymentDate ?? dash },
    { label: "지급 방식", value: expense.paymentMethodName ?? dash },
    { label: "비고", value: expense.note || dash },
    { label: "기안", value: [expense.drafterName, expense.createdAt ? kstDateOf(expense.createdAt) : null].filter(Boolean).join(" · ") },
    { label: "결재선", value: <ApprovalRoute mode="list" steps={routeListSteps(view?.steps)} endLines={view?.endLines ?? []} /> },
  );

  const amountText = supply ? formatKrw(supply.amountKrw) : null;

  return (
    <div className={styles.column}>
      <DetailScreen
        title={title}
        status={expense.number !== null && !view ? undefined : <StatusTag status={expenseStatusWord(view?.status)} />}
        meta={expense.number ?? undefined}
      >
        <KvList items={items} />
        <DetailScreen.Section title="증빙">
          <div id="evidence" className={styles.evidence}>
            <EvidenceAttachments
              expenseId={id}
              files={files}
              mode="read"
              maxMb={maxMb}
              evidenceActions={evidenceActions}
              reasonMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
            />
          </div>
        </DetailScreen.Section>
        <DocumentActions
          instanceId={view?.instanceId ?? null}
          version={view?.version ?? null}
          actions={actions}
          decision={
            view?.instanceId && view.version !== undefined
              ? {
                  instanceId: view.instanceId,
                  version: view.version,
                  kindLabel: getDocumentKind(EXPENSE_DOCUMENT_KIND).label,
                  subtitle: [expense.number, expense.drafterName, target, amountText].filter(Boolean).join(" · "),
                  withdrawSubtitle: [expense.number, target].filter(Boolean).join(" · "),
                  drafterName: view.drafterName ?? expense.drafterName ?? null,
                  // 지출결의는 회수 뒤 같은 번호로 다시 제출한다 — 승인 기록 줄에 다시 제출이 첫 단계부터임을 붙인다(UI-SPEC Destructive — 회수).
                  withdrawLines: withdrawResultLines(view.steps).map((line) => (line.endsWith(" 승인 기록은 남음") ? `${line} · 다시 제출 때 첫 단계부터` : line)),
                }
              : null
          }
          rejectMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
          resubmit={null}
          resubmitRoute={null}
        />
        {undoToast ? <SubmittedUndoToast expenseId={id} round={undoToast.round} message={undoToast.message} /> : null}
        {toast ? <SubmittedToast message={toast} href={`/expenses/${id}`} /> : null}
      </DetailScreen>
    </div>
  );
}
