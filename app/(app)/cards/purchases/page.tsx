import "@/app/(app)/document-kinds";
import { requireSession } from "@/lib/viewer";
import { seoulToday } from "@/lib/dates";
import { CANCEL_REASON_MAX, CANCEL_REASON_TOO_LONG, listPurchaseRequests, loadPurchaseCompletion, loadPurchaseRequestTeam, purchaseRequestEntry, type PurchaseRequestList, type PurchaseRequestStatusView } from "@/domain/purchase-requests";
import { REJECT_REASON_EMPTY_MESSAGE } from "@/domain/approvals";
import { cardEvidenceDefault } from "@/domain/corp-card-usages/amounts";
import { recentFxRate } from "@/domain/money/currency";
import { formatKrw } from "@/lib/format-number";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { PurchaseCancelPanelAction, PurchaseCancelUndo, PurchaseCancelUndoLine, type PurchaseCancelTarget } from "./cancel-undo";
import { PurchaseFilters, PurchaseList, PurchaseListLoadError, type PurchaseListRowView } from "./purchase-list";
import { PURCHASE_STATUS_VIEWS, type PurchaseStatusView } from "./purchase-status-word";
// 합계 면은 카드 사용 목록 합계와 같은 클래스(새 CSS 없음).
import totalsStyles from "@/app/(app)/projects/projects.module.css";
import { PurchaseRequestForm, type PurchaseEntry } from "./purchase-request-form";
import { CardUsageForm, type CardOption, type CardUsagePurchase } from "../card-usage-form";

// 06-08(EXP-10 · UI-SPEC S11 · S12 · C12): 구매 요청 목록 + 신청 옆 패널. 신청은 `?new=1[&line={id}]`(패널 — 페이지 폼 없음).
// 필터 · 쪽은 GET 쿼리(`status` · `month` · `page`) — 범위 · 쪽은 서버(listPurchaseRequests)가 정한다. 기본 보기 = `신청됨`.
// 06-12(UI-SPEC S13): 구매 완료 = `?purchase={id}` 옆 패널(S9 칸 재사용 `card-usage-form.tsx` 구매 완료 모드). 성공 뒤 `?done={id}`로
// 그 행을 상태 보기와 무관하게 제자리에 남긴다(제자리 결과 — 토스트 없음).
// WR-07: 인증 검사를 이 페이지가 직접 한다(레이아웃에 기대지 않는다).
export const dynamic = "force-dynamic";

const LIST_HREF = "/cards/purchases";
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_VIEW: PurchaseStatusView = "신청됨";

const STATUS_BY_VIEW: Record<PurchaseStatusView, PurchaseRequestStatusView> = {
  신청됨: "requested",
  "구매 완료": "purchased",
  취소: "cancelled",
  전체: "all",
};

type PurchasesSearchParams = Record<string, string | string[] | undefined>;

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

