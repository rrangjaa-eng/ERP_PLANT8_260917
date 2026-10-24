import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listBudgetRows, type BudgetListStatus } from "@/domain/projects/budget";
import { PROJECT_COST_RATE_PCT } from "@/domain/settings/keys";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { Num } from "@/ui/num/Num";
// 합계 줄 · 배지는 프로젝트 목록 합계 · 상태 태그와 같은 클래스(새 모양 없음 — SYSTEM §7-3 표 위 합계 줄 · §7-7 PARTIAL).
import totalsStyles from "@/app/(app)/projects/projects.module.css";
import tagStyles from "@/ui/status-tag/StatusTag.module.css";
import { BudgetFilter, BudgetTable } from "./budget-table";
import styles from "./budget.module.css";

// 07-24(SC-21 · W5): 예산 현황 — `projects.budget` 보기 권한자만(없으면 404, 서버 판정). 새 메뉴 없음 — 프로젝트 목록 머리 끝 링크로 들어온다.
// 예산 값은 이 화면 DTO에만 실린다(SC-20). 필터는 GET 쿼리 `status`(기본 진행).
export const dynamic = "force-dynamic";

const LIST_HREF = "/projects/budget";
const VIEW_WORDS: Record<BudgetListStatus, string> = { in_progress: "진행", all: "전체" };

type BudgetSearchParams = Record<string, string | string[] | undefined>;

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function ProjectBudgetPage({ searchParams }: { searchParams: Promise<BudgetSearchParams> }) {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "projects.budget", "view"))) notFound();
  const params = await searchParams;
  const status: BudgetListStatus = first(params.status) === "all" ? "all" : "in_progress";
  const [list, canOpenSettings] = await Promise.all([listBudgetRows(viewer, { status }), can(viewer, "admin.settings", "view")]);

  // D-734: 원가율이 비면 표 대신 잠김 한 줄 + 설정으로 가는 길(설정 보기 권한이 있을 때만). 0은 설정된 값이라 여기 오지 않는다.
  if (!list.costRateSet) {
    return (
      <ListScreen title="예산 현황">
        <ListEmpty
          message="원가율 미설정"
          action={canOpenSettings ? { label: "시스템 설정에서 입력", href: `/admin/settings#setting-${PROJECT_COST_RATE_PCT.key}` } : undefined}
        />
      </ListScreen>
    );
  }

  const showAmount = list.totals !== null;
  const showPo = list.rows.some((row) => row.poAmountKrw !== undefined);
  const filters = <BudgetFilter status={status} options={Object.entries(VIEW_WORDS).map(([value, label]) => ({ value: value as BudgetListStatus, label }))} />;

  if (list.rows.length === 0) {
    return (
      <ListScreen
        title="예산 현황"
        filters={filters}
        empty={
          status === "in_progress" ? (
            <ListEmpty message="예산이 있는 진행 프로젝트가 없습니다" action={{ label: "전체 보기", href: `${LIST_HREF}?status=all` }} />
          ) : (
            <ListEmpty message="예산이 있는 프로젝트가 없습니다" />
          )
        }
      >
        {null}
      </ListScreen>
    );
  }

  const computedCount = list.rows.length - list.uncomputableCount;
  return (
    <ListScreen
      title="예산 현황"
      filters={filters}
      summary={
        <section aria-label="합계" className={totalsStyles.totals}>
          <p className={totalsStyles.totalsTitle}>{`합계 (${VIEW_WORDS[status]} · ${computedCount}건)`}</p>
          {list.totals ? (
            <dl className={totalsStyles.totalsPairs}>
              <div className={totalsStyles.totalsPair}>
                <dt>예산</dt>
                <dd>
                  <Num value={list.totals.budgetKrw} />
                </dd>
              </div>
              <div className={totalsStyles.totalsPair}>
                <dt>사용액</dt>
                <dd>
                  <Num value={list.totals.usedKrw} />
                </dd>
              </div>
              <div className={totalsStyles.totalsPair}>
                <dt>남은 예산</dt>
                <dd>
                  <Num value={list.totals.remainingKrw} />
                </dd>
              </div>
            </dl>
          ) : null}
          {list.uncomputableCount > 0 ? (
            <span className={`${styles.partial} ${tagStyles.base} ${tagStyles.muted} ${tagStyles.tag}`}>{`계산 불가 ${list.uncomputableCount}건`}</span>
          ) : null}
        </section>
      }
    >
      <BudgetTable rows={list.rows} showAmount={showAmount} showPo={showPo} />
    </ListScreen>
  );
}
