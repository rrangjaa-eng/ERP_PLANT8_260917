import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import "@/app/(app)/document-kinds";
import { getApprovalView, previewRoute, RouteBlockedError } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND, ExpenseNotFoundError, getExpense, listExpenseCurrencies, listExpenseFormOptions, previewExpense } from "@/domain/expenses";
import { teamKindOptions } from "../team-kind-options";
import { listEvidence } from "@/domain/evidence";
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

  const [evidence, maxMb] = await Promise.all([listEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: id }), getSettingValue(EVIDENCE_MAX_SIZE_MB)]);
  const files: AttachmentFile[] = evidence.flatMap((file) =>
    file.id && file.originalName && !file.voidedAt && file.createdAt
      ? [{ id: file.id, name: file.originalName, sizeBytes: file.sizeBytes ?? 0, createdAt: new Date(file.createdAt).toISOString() }]
      : [],
  );

  // 문서 보임(getExpense = canSeeExpense)이 위에서 통과했다 — 결재 당사자가 아닌 팀장 · 전사 보는 사람도 상태 · 결재선을 읽기만 한다(05-08 검토 #1).
  const view = await getApprovalView(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id, readOnlyVisible: true });
  const resubmitting = Boolean(view?.actions?.includes("resubmit"));
  if ((view || expense.number) && !resubmitting) {
    return <ExpenseDocument expense={expense} view={view} files={files} maxMb={maxMb} submitted={submitted} />;
  }

  // 작성 중 — 폼. 결재선은 제출 전 한 줄(기안자 · 문서 종류의 결재선 설정으로 해석 — 막히면 이유 한 줄).
  let route = null;
  let routeBlocked: string | null = null;
  try {
    route = await previewRoute(viewer, { kind: EXPENSE_DOCUMENT_KIND });
  } catch (error) {
    if (!(error instanceof RouteBlockedError)) throw error;
    routeBlocked = error.message;
  }
  // 선택지는 지출결의 쓰기 권한으로 받는다(코드표 메뉴가 없는 PM도 증빙 종류를 바꿀 수 있다 — 05-06).
  const [{ evidence: evidenceItems, payment: paymentItems }, currencies] = await Promise.all([listExpenseFormOptions(viewer), listExpenseCurrencies()]);
  // 제출 막힘 첫 이유(05-06 규칙 `expense.submit`) — 저장값 그대로의 미리보기. 기안자가 아니면 막힘을 판정하지 않는다(그 사람은 제출할 수 없다).
  const initialBlock = await previewExpense(viewer, { expenseId: id, fields: {} }).then(
    (preview) => preview.block ?? null,
    (error: unknown) => {
      if (error instanceof ExpenseNotFoundError) return null;
      throw error;
    },
  );
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
    readRows.push({ label: "회수", value: line ? line.text.slice("회수 ".length) : "" });
  } else if (resubmitting && view?.status === "rejected") {
    const rejected = view.steps?.find((step) => step.state === "rejected");
    readRows.push({
      label: "반려",
      value: (
        <>
          {[rejected?.actedByName, rejected?.actedAt ? seoulMinuteOf(rejected.actedAt) : null].filter(Boolean).join(" · ")}
          {rejected?.reason ? <span className={styles.subLine}>사유 · {rejected.reason}</span> : null}
        </>
      ),
    });
  }

  return (
    <div className={styles.column}>
      <DetailScreen
        title={target ? `지출결의 — ${target}` : "지출결의"}
        status={<StatusTag status={expenseStatusWord(resubmitting ? view?.status : null)} />}
        meta={resubmitting && expense.number ? <Num value={expense.number} /> : undefined}
        // 작성 중(번호 없음 — 기안자만 보는 문서)에만 머리 줄 2차 `지출결의 삭제`. 1차는 폼의 제출이다.
        actions={resubmitting ? undefined : { secondary: <DeleteDraftButton expenseId={id} version={expense.version ?? 1} /> }}
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
