import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import "@/app/(app)/document-kinds";
import { getApprovalView, previewRoute, REJECT_REASON_EMPTY_MESSAGE, REJECT_REASON_MAX, REJECT_REASON_TOO_LONG_MESSAGE, RouteBlockedError } from "@/domain/approvals";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { EXPENSE_DOCUMENT_KIND, ExpenseNotFoundError, getExpense, listExpenseCurrencies, listExpenseFormOptions, previewExpense } from "@/domain/expenses";
import { previewExpenseRoute } from "@/domain/expenses/route-doc";
import { canOpenProject } from "@/domain/projects/visibility";
import { teamKindOptions } from "../team-kind-options";
import { getEvidenceActions, listEvidence } from "@/domain/evidence";
import { getPaymentView } from "@/domain/payments";
import { log } from "@/lib/log";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_MAX_SIZE_MB } from "@/domain/settings/keys";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ApprovalRoute } from "@/ui/approval-route/ApprovalRoute";
import type { AttachmentFile } from "@/ui/attachments/Attachments";
import type { SelectOption } from "@/ui/select/Select";
import { expenseStatusWord } from "../status-display";
import { seoulMinuteOf } from "@/app/(app)/leave/status-display";
import { SubmittedToast } from "@/app/(app)/leave/[id]/submitted-toast";
import { ExpenseDocument } from "./expense-document";
import { DeleteDraftButton } from "./delete-draft-button";
import { CloseExpenseButton } from "./close-expense-button";
import { ExpenseForm } from "./expense-form";
import styles from "./expense.module.css";

