import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { countOpenPurchaseRequests } from "@/domain/purchase-requests";
import { seoulToday } from "@/lib/dates";
import {
  CARD_USAGE_ENTITY,
  cardUsageFormDefaults,
  cardUsageFormOptions,
  listCardUsages,
  loadCardUsageForEdit,
  type CardOptionDto,
  type CardUsageEditDto,
  type CardUsageLinkFilter,
  type CardUsageList as CardUsageListResult,
} from "@/domain/corp-card-usages";
import { getOwnedEvidence } from "@/domain/evidence";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_MAX_SIZE_MB } from "@/domain/settings/keys";
import type { AttachmentFile } from "@/ui/attachments/Attachments";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { Num } from "@/ui/num/Num";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { SidePanel } from "@/ui/side-panel/SidePanel";
// 합계 면 한 줄 배치는 프로젝트 목록 합계 줄과 같은 클래스(새 CSS 없음).
import styles from "@/app/(app)/projects/projects.module.css";
import { CardUsageFilters, CardUsageList, CardUsageLoadError, type CardUsageListRowView } from "./card-usage-list";
import { CardUsageDeleteUndo, CardUsageUndoLine } from "./delete-undo";
import { CardUsageEditPanel, CardUsageForm, CardUsageFromEvidencePanel, type CardEvidencePick, type CardSlipArea, type CardUsageEdit, type CardUsageFromEvidence } from "./card-usage-form";
import { countEvidencePool, evidencePickerMode } from "@/domain/evidence-records/pool";
import { cardUsagePrefillFromEvidence } from "@/domain/evidence-records/attach";

// 06-05(EXP-07 · UI-SPEC S8 · S9 · C12): 법인카드 사용 목록 = 원장. 한 건 등록은 `?new=1` 옆 패널(페이지 폼 없음).
// 필터 · 쪽은 GET 쿼리(`month` · `card` · `link` · `via` · `page`) — 범위 · 합계 · 쪽은 서버(listCardUsages)가 정한다.
// WR-07: 인증 검사를 이 페이지가 직접 한다(레이아웃에 기대지 않는다).
export const dynamic = "force-dynamic";

const LIST_HREF = "/cards";
const CARD_RECEIPT = "card_receipt";
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_FILTERS: readonly CardUsageLinkFilter[] = ["quote", "out_of_quote", "team"];

type CardsSearchParams = Record<string, string | string[] | undefined>;

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
  return months.includes(selected) ? months : [...months, selected].sort().reverse();
}

// 수정 패널 재료 — 서버가 투영한 건(값을 못 보는 칸은 빈다)을 폼의 평범한 값으로.
function toEditView(usage: Partial<CardUsageEditDto>, changeLink: boolean, cardOptions: Partial<CardOptionDto>[] | null): CardUsageEdit | null {
  if (!usage.id || usage.version === undefined || !usage.cardId || !usage.usedOn || !usage.linkKind || !usage.usedByUserId) return null;
  return {
    id: usage.id,
    version: usage.version,
    number: usage.number ?? null,
    cardId: usage.cardId,
    cardText: usage.cardText ?? "",
    proxyHint: usage.proxyHint ?? null,
    usedOn: usage.usedOn,
    merchant: usage.merchantId ? { id: usage.merchantId, name: usage.merchantName ?? "", defaultEvidenceType: null, defaultEvidenceName: null } : null,
    evidenceTypeCode: usage.evidenceTypeCode ?? "",
    evidenceLabel: usage.evidenceLabel ?? usage.evidenceTypeCode ?? "",
    linkKind: usage.linkKind,
    project: usage.projectId && usage.projectLabel ? { id: usage.projectId, label: usage.projectLabel } : null,
    line:
      usage.lineId && usage.lineItemName !== undefined && usage.lineItemName !== null
        ? { id: usage.lineId, itemName: usage.lineItemName, remainingKrw: usage.lineRemainingKrw ?? null, hint: usage.lineHint ?? null }
        : null,
    usedByUserId: usage.usedByUserId,
    choosesUser: usage.choosesUser ?? false,
    memo: usage.memo ?? null,
    currency: usage.currency === "USD" ? "USD" : "KRW",
    amount: usage.amount ?? null,
    fxRate: usage.fxRate ?? null,
    // 투영이 금액 키를 뺐다 = 결제 합계를 못 보는 사람(card_usage.amount — DOM D-3).
    amountHidden: usage.amount === undefined,
    changeLink,
    cardOptions: cardOptions ? cardOptions.flatMap((card) => (card.id && card.label ? [{ id: card.id, label: card.label }] : [])) : null,
  };
}

