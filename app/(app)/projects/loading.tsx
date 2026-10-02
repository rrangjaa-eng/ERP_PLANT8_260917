import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
import { PROJECT_COLUMN_LABELS, PROJECT_SKELETON_COLUMNS } from "./list-columns";

// UI-SPEC loading(D10 · SC 10) — 제목 + 목록 표 뼈대만. 머리글은 진짜 열 이름(`list-columns.ts` — 표와 같은 낱말)이고 1차 행동 prop은 넘기지 않는다
// (동작하지 않는 1차 방지). 300ms 안에 끝나는 스트리밍에서는 뼈대가 보이지 않는다(`TableSkeleton`의 지연 표시). 상단 진행 막대는 만들지 않는다(사용자 D17).
export default function ProjectsLoading() {
  return (
    <ListScreen title="프로젝트">
      <TableSkeleton columns={PROJECT_SKELETON_COLUMNS.map(({ key, align }) => ({ key, label: PROJECT_COLUMN_LABELS[key], align }))} />
    </ListScreen>
  );
}
