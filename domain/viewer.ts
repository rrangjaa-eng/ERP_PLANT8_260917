import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// Phase 3(03-02): 03-01의 assumption-delta 전이 창을 닫는다 — 관리자 여부
// 불리언 필드를 삭제하고 계급 식별자(roleId)를 필수 필드로 올렸다. 이제 모든
// 판정은 can()/visible()/scopeFor() 세 함수만 거친다(관리자 불리언 분기는
// 코드베이스 어디에도 없다 — test/unit/no-admin-boolean.test.ts가 참조 0을
// 고정한다). roleId는 필수 키이지만 null을 허용한다 — can()/visible()이
// "계급 없는 viewer는 기본 거부"를 판정할 수 있어야 한다(defensive, 정상
// 경로에서는 lib/viewer.ts의 getSession()이 계급 없는 세션을 애초에 null로
// 돌려 이 상태를 만들지 않는다 — fail-closed).
export type Viewer = { id: string; roleId: string | null };

// CLI·훅·Job·healthz 프로브 전용 — 사람이 아닌 시스템 주체가 리포지토리를 호출할 때 쓴다.
export const SYSTEM_VIEWER: Viewer = { id: "system", roleId: SYSADMIN_ROLE_ID };