// 월 필터 선택지 — 이번 달부터 12달 + 쿼리로 온 다른 달.
function monthChoices(thisMonth: string, selected: string): string[] {
  const [year, month] = thisMonth.split("-").map(Number) as [number, number];
  const months = Array.from({ length: 12 }, (_, back) => {
    const index = year * 12 + (month - 1) - back;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
  return selected === "" || months.includes(selected) ? months : [...months, selected].sort().reverse();
}

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<PurchasesSearchParams> }) {
  const { viewer } = await requireSession();
  const params = await searchParams;
  const today = seoulToday();
  const statusParam = first(params.status);
  const view = PURCHASE_STATUS_VIEWS.find((value) => value === statusParam) ?? DEFAULT_VIEW;
  const monthParam = first(params.month);
  const month = monthParam && MONTH_PATTERN.test(monthParam) ? monthParam : "";
  const filtered = view !== DEFAULT_VIEW || month !== "";
  const doneParam = first(params.done);
  const doneId = doneParam && UUID_PATTERN.test(doneParam) ? doneParam : null;

  let list: PurchaseRequestList | null = null;
  try {
    list = await listPurchaseRequests(viewer, { status: STATUS_BY_VIEW[view], month: month || null, page: first(params.page), keepId: doneId }, today);
  } catch (error) {
    // 목록 자리 한 줄 + `다시 시도`(UI-SPEC 「Error — 목록 로드」) — 화면의 나머지(머리 · 1차)는 선다.
    console.error(error);
  }
  const rows: PurchaseListRowView[] = (list?.rows ?? []).flatMap((row) =>
    row.id && row.number && row.requestedOn && row.itemName !== undefined && row.status
      ? [
          {
            id: row.id,
            number: row.number,
            requestedOn: row.requestedOn,
            itemName: row.itemName,
            linkUrl: row.linkUrl ?? null,
            linkLabel: row.linkLabel ?? null,
            requestedByName: row.requestedByName ?? "—",
            status: row.status,
            currency: row.currency ?? null,
            foreignAmount: row.foreignAmount ?? null,
            fxRate: row.fxRate ?? null,
            estimateKrw: row.estimateKrw ?? null,
            usageUsedOn: row.usageUsedOn ?? null,
            usageTotalKrw: row.usageTotalKrw ?? null,
            version: row.version ?? 0,
            cancelledOn: row.cancelledOn ?? null,
            cancelledByName: row.cancelledByName ?? null,
            cancelReason: row.cancelReason ?? null,
            cancelBranch: list?.cancelBranches[row.id] ?? null,
          },
        ]
      : [],
  );

  const pageHref = (target: number): string => {
    const query = new URLSearchParams();
    if (view !== DEFAULT_VIEW) query.set("status", view);
    if (month) query.set("month", month);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `${LIST_HREF}?${text}` : LIST_HREF;
  };
  // 패널 닫기 · 1차는 지금 필터의 /cards/purchases(쪽은 1로) — 뒤 목록이 바뀌지 않는다.
  const listHref = pageHref(1);
  const newHref = `${listHref}${listHref.includes("?") ? "&" : "?"}new=1`;

  let panel = null;
  const purchaseParam = first(params.purchase);
  const completion = purchaseParam ? await loadPurchaseCompletion(viewer, purchaseParam, today) : null;
  const request = completion?.request;
  if (completion && request?.id && request.number && request.version !== undefined && request.linkKind) {
    const cards: CardOption[] = completion.options.cards.flatMap((card) => (card.id && card.label ? [{ id: card.id, label: card.label }] : []));
    const merchant =
      completion.merchant?.id && completion.merchant.name
        ? { id: completion.merchant.id, name: completion.merchant.name, defaultEvidenceType: completion.merchant.defaultEvidenceType ?? null, defaultEvidenceName: completion.merchant.defaultEvidenceName ?? null }
        : null;
    const evidenceTypeCode = cardEvidenceDefault(merchant?.defaultEvidenceType ?? null, completion.options.evidenceTypes.map((option) => option.value)).code;
    const purchase: CardUsagePurchase = {
      requestId: request.id,
      version: request.version,
      number: request.number,
      itemName: request.itemName ?? "",
      linkUrl: request.linkUrl ?? null,
      requesterName: request.requestedByName ?? "",
      merchant,
      currency: request.currency === "USD" ? "USD" : "KRW",
      amount: request.amount ?? null,
      fxRate: request.fxRate ?? null,
      statusReason: completion.statusReason,
      doneHref: `${listHref}${listHref.includes("?") ? "&" : "?"}done=${request.id}`,
    };
    const quoteLine = request.linkKind === "quote_line";
    // 폰 S13 패널의 `요청 취소`(06-14 I-1) — 행 `요청 취소`와 같은 대상 모양. 서버가 취소 갈래를 준 사람에게만 서고, 확인 창 부제 금액은 못 보면 빠진다.
    const cancelTarget: PurchaseCancelTarget | null = completion.cancelBranch
      ? {
          id: request.id,
          number: request.number,
          version: request.version,
          itemName: request.itemName ?? "",
          branch: completion.cancelBranch,
          quoteLinked: quoteLine,
          estimateText: request.estimateKrw === undefined ? null : formatKrw(request.estimateKrw),
        }
      : null;
    panel = (
      // 열린 대상별 key(06-12 검토 I-2) — 닫기 이동 도중 다른 행의 패널을 열어도 닫힌 SidePanel이 재사용되지 않는다.
      <SidePanel key={`purchase-${request.id}`} title="구매 완료" closeHref={listHref}>
        <CardUsageForm
          cards={cards}
          evidenceTypes={completion.options.evidenceTypes}
          teamName={completion.teamName}
          teamAssigned={completion.teamAssigned}
          userName={request.requestedByName ?? ""}
          today={today}
          usdFxRate={completion.options.usdFxRate}
          defaults={{
            usedOn: today,
            corpCardId: cards.length === 1 ? (cards[0]?.id ?? null) : null,
            linkKind: quoteLine ? "quote_line" : "team_cost",
            // 연결은 요청의 것 — 읽기 텍스트(바꾸기 없음). 줄 id는 보내지 않는다(서버가 요청에서 읽는다).
            project: quoteLine ? { id: "", label: request.projectLabel ?? "—" } : null,
            line: quoteLine ? { id: "", itemName: request.lineItemName ?? "—", remainingKrw: null, hint: null } : null,
            evidenceTypeCode,
          }}
          purchase={purchase}
          purchaseCancel={cancelTarget ? <PurchaseCancelPanelAction target={cancelTarget} /> : null}
        />
      </SidePanel>
    );
  } else if (first(params.new) === "1") {
    // 진입 줄(S14 · S18 `?line=`) — 고를 수 있는 프로젝트의 줄이면 연결을 텍스트로 채운다. 아니면 연결은 패널 안에서 고른다.
    const entryLine = first(params.line);
    const chosen = entryLine && UUID_PATTERN.test(entryLine) ? await purchaseRequestEntry(viewer, entryLine) : null;
    const entry: PurchaseEntry | null = chosen ? { project: chosen.project, line: chosen.line } : null;
    panel = (
      <SidePanel key="new" title="구매 요청" closeHref={listHref}>
        <PurchaseRequestForm entry={entry} team={await loadPurchaseRequestTeam(viewer, today)} usdFxRate={await recentFxRate("USD").catch(() => null)} />
      </SidePanel>
    );
  }

  const newAction = { label: "구매 요청", href: newHref };
  const filters = list ? <PurchaseFilters status={view} month={month} months={monthChoices(today.slice(0, 7), month)} /> : undefined;

  let empty = undefined;
  let body;
  if (!list) body = <PurchaseListLoadError />;
  else if (rows.length > 0)
    body = (
      <>
        <PurchaseCancelUndoLine />
        <PurchaseList rows={rows} listHref={listHref} canComplete={list.privileged} doneId={doneId} groupByStatus={view === "전체"} />
      </>
    );
  else if (!list.anyInScope) {
    // DR5 — 빈 목록이면 틀이 머리 1차를 숨기고 빈 화면이 말한다. 전체 0건 갈래.
    empty = <ListEmpty message="구매 요청이 없습니다" action={newAction} />;
    body = null;
  } else if (!filtered) {
    // 기본 보기(신청됨) 0건 — 구매 권한자는 처리할 것이 없다는 말 + 전체 보기, 요청자는 신청 행동.
    // 마지막 신청 건을 취소해 이 갈래가 되어도 결과 줄 `되돌리기`가 남는다(상태는 화면 전체를 감싼 PurchaseCancelUndo).
    empty = (
      <>
        <PurchaseCancelUndoLine />
        {list.privileged ? (
          <ListEmpty message="처리할 구매 요청이 없습니다" action={{ label: "전체 보기", href: `${LIST_HREF}?status=${encodeURIComponent("전체")}` }} />
        ) : (
          <ListEmpty message="신청한 구매 요청이 없습니다" action={newAction} />
        )}
      </>
    );
    body = null;
  } else {
    body = (
      <>
        <PurchaseCancelUndoLine />
        <ListEmpty message="조건에 맞는 구매 요청이 없습니다" action={{ label: "필터 지우기", href: LIST_HREF }} />
      </>
    );
  }

  // 결과 줄은 필터 · 월 · 쪽이 바뀌면 사라진다(key) — 패널을 열고 닫는 것(`?new=1` · `?purchase=`)은 목록을 바꾸지 않아 남는다.
  const undoKey = [view, month, list?.page.page ?? 1].join("|");
  return (
    <PurchaseCancelUndo key={undoKey} messages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: CANCEL_REASON_TOO_LONG, max: CANCEL_REASON_MAX }}>
      <ListScreen
        title="구매 요청"
        primaryAction={newAction}
        filters={filters}
        summary={
          list && list.totals.count > 0 ? (
            <section aria-label="합계" className={totalsStyles.totals}>
              <p className={totalsStyles.totalsTitle}>{`합계 (${view} · ${list.totals.count}건)`}</p>
              {list.totals.estimateKrw === null ? null : (
                <dl className={totalsStyles.totalsPairs}>
                  <div className={totalsStyles.totalsPair}>
                    <dt>예상 금액</dt>
                    <dd>
                      <Num value={list.totals.estimateKrw} />
                    </dd>
                  </div>
                </dl>
              )}
            </section>
          ) : undefined
        }
        empty={empty}
        pagination={
          list && rows.length > 0 ? (
            <Pagination
              label="구매 요청"
              page={list.page.page}
              pageCount={list.page.pageCount}
              href={pageHref}
              rangeText={pageRangeText({ page: list.page.page, pageSize: list.page.pageSize, total: list.page.total, unit: "건" })}
            />
          ) : undefined
        }
        panel={panel}
      >
        {body}
      </ListScreen>
    </PurchaseCancelUndo>
  );
}
