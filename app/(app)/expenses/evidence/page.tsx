import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import {
  EVIDENCE_LIST_DEFAULTS,
  EVIDENCE_PERIOD_FILTERS,
  EVIDENCE_STATE_FILTERS,
  EVIDENCE_TYPE_FILTERS,
  listEvidenceRecords,
  listEvidenceTeamOptions,
} from "@/domain/evidence-records";
import { loadCardUsageForEdit } from "@/domain/corp-card-usages";
import { evidenceReturnHref } from "@/lib/evidence-return";
import { formatKrw } from "@/lib/format-number";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { EvidenceTable } from "./evidence-table";
import { RegisteredToast } from "./registered-toast";

// 06.1-05(S1 · S2) — 증빙 목록. `evidence.intake` 쓰기가 없으면 찾을 수 없음이다(UI-SPEC 「권한·노출」 — PM · 팀장도 404). 행 범위는
// listEvidenceRecords가 서버에서 건다(화면은 거르지 않는다). 틀은 제목만(DA-15) — 1차가 필터 줄 끝의 `aria-disabled` · `Ctrl+S` · 건수
// 버튼이고 끌어 놓기 영역이 필터 줄보다 위라서, 필터 줄 · 1차 · 표는 편집 상태를 가진 클라이언트 표가 children 안에 그린다.
// 필터 · 쪽은 쿼리(`?state=&type=&period=&batch=&page=`)라 새로 고침 · 뒤로에 남는다. 모르는 값은 domain이 기본값으로 읽는다.
// 같은 판정을 layout.tsx도 한다(스트리밍 앞 404) — 이 페이지도 스스로 판정한다(레이아웃은 클라이언트 이동에서 다시 렌더되지 않는다, 리저브 대장 WR-07).
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EvidencePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "evidence.intake", "write"))) notFound();
  const params = await searchParams;
  // 공개 칸 묶음 「다른 팀」의 팀(보관 아닌 팀 · DA-1)은 목록과 함께 한 번 읽는다.
  const [list, teams] = await Promise.all([
    listEvidenceRecords(viewer, {
      state: firstParam(params.state),
      type: firstParam(params.type),
      period: firstParam(params.period),
      batch: firstParam(params.batch),
      page: firstParam(params.page),
    }),
    listEvidenceTeamOptions(viewer),
  ]);
  // 06.1-09 S8 대리 등록 착지 — 합계는 그 카드 사용을 서버가 다시 읽어 싣는다(쿼리 글자를 그대로 보이지 않는다). 못 읽으면 토스트 없음.
  const registeredId = firstParam(params.registered);
  const registered = registeredId ? await loadCardUsageForEdit(viewer, registeredId) : null;
  const registeredAmount = registered?.usage.currency === "KRW" ? registered.usage.amount : undefined;
  // G-06.1-40 — 토스트가 닫히면 `registered`만 걷는다(출발 거르개 그대로).
  const landingQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) landingQuery.append(key, one);
  const landingHref = evidenceReturnHref(`/expenses/evidence?${landingQuery.toString()}`);
  return (
    <ListScreen title="증빙">
      {registeredAmount !== undefined ? <RegisteredToast message={`카드 사용 등록 · ${formatKrw(registeredAmount)}`} href={landingHref} /> : null}
      <EvidenceTable
        viewerId={viewer.id}
        list={list}
        teams={teams}
        filterOptions={{ states: EVIDENCE_STATE_FILTERS, types: EVIDENCE_TYPE_FILTERS, periods: EVIDENCE_PERIOD_FILTERS, defaults: EVIDENCE_LIST_DEFAULTS }}
      />
    </ListScreen>
  );
}
