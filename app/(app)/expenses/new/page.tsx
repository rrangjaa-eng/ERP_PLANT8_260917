import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import "@/app/(app)/document-kinds";
import { previewRoute, RouteBlockedError } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND, getNewExpenseDefaults, listExpenseCurrencies, listExpenseFormOptions } from "@/domain/expenses";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_MAX_SIZE_MB } from "@/domain/settings/keys";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ApprovalRoute } from "@/ui/approval-route/ApprovalRoute";
import { teamKindOptions } from "../team-kind-options";
import { ExpenseForm } from "../[id]/expense-form";
import { NEW_DOC_BLOCK } from "../[id]/submit-block";
import styles from "../[id]/expense.module.css";

// 05-07(S3 두 입구): `/expenses/new` — 견적 줄을 고르지 않으면 팀 비용 지출결의다. 문서는 첫 저장(임시 저장 · 증빙 올리기)에서 만들어지고 주소가
// `/expenses/[id]`로 바뀐다. 쓰기 권한이 없으면 404. 틀은 05-05 폼과 같다(`DetailScreen` + `Form layout="page"`), 작성 전이라 상태 배지 · 번호가 없다.
export const dynamic = "force-dynamic";

export default async function NewExpensePage() {
  const { viewer } = await requireSession();
  const defaults = await getNewExpenseDefaults(viewer);
  if (!defaults) notFound();

  let route = null;
  let routeBlocked: string | null = null;
  try {
    route = await previewRoute(viewer, { kind: EXPENSE_DOCUMENT_KIND });
  } catch (error) {
    if (!(error instanceof RouteBlockedError)) throw error;
    routeBlocked = error.message;
  }
  const [{ evidence, payment }, currencies, maxMb] = await Promise.all([listExpenseFormOptions(viewer), listExpenseCurrencies(), getSettingValue(EVIDENCE_MAX_SIZE_MB)]);
  const options = (items: { value: string; label: string; description: string | null }[]) => items.map((item) => ({ value: item.value, label: item.label, description: item.description }));
  const skipped = route?.steps.filter((step) => step.skipped).map((step) => `${step.label ?? ""} 단계 건너뜀(자기 승인 없음)`) ?? [];

  return (
    <div className={styles.column}>
      <DetailScreen title={defaults.teamName ? `지출결의 — ${defaults.teamName}` : "지출결의"}>
        <ExpenseForm
          data={{
            id: "",
            version: 0,
            vendorName: null,
            defaultEvidenceName: null,
            lineText: null,
            executionLines: [],
            evidenceType: null,
            paymentMethod: null,
            currency: "KRW",
            amount: null,
            fxRate: currencies.find((item) => item.value === "KRW")?.fxRate ?? 1,
            scheduledPaymentDate: null,
            note: null,
            installment: false,
            installmentMode: "none",
            installmentText: null,
            taxLine: null,
            block: NEW_DOC_BLOCK,
            team: { kind: null, usageDate: defaults.usageDate ?? "", content: null, teamName: defaults.teamName ?? null, usageDateError: defaults.usageDateError ?? null },
          }}
          newDoc
          evidenceOptions={options(evidence)}
          paymentOptions={options(payment)}
          teamKindOptions={teamKindOptions()}
          currencies={currencies}
          files={[]}
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
