// 04-06(D-75) — 프로젝트 상태 다섯 값과 사람의 전환 넷. 데이터만 두고
// 아무것도 import하지 않는다 — 게이트 규칙(domain/rules/register.ts)과 전환
// 함수(04-20)가 이 파일을 같이 읽고 서로 import하지 않게 하는 자리다
// (test/unit/import-cycles.test.ts). 메뉴 키의 레지스트리 등록·시드는 04-20.
export const PROJECT_STATUSES = ["bidding", "in_progress", "settling", "completed", "lost"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectStatusTransition = {
  from: ProjectStatus;
  to: ProjectStatus;
  menu: "projects.status" | "projects.complete";
};

// 진행에서 사람이 가는 곳은 없다(사용자 D13). 진행 → 정산은 자동(04-11).
export const ALLOWED_TRANSITIONS: readonly ProjectStatusTransition[] = [
  { from: "bidding", to: "in_progress", menu: "projects.status" },
  { from: "bidding", to: "lost", menu: "projects.status" },
  { from: "lost", to: "in_progress", menu: "projects.status" },
  { from: "settling", to: "completed", menu: "projects.complete" },
];
