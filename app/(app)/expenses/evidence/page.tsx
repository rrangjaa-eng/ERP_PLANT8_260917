import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listEvidenceRecords } from "@/domain/evidence-records";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { EvidenceTable } from "./evidence-table";

// 06.1-05(S1 · S2) — 증빙 목록. `evidence.intake` 쓰기가 없으면 찾을 수 없음이다(UI-SPEC 「권한·노출」 — PM · 팀장도 404). 행 범위는
// listEvidenceRecords가 서버에서 건다(화면은 거르지 않는다). 틀은 제목만(DA-15) — 1차가 필터 줄 끝의 `aria-disabled` · `Ctrl+S` · 건수
// 버튼이고 끌어 놓기 영역이 필터 줄보다 위라서, 필터 줄 · 1차 · 표는 편집 상태를 가진 클라이언트 표가 children 안에 그린다.
export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "evidence.intake", "write"))) notFound();
  const list = await listEvidenceRecords(viewer);
  return (
    <ListScreen title="증빙">
      <EvidenceTable viewerId={viewer.id} list={list} />
    </ListScreen>
  );
}
