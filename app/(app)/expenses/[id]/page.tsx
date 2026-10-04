import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import "@/app/(app)/document-kinds";
import { getApprovalView, previewRoute, RouteBlockedError } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND, getExpense, listExpenseCurrencies, listExpenseFormOptions } from "@/domain/expenses";
import { listEvidence } from "@/domain/evidence";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_MAX_SIZE_MB } from "@/domain/settings/keys";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ApprovalRoute } from "@/ui/approval-route/ApprovalRoute";
import type { AttachmentFile } from "@/ui/attachments/Attachments";
import type { SelectOption } from "@/ui/select/Select";
import { expenseStatusWord } from "../status-display";
import { ExpenseDocument } from "./expense-document";
import { ExpenseForm } from "./expense-form";
import styles from "./expense.module.css";

// 05-05(S3 · S7): 인스턴스(결재)가 없는 작성 중 문서는 폼, 그 밖은 문서 화면. 볼 수 없는 사람은 404(`layout.tsx`가 응답 전에 먼저 판정한다 —
// 여기서는 같은 읽기를 다시 해 null이면 404). 바깥 틀은 둘 다 `DetailScreen`이다. 세션 검사는 이 페이지가 직접 한다(WR-07).
export const dynamic = "force-dynamic";

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const { viewer } = await requireSession();
  const { id } = await params;
  const { submitted } = await searchParams;
  const expense = await getExpense(viewer, { expenseId: id });
  if (!expense) notFound();

  const [evidence, maxMb] = await Promise.all([listEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: id }), getSettingValue(EVIDENCE_MAX_SIZE_MB)]);
  const files: AttachmentFile[] = evidence.flatMap((file) =>
    file.id && file.originalName && !file.voidedAt && file.createdAt
      ? [{ id: file.id, name: file.originalName, sizeBytes: file.sizeBytes ?? 0, createdAt: new Date(file.createdAt).toISOString() }]
      : [],
  );

  const view = await getApprovalView(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id });
  if (view || expense.number) {
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
  const optionsOf = (items: { value: string; label: string; description: string | null }[], current: string | null | undefined, currentLabel: string | null | undefined): SelectOption[] => {
    const options = items.map((item) => ({ value: item.value, label: item.label, description: item.description }));
    // 이미 저장된 값이 비활성 · 보관된 코드면 목록에 없다 — 그 값을 이름으로 남겨 둔다.
    if (current && !options.some((option) => option.value === current)) options.push({ value: current, label: currentLabel ?? current, description: null });
    return options;
  };
  const supply = expense.supply ?? null;
  const target = [expense.projectName, expense.itemName].filter(Boolean).join(" · ");
  const skipped = route?.steps.filter((step) => step.skipped).map((step) => `${step.label ?? ""} 단계 건너뜀(자기 승인 없음)`) ?? [];

  return (
    <div className={styles.column}>
      <DetailScreen title={target ? `지출결의 — ${target}` : "지출결의"} status={<StatusTag status={expenseStatusWord(null)} />}>
        <ExpenseForm
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
          }}
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
      </DetailScreen>
    </div>
  );
}
