import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// 06-22 DOM 감사 D-3 — 프로젝트 상세 §7-7 LOADING(정산 결재 문서 `점검 보기` 같은 느린 이동의 백스톱). 제목은 아직 모르므로 제목 자리만
// (certs/events/[id]/loading.tsx 선례) + 견적 줄 표 뼈대. 머리글은 견적 줄 표의 P1 열 이름(폰 320에서도 넘치지 않는 셋)이고, 편집 표라 합계 줄 뼈대를 더한다.
// 반짝임 · 진행 바 없음, 300ms 지연 표시(TableSkeleton), 1차 행동 없음.
export default function ProjectDetailLoading() {
  return (
    <div aria-hidden="true">
      <DetailScreen title={" "}>
        <TableSkeleton
          withFooter
          columns={[
            { key: "itemName", label: "항목" },
            { key: "execution", label: "실행가", align: "right" },
            { key: "status", label: "상태" },
          ]}
        />
      </DetailScreen>
    </div>
  );
}
