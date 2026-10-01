import { PageHeader } from "@/ui/page-header/PageHeader";

// 04.3-04 Task 4 ④-b · 04.3-15 — I′3 LOADING. 제목은 아직 모르므로 제목 자리만(부제 없음 — app/(app)/projects/loading.tsx
// 선례의 이유). 당첨자 표 뼈대는 명단과 함께 없어졌고, 경품 표 뼈대는 04.3-10이 경품 섹션과 함께 더한다(없는 것을 있는
// 척하지 않는다).
export default function CertEventDetailLoading() {
  return (
    <div aria-hidden="true">
      <PageHeader title={"\u00a0"} />
    </div>
  );
}
