import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { EVIDENCE_LIST_DEFAULTS, EVIDENCE_PERIOD_FILTERS, EVIDENCE_STATE_FILTERS, EVIDENCE_TYPE_FILTERS, listEvidenceRecords } from "@/domain/evidence-records";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { EvidenceTable } from "./evidence-table";

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
  const list = await listEvidenceRecords(viewer, {
    state: firstParam(params.state),
    type: firstParam(params.type),
    period: firstParam(params.period),
    batch: firstParam(params.batch),
    page: firstParam(params.page),
  });
  return (
    <ListScreen title="증빙">
      <EvidenceTable
        viewerId={viewer.id}
        list={list}
        filterOptions={{ states: EVIDENCE_STATE_FILTERS, types: EVIDENCE_TYPE_FILTERS, periods: EVIDENCE_PERIOD_FILTERS, defaults: EVIDENCE_LIST_DEFAULTS }}
      />
    </ListScreen>
  );
}