export default async function CardsPage({ searchParams }: { searchParams: Promise<CardsSearchParams> }) {
  const { viewer, user } = await requireSession();
  const params = await searchParams;
  const today = seoulToday();
  const thisMonth = today.slice(0, 7);
  const monthParam = first(params.month);
  const month = monthParam && MONTH_PATTERN.test(monthParam) ? monthParam : thisMonth;
  const cardParam = first(params.card);
  const cardId = cardParam && UUID_PATTERN.test(cardParam) ? cardParam : undefined;
  const linkParam = first(params.link);
  const link = LINK_FILTERS.find((value) => value === linkParam);
  const proxyOnly = first(params.via) === "proxy";
  const filtered = month !== thisMonth || cardId !== undefined || link !== undefined || proxyOnly;

  const options = await cardUsageFormOptions(viewer, today);
  let list: CardUsageListResult | null = null;
  try {
    list = await listCardUsages(viewer, { month, cardId, link, proxyOnly, page: first(params.page) }, today);
  } catch (error) {
    // 목록 자리 한 줄 + `다시 시도`(UI-SPEC 「Error — 목록 로드」) — 화면의 나머지(머리 · 1차)는 선다.
    console.error(error);
  }
  const cards = options.cards.flatMap((card) => (card.id && card.label ? [{ id: card.id, label: card.label, proxyHint: card.proxyHint ?? null, choosesUser: card.choosesUser ?? false }] : []));
  const rows: CardUsageListRowView[] = (list?.rows ?? []).flatMap((row) =>
    row.id && row.cardId && row.cardLabel && row.usedOn && row.linkKind
      ? [
          {
            id: row.id,
            cardId: row.cardId,
            cardLabel: row.cardLabel,
            usedOn: row.usedOn,
            merchantName: row.merchantName ?? null,
            linkKind: row.linkKind,
            teamName: row.teamName ?? null,
            linkLabel: row.linkLabel ?? null,
            registeredVia: row.registeredVia ?? "self",
            registeredByName: row.registeredByName ?? "—",
            registeredOn: row.registeredOn ?? null,
            purchaseNumber: row.purchaseNumber ?? null,
            number: row.number ?? null,
            totalKrw: row.totalKrw ?? null,
            supplyKrw: row.supplyKrw ?? null,
            vatKrw: row.vatKrw ?? null,
            currency: row.currency ?? null,
            foreignAmount: row.foreignAmount ?? null,
            fxRate: row.fxRate ?? null,
            rights: row.rights ?? { edit: false, changeLink: false, delete: false },
            version: row.version ?? 0,
            hasCardSlip: row.hasCardSlip ?? false,
          },
        ]
      : [],
  );

  const pageHref = (target: number): string => {
    const query = new URLSearchParams();
    if (month !== thisMonth) query.set("month", month);
    if (cardId) query.set("card", cardId);
    if (link) query.set("link", link);
    if (proxyOnly) query.set("via", "proxy");
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `${LIST_HREF}?${text}` : LIST_HREF;
  };
  // 패널 닫기 · 1차는 지금 필터의 /cards(쪽은 1로) — 뒤 목록이 바뀌지 않는다(플랜 Task 1 ③).
  const listHref = pageHref(1);
  const newHref = `${listHref}${listHref.includes("?") ? "&" : "?"}new=1`;

  // 06-09 수정 모드(`?editId=`) — 권리가 없거나 없는 건이면 패널 없이 목록만(링크로 남의 건을 열 수 없다).
  const editParam = first(params.editId);
  const editing = editParam ? await loadCardUsageForEdit(viewer, editParam) : null;
  const edit = editing ? toEditView(editing.usage, editing.rights.changeLink, editing.cardOptions) : null;

  // 06-25 수정 패널 `증빙` 줄 재료 — 파일 목록 · 쓰기 동작 · 한도는 05 주인 표의 읽기 판정(getOwnedEvidence) 뒤에만 싣는다.
  let editSlip: CardSlipArea | null = null;
  if (edit) {
    const owned = await getOwnedEvidence(viewer, { ownerKind: CARD_USAGE_ENTITY, ownerId: edit.id });
    editSlip = {
      maxMb: owned.maxMb,
      canAdd: owned.actions.canAdd,
      deletableIds: owned.actions.deletableFileIds,
      files: owned.files.flatMap((file): AttachmentFile[] =>
        file.id && file.originalName !== undefined && file.createdAt ? [{ id: file.id, name: file.originalName, sizeBytes: file.sizeBytes ?? 0, createdAt: new Date(file.createdAt).toISOString() }] : [],
      ),
    };
  }

  // 06.1-09 S5 — 「증빙」 칸의 `증빙 고르기 {N}`(모드 none · 후보 0이면 트리거 DOM 0). 못 읽으면 트리거만 비운다(건은 이미 읽기 판정을 지났다).
  let editPick: CardEvidencePick | null = null;
  if (edit) {
    try {
      const { mode } = await evidencePickerMode(viewer, { kind: "corp_card_usage", id: edit.id });
      const count = mode === "none" ? 0 : await countEvidencePool(viewer, { kind: "corp_card_usage", id: edit.id });
      editPick = mode !== "none" && count >= 1 ? { mode, count } : null;
    } catch {
      editPick = null;
    }
  }

  let panel = null;
  if (edit) {
    panel = (
      // 열린 대상별 key(06-12 검토 I-2) — 닫기 이동이 끝나기 전에 다른 패널을 열면 같은 자리의 닫힌 SidePanel(<dialog>)이 재사용되지 않고 새로 열린다.
      // 06.5 L-1: 주소로 직접 열어 저장하면 그 행 `수정`으로 — returnFocusTo는 클라이언트 감싸개(CardUsageEditPanel)가 만든다.
      <CardUsageEditPanel key={`edit-${edit.id}`} id={edit.id} closeHref={listHref}>
        <CardUsageForm
          cards={[]}
          evidenceTypes={options.evidenceTypes}
          teamName={options.teamName}
          teamAssigned={options.teamAssigned}
          userName={user.name}
          today={today}
          usdFxRate={options.usdFxRate}
          defaults={{
            usedOn: edit.usedOn,
            corpCardId: edit.cardId,
            linkKind: edit.linkKind,
            project: edit.project,
            line: edit.line,
            evidenceTypeCode: edit.evidenceTypeCode,
          }}
          edit={edit}
          slip={editSlip}
          evidencePick={editPick}
        />
      </CardUsageEditPanel>
    );
  } else if (first(params.new) === "1" && first(params.evidence) !== undefined) {
    // 06.1-09 S8 대리 등록 — 이미 붙었거나 범위 밖 · 보관 · 완화 후보가 생긴 증빙이면 404(PA-S8-STALE). 카드 · 사용일 · 합계 · 가맹점 · 증빙 종류는 파일 값 읽기 텍스트.
    const evidenceId = first(params.evidence) ?? "";
    const prefill = UUID_PATTERN.test(evidenceId) ? await cardUsagePrefillFromEvidence(viewer, evidenceId) : null;
    if (!prefill) notFound();
    const defaults = await cardUsageFormDefaults(viewer, today, { prefill: { corpCardId: prefill.corpCardId, usedOn: prefill.usedOn } });
    // PR-D D-3(판정 P-1 ①) — 닫기(Esc · 취소 · x)도 저장처럼 출발한 증빙 목록으로 간다. 앱 안에서 그 목록에서 열었으면 SidePanel이 뒤로 가기로 닫는다.
    const evidenceListHref = "/expenses/evidence?state=unmatched";
    const fromEvidence: CardUsageFromEvidence = {
      evidenceId,
      cardText: cards.find((card) => card.id === prefill.corpCardId)?.label ?? `카드 ${prefill.cardLast4}`,
      totalKrw: prefill.totalKrw,
      merchant: prefill.merchant,
      evidenceLabel: options.evidenceTypes.find((option) => option.value === prefill.evidenceTypeCode)?.label ?? prefill.evidenceTypeCode,
      doneHref: `${evidenceListHref}&registered=`,
    };
    panel = (
      <CardUsageFromEvidencePanel key={`evidence-${evidenceId}`} evidenceId={evidenceId} closeHref={evidenceListHref}>
        <CardUsageForm
          cards={cards}
          evidenceTypes={options.evidenceTypes}
          teamName={options.teamName}
          teamAssigned={options.teamAssigned}
          userName={user.name}
          today={today}
          usdFxRate={options.usdFxRate}
          defaults={{ ...defaults, evidenceTypeCode: prefill.evidenceTypeCode }}
          fromEvidence={fromEvidence}
        />
      </CardUsageFromEvidencePanel>
    );
  } else if (first(params.new) === "1" && cards.length > 0) {
    // 진입(M-4) — S14 견적 줄 행 `?line=` · S15 빈 섹션 `?project=`. 고를 수 없으면 서버가 버리고 직전 등록 기준.
    const entryLine = first(params.line);
    const entryProject = first(params.project);
    const defaults = await cardUsageFormDefaults(viewer, today, {
      lineId: entryLine && UUID_PATTERN.test(entryLine) ? entryLine : undefined,
      projectId: entryProject && UUID_PATTERN.test(entryProject) ? entryProject : undefined,
    });
    // 06-25 새 건 `증빙` 줄 — 파일을 놓으면 1차와 같은 저장이 먼저 돌고 그 건의 수정 패널(?editId=)로 바뀐다(05 「첫 저장」).
    const newSlip: CardSlipArea = { maxMb: await getSettingValue(EVIDENCE_MAX_SIZE_MB), canAdd: true, deletableIds: [], files: [] };
    panel = (
      <SidePanel key="new" title="카드 사용 등록" closeHref={listHref}>
        <CardUsageForm
          cards={cards}
          evidenceTypes={options.evidenceTypes}
          teamName={options.teamName}
          teamAssigned={options.teamAssigned}
          userName={user.name}
          today={today}
          usdFxRate={options.usdFxRate}
          defaults={{
            ...defaults,
            evidenceTypeCode: options.evidenceTypes.some((option) => option.value === CARD_RECEIPT) ? CARD_RECEIPT : null,
          }}
          slip={newSlip}
          slipEditHref={`${listHref}${listHref.includes("?") ? "&" : "?"}editId=`}
        />
      </SidePanel>
    );
  }

  const newAction = { label: "카드 사용 등록", href: newHref };
  // 06-14(SP-4): 하위 목록 링크 `구매 요청 {N}` — 필터 줄 끝(없으면 0건 빈 화면의 행동). 구매 요청은 카드가 없는 직원도 하므로 이 길이 막히면 안 된다.
  const openPurchaseCount = list ? await countOpenPurchaseRequests(viewer, today) : 0;
  const purchasesLink = { label: openPurchaseCount > 0 ? `구매 요청 ${openPurchaseCount}` : "구매 요청", href: "/cards/purchases" };
  // 쓸 카드 0장 · 필터 없는 빈 목록 — 고를 것이 없는 필터 줄은 세우지 않는다(할 수 없는 선택지는 숨김).
  const nothingToFilter = cards.length === 0 && rows.length === 0 && !filtered;
  const filters = list && !nothingToFilter ? (
    <CardUsageFilters
      month={month}
      thisMonth={thisMonth}
      months={monthChoices(thisMonth, month)}
      cardId={cardId ?? ""}
      cardChoices={list.cardChoices.flatMap((card) => (card.id && card.label ? [{ id: card.id, label: card.label }] : []))}
      link={link ?? ""}
      proxyOnly={proxyOnly}
      registrationFilter={list.registrationFilter}
      purchasesLink={purchasesLink}
    />
  ) : undefined;

  let empty = undefined;
  let body;
  if (!list) body = <CardUsageLoadError />;
  else if (rows.length > 0)
    body = (
      <>
        <CardUsageUndoLine />
        <CardUsageList rows={rows} listHref={listHref} />
      </>
    );
  else if (filtered)
    body = (
      <>
        <CardUsageUndoLine />
        <ListEmpty message="조건에 맞는 카드 사용이 없습니다" action={{ label: "필터 지우기", href: LIST_HREF }} />
      </>
    );
  else {
    // DR5 — 빈 목록이면 틀이 머리 1차를 숨기고 빈 화면이 말한다. 쓸 카드가 0장이면 버튼도 없다(할 일이 관리자 몫).
    // 마지막 행을 지워 빈 화면이 되어도 결과 줄 `되돌리기`가 남는다(상태는 화면 전체를 감싼 CardUsageDeleteUndo).
    empty = (
      <>
        <CardUsageUndoLine />
        {cards.length === 0 ? (
          <ListEmpty message="쓸 수 있는 법인카드가 없습니다 · 카드 등록은 관리자" action={purchasesLink} />
        ) : (
          <ListEmpty message="이번 달 카드 사용이 없습니다" action={newAction} />
        )}
      </>
    );
    body = null;
  }

  // 결과 줄은 필터 · 월 · 쪽이 바뀌면 사라진다(key) — 패널을 열고 닫는 것(`?new=1` · `?editId=`)은 목록을 바꾸지 않아 남는다.
  const undoKey = [month, cardId ?? "", link ?? "", proxyOnly ? "proxy" : "", list?.page.page ?? 1].join("|");
  return (
    <CardUsageDeleteUndo key={undoKey}>
      <ListScreen
        title="카드 사용"
        primaryAction={cards.length > 0 ? newAction : undefined}
        filters={filters}
        summary={
          list?.totals && list.totals.count > 0 ? (
            <section aria-label="합계" className={styles.totals}>
              <p className={styles.totalsTitle}>{`합계 (${month} · ${list.totals.count}건)`}</p>
              <dl className={styles.totalsPairs}>
                <div className={styles.totalsPair}>
                  <dt>결제 합계</dt>
                  <dd>
                    <Num value={list.totals.totalKrw} />
                  </dd>
                </div>
                <div className={styles.totalsPair}>
                  <dt>공급가</dt>
                  <dd>
                    <Num value={list.totals.supplyKrw} />
                  </dd>
                </div>
              </dl>
            </section>
          ) : undefined
        }
        empty={empty}
        pagination={
          list && rows.length > 0 ? (
            <Pagination
              label="카드 사용"
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
    </CardUsageDeleteUndo>
  );
}
