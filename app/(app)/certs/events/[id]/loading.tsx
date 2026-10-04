import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// 04.3-04 Task 4 ④-b · 04.3-15 · 04.3-10 — I′3 LOADING. 제목은 아직 모르므로 제목 자리만(부제 없음 — app/(app)/projects/loading.tsx
// 선례의 이유) + 경품 표 뼈대. 04.6-24: 틀은 `DetailScreen`, 뼈대는 공용 `TableSkeleton`(원시 표 태그 없음 · 머리글은 경품 표의 진짜 열 이름).
export default function CertEventDetailLoading() {
  return (
    <div aria-hidden="true">
      <DetailScreen title={" "}>
        <TableSkeleton
          withFooter
          columns={[
            { key: "name", label: "경품명" },
            { key: "delivery", label: "전달" },
            { key: "winnerCount", label: "당첨 수", align: "right" },
            { key: "submitted", label: "제출", align: "right" },
          ]}
        />
      </DetailScreen>
    </div>
  );
}
