import Link from "next/link";
import type { ReactNode } from "react";
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
import { PcOnly } from "@/app/(app)/admin/pc-only";
import type { AttachmentFile } from "@/ui/attachments/Attachments";
import { DocumentActions } from "@/app/(app)/leave/[id]/document-actions";
import { SubmittedToast } from "@/app/(app)/leave/[id]/submitted-toast";
import { previousRejectionLines, routeListSteps, withdrawResultLines } from "@/app/(app)/leave/status-display";
import leaveStyles from "@/app/(app)/leave/leave.module.css";
import { expenseStatusWord } from "../status-display";
import type { EvidenceActions } from "@/domain/evidence";
import type { PaymentViewDto } from "@/domain/payments";
import { EvidenceAttachments } from "./evidence-attachments";
import type { EvidenceLockLineCode } from "./evidence-locked-lines";
import { EvidenceRecordsSection, type EvidencePickState, type LinkedEvidenceItem } from "./evidence-records-section";
import { EvidenceReviewBlock, PrepaidReasonLine } from "./evidence-review-section";
import { SubmittedUndoToast } from "./submitted-undo-toast";
import { TaxParts } from "./tax-parts";
import { PaymentActionRow, PaymentLoadError, PaymentPanelProvider, PaymentSection } from "./payment-action-row";
import { PaymentScheduleValue, type PaymentScheduleValueProps } from "./payment-section";
import { CloseExpenseButton } from "./close-expense-button";
import type { DateChangeView } from "@/domain/expenses/date-change";
import { DateApprovedToast, DateChangeRow } from "./date-change-row";
import { DateChangeHistory } from "./date-change-history";
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
  privateNotice = null,
  linkedEvidence,
  maxMb,
  submitted,
  paymentView = null,
  projectOpenable,
  reasonOptions,
  dateChange = null,
  dateLanding = null,
}: {
  expense: Partial<ExpenseDocumentDto>;
  view: ApprovalView | null;
  files: AttachmentFile[];
  evidenceActions: EvidenceActions;
  /** 06.1-14(G15) — 숨긴 「올린 사람 · 경영관리만 보기」 파일 · 붙은 기록의 잠김 줄 글자(서버 판정). 없으면 null. */
  privateNotice?: string | null;
  /** 06.1-06 — 붙은 증빙 기록(서버 listLinkedEvidence) · 섹션 잠김 줄 코드. */
  linkedEvidence: { items: LinkedEvidenceItem[]; lockLine: EvidenceLockLineCode | null; pick: EvidencePickState | null };
  maxMb: number;
  submitted: string | undefined;
  /** 06-03: 결재 통과 문서의 지급 섹션 DTO — 없거나 null이면 지급 섹션 · 행동 줄을 그리지 않는다(P0 · 05 C1 작성 중 문서). */
  paymentView?: Partial<PaymentViewDto> | "error" | null;
  /** 06.2-09(S6 · D-6206) — 서버가 「열 수 있음」을 판정한다. 거짓이면 링크 없이 글자만(죽은 링크 금지). */
  projectOpenable: boolean;
  /** 07.2-07 X3 — 반려 사유 코드표의 활성 항목 label(서버 page가 읽어 내린다). */
  reasonOptions: string[];
  /** 07.2-18 X4 — 희망 지급일 변경 요청 사실(결재 통과 문서만 · 서버 listDateChangeView). 없으면 요청 줄 · 이력 DOM 0. */
  dateChange?: DateChangeView | null;
  /** 07.2-18 — 요청 화면 착지(`requested`) · 승인 착지(되돌리기 재료). 주소에서 서버가 모양을 거른 값. */
  dateLanding?: { kind: "requested" } | { kind: "approved"; requestId: string; newDate: string; before: string | null; version: number } | null;
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
        projectOpenable ? (
          <Link href={`/projects/${expense.projectId}`} scroll={false} className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}>
            {[expense.projectNumber, expense.projectName].filter(Boolean).join(" ")}
          </Link>
        ) : (
          <span>{[expense.projectNumber, expense.projectName].filter(Boolean).join(" ")}</span>
        )
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
  // 06.5 V12(결정 맥락 9 · D-6517): 지급처 = 거래처 이름 → 직원 이름, 값 아래 한 줄로 종류(거래처 `기본 증빙 {종류}` · 직원 `직원 · {팀}`).
  const payeeName = expense.vendorName ?? expense.payeeUserName ?? null;
  const payeeSub = expense.vendorName
    ? expense.defaultEvidenceName
      ? `기본 증빙 ${expense.defaultEvidenceName}`
      : null
    : expense.payeeUserName
      ? expense.payeeTeamName
        ? `직원 · ${expense.payeeTeamName}`
        : "직원"
      : null;
  items.push(
    {
      label: "지급처",
      value: payeeName ? (
        <>
          {payeeName}
          {payeeSub ? <span className={styles.sub}>{payeeSub}</span> : null}
        </>
      ) : (
        dash
      ),
    },
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
          {/* E-22: 지급 뒤 정본은 지급 기록 — 05 세율 바뀜 줄은 지급된 문서에서 그리지 않는다(05 계산 한 줄은 그대로). */}
          {expense.taxDrift && !(paymentView && paymentView !== "error" && paymentView.row?.row === "P6") ? (
            <span className={styles.drift} data-testid="expense-tax-drift">
              <TaxParts parts={expense.taxDrift.parts} />
            </span>
          ) : null}
        </>
      ),
    });
  }
  // 06.5 V15: 받는 인원 — 회사 대납 문서에서 투영에 칸이 있을 때만(금액을 못 보는 계급은 빠진다), 공급가액 다음(폼의 칸 순서).
  if (expense.taxRuleKind === "company_borne" && expense.recipientCount !== undefined) items.push({ label: "받는 인원", value: `${expense.recipientCount}명` });
  // 06-03: 지급 섹션이 서면 지급 예정일 · 지급 방식은 그 섹션 한 자리에만(같은 사실 두 자리 금지 — UI-SPEC S5).
  // 07-16(SC-03 · D-731): 지급 예정일 값은 지급 섹션과 같은 PaymentScheduleValue(태그 · 규칙 줄 · 자동 계산 · 요일 경고), 앞에 희망 두 줄(있을 때만).
  const scheduleValueProps: PaymentScheduleValueProps = {
    date: expense.scheduledPaymentDate ?? null,
    manual: expense.scheduledPaymentManual ?? false,
    autoDate: expense.autoPaymentDate ?? null,
    pushReason: expense.paymentPushReason ?? null,
    ruleLine: expense.paymentRuleLine ?? null,
    offWeekday: expense.paymentOffWeekday ?? null,
  };
  // 07.2-18 S16: 요청 줄은 입구 · 대기 · 처리 줄이 있을 때만(그 밖 DOM 0), 이력 표는 요청이 한 번이라도 있을 때만 — 지급 섹션과 이 자리가 같은 사실 하나를 쓴다.
  const requestedDate = expense.requestedPaymentDate ?? null;
  const dateChangeRow =
    dateChange && (dateChange.entry !== null || dateChange.canDecide) ? (
      <DateChangeRow expenseId={id} number={expense.number ?? null} date={requestedDate} view={dateChange} hopeReason={expense.requestedPaymentReason ?? null} />
    ) : null;
  const dateChangeHistory = dateChange && dateChange.history.length > 0 ? <DateChangeHistory rows={dateChange.history} /> : null;
  const requested = { date: requestedDate, reason: expense.requestedPaymentReason ?? null, dateChange: dateChangeRow, history: dateChangeHistory };
  if (!paymentView || paymentView === "error") {
    if (dateChangeRow) items.push({ label: "희망 지급일", value: dateChangeRow });
    else if (requested.date) items.push({ label: "희망 지급일", value: requested.date });
    if (requested.reason) items.push({ label: "희망 사유", value: <span className={styles.subLine}>{requested.reason}</span> });
    items.push({ label: "지급 예정일", value: <PaymentScheduleValue {...scheduleValueProps} /> }, { label: "지급 방식", value: expense.paymentMethodName ?? dash });
  }
  items.push(
    { label: "상세", value: expense.note || dash },
    { label: "기안", value: [expense.drafterName, expense.createdAt ? kstDateOf(expense.createdAt) : null].filter(Boolean).join(" · ") },
  );
  // 07.2-16(PU18 · S14): 다시 올라온 문서의 `지난 반려` — 줄 모양은 연차 잔고 줄(`balance-*`)과 같다. 반려 이력이 없거나 당사자가 아니면 행이 없다.
  if (view?.previousRejection) {
    items.push({
      label: "지난 반려",
      value: previousRejectionLines(view.previousRejection).map((line) => (
        <span key={line.tone} className={leaveStyles[`balance-${line.tone}`]}>
          {line.text}
        </span>
      )),
    });
  }
  // 결재선 노출 항목이 없는 계급에는 단계가 투영에서 빠진다 — 빈 값 행을 두지 않는다(웨이브 11 D5).
  if (view?.steps && view.steps.length > 0) {
    items.push({ label: "결재선", value: <ApprovalRoute mode="list" steps={routeListSteps(view.steps)} endLines={view.endLines ?? []} /> });
  }

  const amountText = supply ? formatKrw(supply.amountKrw) : null;
  // 06-28(S23): 종결 문서는 결재 상태와 무관하게 낱말 `종결` · 메타 `{번호} · 종결 · {이름} {MM-DD} · {사유}`(사유 전문 + title).
  const closure = expense.closure ?? null;
  const meta = closure ? (
    <>
      {[expense.number, "종결", `${closure.byName} ${closure.on}`.trim()].filter(Boolean).join(" · ")}
      {closure.reason ? (
        <>
          {" · "}
          <span title={closure.reason}>{closure.reason}</span>
        </>
      ) : null}
    </>
  ) : (
    (expense.number ?? undefined)
  );
  const reasonMessages = { empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX };
  const evidenceSection = (review: ReactNode) => (
    <DetailScreen.Section title="증빙" headingId="evidence">
      <div className={styles.evidence}>
        <EvidenceAttachments
          expenseId={id}
          files={files}
          mode="read"
          maxMb={maxMb}
          evidenceActions={evidenceActions}
          privateNotice={privateNotice}
          reasonMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
        />
      </div>
      <EvidenceRecordsSection
        items={linkedEvidence.items}
        lockLine={linkedEvidence.lockLine}
        pick={linkedEvidence.pick}
        number={expense.number ?? null}
        lockLineShownAbove={evidenceActions.drafterLocked || evidenceActions.completedProjectLocked || (!evidenceActions.canAdd && privateNotice !== null)}
      />
      {review}
      <PrepaidReasonLine reason={expense.prepaidReason} />
    </DetailScreen.Section>
  );

  const printLink = view?.instanceId ? (
    <PcOnly>
      <Link href={`/print/expenses/${id}`} target="_blank" rel="noopener" prefetch={false} className={`${buttonStyles.btn} ${buttonStyles.secondary}`}>
        인쇄
      </Link>
    </PcOnly>
  ) : null;
  const secondary = (
    <>
      {printLink}
      {expense.closeDialog ? <CloseExpenseButton expenseId={id} version={expense.version ?? 1} dialog={expense.closeDialog} messages={reasonMessages} /> : null}
    </>
  );

  return (
    <div className={styles.column}>
      <DetailScreen
        title={title}
        status={
          <>
            {closure ? <StatusTag status="종결" /> : expense.number !== null && !view ? null : <StatusTag status={expenseStatusWord(view?.status)} />}
            {/* 07.2-16(PU7 · S12): 상태 배지 뒤 `사후 추인`(목록 · 결재함과 같은 판정 — 서버 postHoc). */}
            {expense.postHoc ? <StatusTag status="사후 추인" variant="text" /> : null}
          </>
        }
        meta={meta}
        // 06-28(S23): 반려 · 회수 문서를 보는 기안자 · 지급 권한자에게만 2차 `종결`(서버 closeDialog) — 결재 통과 문서의 지급 행과 함께 서지 않는다.
        // 07.4-01 D-7409(E1): 결재 인스턴스가 있을 때만 2차 `인쇄` 링크(새 탭 · PC만) — 기존 2차 `종결`의 왼쪽. 1차는 건드리지 않는다.
        actions={printLink || expense.closeDialog ? { secondary: secondary } : undefined}
      >
        <KvList items={items} />
        {!paymentView || paymentView === "error" ? dateChangeHistory : null}
        {paymentView && paymentView !== "error" ? (
          // 06-06: 결재 통과 문서는 패널 상태가 증빙 섹션 확인부(S4)까지 감싼다 — 공급가액 고침 칸 · 1차 확인이 같은 상태를 쓴다(06.5 D-6520 — 문서 공급가를 함께 넘긴다).
          <PaymentPanelProvider view={paymentView} supply={supply}>
            {evidenceSection(<EvidenceReviewBlock waiveSubtitle={[expense.number, target, amountText].filter(Boolean).join(" · ")} />)}
            <PaymentSection
              paymentMethod={expense.paymentMethod ?? null}
              paymentMethodName={expense.paymentMethodName ?? null}
              scheduledPaymentDate={expense.scheduledPaymentDate ?? null}
              scheduleValueProps={scheduleValueProps}
              requested={requested}
            />
            <PaymentActionRow />
          </PaymentPanelProvider>
        ) : (
          <>
            {evidenceSection(null)}
            {paymentView === "error" ? <PaymentLoadError /> : null}
          </>
        )}
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
                  withdrawLines: withdrawResultLines(view.steps),
                }
              : null
          }
          rejectMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
          reasonOptions={reasonOptions}
          resubmit={null}
          resubmitRoute={null}
        />
        {undoToast ? <SubmittedUndoToast expenseId={id} round={undoToast.round} message={undoToast.message} /> : null}
        {toast ? <SubmittedToast message={toast} href={`/expenses/${id}`} /> : null}
        {dateLanding?.kind === "requested" ? <SubmittedToast message="변경 요청 · 경영관리 확인 대기" href={`/expenses/${id}`} /> : null}
        {dateLanding?.kind === "approved" ? (
          <DateApprovedToast expenseId={id} requestId={dateLanding.requestId} newDate={dateLanding.newDate} before={dateLanding.before} version={dateLanding.version} />
        ) : null}
      </DetailScreen>
    </div>
  );
}
