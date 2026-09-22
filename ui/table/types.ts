import type { ReactNode } from "react";

// SYSTEM.md §7-3 + 보강 (가)~(아) — Phase 4가 만드는 편집/읽기 겸용 표의
// 첫 형태(D-61: 자체 구현). 이 파일은 컴포넌트가 받는 데이터 모양만 정의한다
// — 키보드 로빙·범위 선택·붙여넣기·충돌 렌더·미저장 복원은 04-04가 더한다.

// (가) 셀 편집 가능성 3단계 — 서버가 셀마다 판정해 보낸다(클라이언트 추론 금지).
export type CellEditability = "edit" | "readonly" | "locked";

// §7-3 폰 전략 — 모든 열은 우선순위를 선언한다. P1만 열로 남고 P2는 행 아래
// 접힌 줄, P3은 숨는다(<700px).
export type ColumnPriority = "p1" | "p2" | "p3";

export type TableColumn<Row> = {
  key: string;
  header: string;
  priority: ColumnPriority;
  align?: "left" | "right";
  /** 정렬 가능 여부 — 04-05(목록)가 쓴다. 이 플랜은 쓰지 않는다. */
  sortable?: boolean;
  /** 읽기 렌더 — 값 그대로 보여준다(편집 중이 아닐 때). */
  cell: (row: Row) => ReactNode;
  /**
   * 폰 P2 접힌 줄 전용 읽기 전용 요약(§7-3 폰 전략 — "폰에서 셀 편집은
   * 없다"). 없으면 편집 가능 열은 접힌 줄에서 빠진다(입력 요소를 두 번
   * 마운트하지 않기 위해) — 항상 읽기 전용인 열만 `cell`을 그대로 쓴다.
   */
  summary?: (row: Row) => ReactNode;
  /** 이 열의 셀 편집 가능성 — 없으면 항상 readonly(계산 열 등). */
  editability?: (row: Row) => CellEditability;
  /** 편집 렌더 — editability가 "edit"이고 이 열이 편집 중일 때. 없으면 읽기 렌더만 쓴다. */
  editCell?: (row: Row, ctx: { onCommit: (value: string) => void; onCancel: () => void }) => ReactNode;
};

export type TableGroup<Row> = {
  key: string;
  header: string;
  rows: Row[];
};

export type SortState = { key: string; direction: "asc" | "desc" } | null;