// 05-05(S3 · S7): 인스턴스(결재)가 없는 작성 중 문서는 폼, 그 밖은 문서 화면. 05-09: 반려 · 회수된 내 문서(가능 행동에 다시 신청)도 폼 —
// 머리 줄 상태 `반려` · `회수` · 메타 번호, 맨 위 읽기 행(`KvList`), 1차 `지출결의 다시 제출`(같은 번호). 볼 수 없는 사람은 404(`layout.tsx`가 응답 전에 먼저 판정한다 —
// 여기서는 같은 읽기를 다시 해 null이면 404). 바깥 틀은 둘 다 `DetailScreen`이다. 세션 검사는 이 페이지가 직접 한다(WR-07).
export const dynamic = "force-dynamic";

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string; undone?: string }> }) {
  const { viewer } = await requireSession();
  const { id } = await params;
  const { submitted, undone } = await searchParams;
  const expense = await getExpense(viewer, { expenseId: id });
  if (!expense) notFound();

  // 문서 보임(getExpense = canSeeExpense)이 위에서 통과했다 — 결재 당사자가 아닌 팀장 · 전사 보는 사람도 상태 · 결재선을 읽기만 한다(05-08 검토 #1).
  const [evidence, maxMb, view, canWrite] = await Promise.all([
    listEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: id }),
    getSettingValue(EVIDENCE_MAX_SIZE_MB),
    getApprovalView(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id, readOnlyVisible: true }),
    can(viewer, "expenses", "write"),
  ]);
  const files: AttachmentFile[] = evidence.flatMap((file) =>
    file.id && file.originalName && !file.voidedAt && file.createdAt
      ? [{ id: file.id, name: file.originalName, sizeBytes: file.sizeBytes ?? 0, createdAt: new Date(file.createdAt).toISOString() }]
      : [],
  );

  const resubmitting = Boolean(view?.actions?.includes("resubmit"));
  // 05 /review C1: 지출결의 쓰기 권한이 빠진 기안자는 자기 작성 중 문서도 폼(저장 · 제출)이 아니라 문서 화면으로 읽는다(다시 제출도 쓰기 권한이 연다).
  if ((view || expense.number || !canWrite) && !resubmitting) {
    // 05-09: 문서 화면은 무효 행도 그린다(처리자 · 시각 · 사유) — 파일 행 3차는 서버가 정한 evidenceActions대로.
    // 06-03: 지급 섹션은 결재 통과(approved — 자기 승인 포함, UA-607) 문서만. view가 null(05 C1 — 쓰기 권한 없는 기안자의 번호 없는 작성 중 문서)이거나
    // 통과 전이면 부르지 않는다(섹션 요소 0 · 오류 화면 없음).
    // 06.2-09(S6 · D-6206): 프로젝트 칸 링크는 서버가 「열 수 있음」을 판정한 때만 — 결재 차례로 문서만 보이는 사람에게 죽은 링크를 그리지 않는다.
    const [evidenceActions, paymentView, projectOpenable] = await Promise.all([
      getEvidenceActions(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: id }),
      view?.status === "approved"
        ? getPaymentView(viewer, id).catch((error: unknown) => {
            // C13: 결재 통과인데 못 읽으면 섹션 자리에 로드 오류 한 줄 + 다시 시도(문서 화면 전체를 오류로 바꾸지 않는다).
            log.error("expense.payment_view_failed", { expenseId: id, message: error instanceof Error ? error.message : String(error) });
            return "error" as const;
          })
        : null,
      expense.projectId ? canOpenProject(viewer, expense.projectId) : false,
    ]);
    const documentFiles: AttachmentFile[] = evidence.flatMap((file) =>
      file.id && file.originalName && file.createdAt
        ? [
            {
              id: file.id,
              name: file.originalName,
              sizeBytes: file.sizeBytes ?? 0,
              createdAt: new Date(file.createdAt).toISOString(),
              ...(file.voidedAt
                ? { voided: { byName: file.voidedByName ?? null, at: new Date(file.voidedAt).toISOString(), reason: file.voidReason ?? null } }
                : {}),
            },
          ]
        : [],
    );
    return <ExpenseDocument expense={expense} view={view} files={documentFiles} evidenceActions={evidenceActions} maxMb={maxMb} submitted={submitted} paymentView={paymentView} projectOpenable={projectOpenable} />;
  }

  // 작성 중 — 폼. 결재선은 제출 전 한 줄(기안자 · 문서 종류의 결재선 설정으로 해석 — 막히면 이유 한 줄).
  // 서로 기대지 않는 읽기 넷을 동시에(05 /review A13).
  const [{ route, routeBlocked }, { evidence: evidenceItems, payment: paymentItems, prepaidDueDays }, currencies, initialBlock] = await Promise.all([
    // 06.2-09(S5 · D-6215 · D-6224): 작성 중 문서는 문서 팀으로 담당자를 푼다 — 기안자가 아니거나 쓰기 권한이 없으면 문서 팀을 풀지 않는다(단계 이름만).
    previewExpenseRoute(viewer, { expenseId: id })
      .catch((error: unknown) => {
        if (error instanceof ExpenseNotFoundError || error instanceof ForbiddenError) return previewRoute(viewer, { kind: EXPENSE_DOCUMENT_KIND });
        throw error;
      })
      .then(
        (preview) => ({ route: preview, routeBlocked: null }),
        (error: unknown) => {
          if (!(error instanceof RouteBlockedError)) throw error;
          return { route: null, routeBlocked: error.message };
        },
      ),
    // 선택지는 지출결의 쓰기 권한으로 받는다(코드표 메뉴가 없는 PM도 증빙 종류를 바꿀 수 있다 — 05-06).
    listExpenseFormOptions(viewer),
    listExpenseCurrencies(),
    // 제출 막힘 첫 이유(05-06 규칙 `expense.submit`) — 저장값 그대로의 미리보기. 기안자가 아니면 막힘을 판정하지 않는다(그 사람은 제출할 수 없다).
    previewExpense(viewer, { expenseId: id, fields: {} }).then(
      (preview) => preview.block ?? null,
      (error: unknown) => {
        if (error instanceof ExpenseNotFoundError) return null;
        throw error;
      },
    ),
  ]);
  const optionsOf = (items: { value: string; label: string; description: string | null }[], current: string | null | undefined, currentLabel: string | null | undefined): SelectOption[] => {
    const options = items.map((item) => ({ value: item.value, label: item.label, description: item.description }));
    // 이미 저장된 값이 비활성 · 보관된 코드면 목록에 없다 — 그 값을 이름으로 남겨 둔다.
    if (current && !options.some((option) => option.value === current)) options.push({ value: current, label: currentLabel ?? current, description: null });
    return options;
  };
  const supply = expense.supply ?? null;
  // 팀 비용 문서(프로젝트 · 견적 줄 없음) — 사용일은 팀 비용 문서에만 있다(견적 줄 문서는 null).
  const isTeam = Boolean(expense.usageDate);
  const target = isTeam ? [expense.teamName, expense.content].filter(Boolean).join(" · ") : [expense.projectName, expense.itemName].filter(Boolean).join(" · ");
  const skipped = route?.steps.filter((step) => step.skipped).map((step) => `${step.label ?? ""} 단계 건너뜀(자기 승인 없음)`) ?? [];

  // 반려 · 회수 읽기 행 — 회수는 회수 시각(결재선 끝 줄과 같은 값), 반려는 처리자 · 시각 + 2행 사유 원문(연차 문서 화면 선례).
  const readRows: KvItem[] = [];
  if (resubmitting && view?.status === "withdrawn") {
    const line = view.endLines?.find((end) => end.text.startsWith("회수 "));
    if (line) readRows.push({ label: "회수", value: line.text.slice("회수 ".length) });
  } else if (resubmitting && view?.status === "rejected") {
    const rejected = view.steps?.find((step) => step.state === "rejected");
    const actedLine = [rejected?.actedByName, rejected?.actedAt ? seoulMinuteOf(rejected.actedAt) : null].filter(Boolean).join(" · ");
    if (actedLine || rejected?.reason) {
      readRows.push({
        label: "반려",
        value: (
          <>
            {actedLine}
            {rejected?.reason ? <span className={styles.subLine}>사유 · {rejected.reason}</span> : null}
          </>
        ),
      });
    }
  }

  return (
    <div className={styles.column}>
      <DetailScreen
        title={target ? `지출결의 — ${target}` : "지출결의"}
        status={<StatusTag status={expenseStatusWord(resubmitting ? view?.status : null)} />}
        meta={resubmitting && expense.number ? <Num value={expense.number} /> : undefined}
        // 작성 중(번호 없음 — 기안자만 보는 문서)에만 머리 줄 2차 `지출결의 삭제`. 1차는 폼의 제출이다.
        // 06-28(S23): 반려 · 회수 폼에는 서버가 종결 모달 재료(closeDialog)를 실었을 때만 2차 `종결` — 1차는 폼의 다시 제출 그대로.
        actions={
          resubmitting
            ? expense.closeDialog
              ? {
                  secondary: (
                    <CloseExpenseButton
                      expenseId={id}
                      version={expense.version ?? 1}
                      dialog={expense.closeDialog}
                      messages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
                    />
                  ),
                }
              : undefined
            : { secondary: <DeleteDraftButton expenseId={id} version={expense.version ?? 1} /> }
        }
      >
        {readRows.length > 0 ? <KvList items={readRows} /> : null}
        <ExpenseForm
          key={expense.quoteLineId ?? expense.itemName ?? "team"}
          data={{
            id,
            version: expense.version ?? 1,
            vendorName: expense.vendorName ?? null,
            defaultEvidenceName: expense.defaultEvidenceName ?? null,
            lineText: expense.itemName ? [expense.lineNo, expense.itemName].filter(Boolean).join(" ") : null,
            executionLines: expense.executionLines ?? [],
            evidenceType: expense.evidenceType ?? null,
            paymentMethod: expense.paymentMethod ?? null,
            currency: supply?.currency ?? "KRW",
            amount: supply?.amount ?? null,
            fxRate: supply?.fxRate ?? currencies.find((item) => item.value === (supply?.currency ?? "KRW"))?.fxRate ?? 1,
            scheduledPaymentDate: expense.scheduledPaymentDate ?? null,
            note: expense.note ?? null,
            installment: expense.installment ?? false,
            installmentMode: expense.installmentMode ?? "none",
            installmentText: expense.installmentText ?? null,
            taxLine: expense.taxLine ?? null,
            prepaid: expense.prepaid ?? false,
            prepaidReason: expense.prepaidReason ?? null,
            evidenceAmountKrw: expense.evidenceAmountKrw ?? null,
            evidenceDate: expense.evidenceDate ?? null,
            prepaidDueDays,
            block: initialBlock,
            team: isTeam
              ? {
                  kind: expense.teamExpenseKind ?? null,
                  usageDate: expense.usageDate ?? "",
                  content: expense.content ?? null,
                  teamName: expense.teamName ?? null,
                  usageDateError: null,
                }
              : null,
          }}
          newDoc={false}
          resubmit={resubmitting}
          teamKindOptions={teamKindOptions()}
          evidenceOptions={optionsOf(evidenceItems, expense.evidenceType, expense.evidenceTypeName)}
          paymentOptions={optionsOf(paymentItems, expense.paymentMethod, expense.paymentMethodName)}
          currencies={currencies}
          files={files}
          maxMb={maxMb}
          route={
            route ? (
              <ApprovalRoute
                mode="line"
                drafter={route.drafterName ?? ""}
                steps={route.steps.filter((step) => !step.skipped).map((step) => ({ person: step.holderNames ?? "", label: step.label ?? "" }))}
                skippedNote={skipped.join(" · ") || null}
              />
            ) : routeBlocked ? (
              <span className={styles.blockedReason}>{routeBlocked}</span>
            ) : null
          }
        />
        {undone === "1" && resubmitting ? <SubmittedToast message="되돌리기 · 결재 멈춤" href={`/expenses/${id}`} /> : null}
      </DetailScreen>
    </div>
  );
}
