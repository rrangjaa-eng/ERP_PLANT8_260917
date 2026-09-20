import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// Phase 3 assumption-delta(03-01-PLAN.md <assumption_delta_decision>): 계급
// 식별자(roleId)를 1차 필드로 promote하고 isAdmin은 내린다. 이 플랜은 전이 창
// (한 플랜 길이) 동안 roleId를 선택 필드로 둔다 — 필수로 만들면 기존
// `{ id, isAdmin }` 리터럴이 있는 파일 26개가 이 플랜에서 함께 깨진다. 03-02가
// roleId를 필수로 올리고 isAdmin 필드를 삭제하며 "참조 0" 메타 테스트로 이
// 창을 닫는다.
export type Viewer = { id: string; isAdmin: boolean; roleId?: string | null };

// CLI·훅·Job·healthz 프로브 전용 — 사람이 아닌 시스템 주체가 리포지토리를 호출할 때 쓴다.
export const SYSTEM_VIEWER: Viewer = { id: "system", isAdmin: true, roleId: SYSADMIN_ROLE_ID };
