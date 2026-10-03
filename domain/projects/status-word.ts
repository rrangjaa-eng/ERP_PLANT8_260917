import type { ProjectStatus } from "@/domain/projects/status-transitions";

// 04.6-10(사용자 결정 ⑤ 「상태 배지 고정」 · SYSTEM §7-5) — 프로젝트 상태 이름의 단일 표.
// 배지·필터 옵션·상세 부제·상태 바뀜 문구가 모두 이 낱말을 쓴다. 코드표(project_status)의
// 라벨은 화면에서 읽지 않고, 관리자도 이 다섯 값의 이름을 바꿀 수 없다(updateCodeItemLabel).
// 값은 리터럴 타입이라 StatusTag의 status(StatusWord)에 그대로 들어간다 — 색은 status-map.ts 한 표가 정한다.
export const PROJECT_STATUS_WORD = {
  bidding: "수주중",
  in_progress: "진행",
  settling: "정산",
  completed: "완료",
  lost: "미수주",
} as const satisfies Record<ProjectStatus, string>;

const PROJECT_STATUS_TABLE_KEY = "project_status";

// 이름이 고정인 코드표 항목인가 — project_status 표의 다섯 값. 관리자가 더한 다른 값은 화면에 쓰이지 않아 해당 없다.
export function isFixedProjectStatusLabel(tableKey: string, value: string): boolean {
  return tableKey === PROJECT_STATUS_TABLE_KEY && Object.hasOwn(PROJECT_STATUS_WORD, value);
}
