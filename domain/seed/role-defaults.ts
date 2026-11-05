import { FUND_SCOPED_MENUS } from "@/domain/permissions/fund-scope";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import type { PermissionAction } from "@/domain/permissions/menus";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";

// D-722 — 시드 계급 기본값의 정본. 시스템 관리자는 seedMasterData의 MENUS · INFO_ITEMS 루프가 맡는다. 바꾸면 사용자 확인 카드.
// seedMasterData가 이 표를 돌며 줄마다 없을 때만 넣는다(insert-if-absent) — 관리자가 권한표 · 노출표에서 바꾼 값을 재시드가 덮지 않는다.

export type RoleDefaultPermission = { roleId: string; menu: string; action: PermissionAction; allowed: boolean };

export const ROLE_DEFAULT_PERMISSIONS: readonly RoleDefaultPermission[] = [
  // Phase 4(04-01): 사원의 기본 업무 메뉴 — "projects" 보기 · 쓰기. admin.*처럼 관리자가 매번 켜야 하는 빈 기본값으로
  // 두지 않는다 — 여러 기존 E2E(page-chrome · mobile-page-chrome · a11y · mobile-list-empty)가 role-pm의 `/projects` 접근을 전제한다.
  { roleId: DEFAULT_ROLE_ID, menu: "projects", action: "view", allowed: true },
  { roleId: DEFAULT_ROLE_ID, menu: "projects", action: "write", allowed: true },
  // 04.3-09: 사원의 확인증 행사 기본 권한(CONTEXT 재량 「기획 PM · 경영관리를 기본으로」). 경영관리는 시드 계급이 아니라 권한표에서 켠다.
  { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "view", allowed: true },
  { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "write", allowed: true },
  // 04-20(D-46 · D-79 · A-05): 상태 전환 기본 권한 — 팀장 · 본부 책임자 · 대표는 프로젝트 화면(보기)과 수주중 · 미수주 전환
  // (projects.status 쓰기), 04-22(사용자 결정 2026-09-25): 기간만 고치는 projects.period 쓰기.
  ...[TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, CEO_ROLE_ID].flatMap((roleId) => [
    { roleId, menu: "projects", action: "view" as const, allowed: true },
    { roleId, menu: "projects.status", action: "write" as const, allowed: true },
    { roleId, menu: "projects.period", action: "write" as const, allowed: true },
  ]),
  // 04-20: 대표는 정산 → 완료(projects.complete 쓰기)까지.
  { roleId: CEO_ROLE_ID, menu: "projects.complete", action: "write", allowed: true },
  // D-722 ①(대표 admin.action-log 보기)은 ⑧(대표 action_log.detail)과 함께 켠다 — ⑧ 끔 동안 보류(사용자 결정 2026-10-22).
  // D-7119 추적: ⑧을 켜는 플랜이 이 줄과 시험 「대표 action-log 보기는 ⑧(…)과 함께 켠다 — D-7119 보류」를 함께 바꾼다.
  // 06.2(D-6210): ROADMAP 06.2 성공 기준 5(담당 PM · 팀장이 붙인다) + D-6210(관리 권리가 전사인 계급도 키가 있어야 붙인다).
  // 260907은 기획팀장만이었다(`O: docs/06_업무/02_프로젝트.md:401`).
  ...[CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, DEFAULT_ROLE_ID].map((roleId) => ({
    roleId,
    menu: "projects.member",
    action: "write" as const,
    allowed: true,
  })),
  // 07.2(D-7213): 프로젝트 삭제 — 팀장 이상(260907 team_lead 보유 `O: db/schema/130_company_bundle.sql:147`).
  ...[TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, CEO_ROLE_ID].map((roleId) => ({
    roleId,
    menu: "projects.delete",
    action: "write" as const,
    allowed: true,
  })),
  // 06.1(D-6113): 증빙 보기 — 사원 · 팀장(대표는 넣지 않는다). 본부 책임자 보기는 07.3 D-7303(FUND_SEED_PERMISSIONS)이 켠다. 등록(evidence.intake)은 07.3 D-7315 블록(FUND_SEED_PERMISSIONS)이 켠다.
  ...[DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID].map((roleId) => ({ roleId, menu: "evidence", action: "view" as const, allowed: true })),
  // 07.1(D-7107): 연차 · 지출결의 시드 루프(`domain/seed/approvals-leave.ts` · `expenses.ts`)에 있던 권한 17행을 같은 값으로 옮겼다.
  // 04.1-02 연차 view · write — 시드 계급 넷(시스템 관리자는 MENUS 루프). 05-03 지출결의 view · write — 작성 계급 넷.
  // 05-08(사용자 결정 2026-09-26 #5) 팀 지출결의 보기 — 팀장.
  ...[CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, DEFAULT_ROLE_ID].flatMap((roleId) => [
    { roleId, menu: "leave", action: "view" as const, allowed: true },
    { roleId, menu: "leave", action: "write" as const, allowed: true },
    { roleId, menu: "expenses", action: "view" as const, allowed: true },
    { roleId, menu: "expenses", action: "write" as const, allowed: true },
  ]),
  { roleId: TEAM_LEAD_ROLE_ID, menu: "expenses.team", action: "view", allowed: true },
];

// 07.3 D-7315 — 자금 시드 표. ROLE_DEFAULT_PERMISSIONS와 따로 둔다: domain/seed/fund-scope.ts가 쓰기 줄의 짝 칸(같은 메뉴 보기 ·
// PERMISSION_REQUIRES)이 꺼진 행이 아닌지 확인한 뒤 없을 때만 넣는다(일반 루프는 보기 끔을 보지 않는다).
// 본부 조건(07.3-01 can())이 실제 사람을 거른다 — 경영관리본부 소속만 쓴다. 팀장은 경영관리본부에 자리가 없어도 사원 이상 규칙대로(D-7315).
// 조정 줄은 본부 책임자만(D-7305) · 본부 책임자 증빙 보기(D-7303 — 증빙 등록 쓰기의 짝). 카드 대리 등록(D-7308) · 승인 칸 · 대표는 넣지 않는다.
const FUND_SEED_MENUS = FUND_SCOPED_MENUS.filter((menu) => menu !== "projects.adjustment");

export const FUND_SEED_PERMISSIONS: readonly RoleDefaultPermission[] = [
  { roleId: DIVISION_HEAD_ROLE_ID, menu: "evidence", action: "view", allowed: true },
  ...[DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID].flatMap((roleId) =>
    FUND_SEED_MENUS.flatMap((menu) => [
      { roleId, menu, action: "view" as const, allowed: true },
      { roleId, menu, action: "write" as const, allowed: true },
    ]),
  ),
  { roleId: DIVISION_HEAD_ROLE_ID, menu: "projects.adjustment", action: "view", allowed: true },
  { roleId: DIVISION_HEAD_ROLE_ID, menu: "projects.adjustment", action: "write", allowed: true },
];

// mode "upsertIfUnedited": 관리자가 손대지 않은(updated_by 없음) 행이면 재시드가 값을 갱신한다. 표지가 없으면 insert-if-absent.
export type RoleDefaultVisibility = { roleId: string; infoItem: string; visible: boolean; mode?: "upsertIfUnedited" };

// 04-20(ENG-D2 · ENG-D3 ③): 사원 · 팀장 · 본부 책임자는 staffDefault, 대표는 그에 더해 매출(revenue.*) 항목까지.
// INFO_ITEMS에서 계산해 새 정보 항목이 표에서 빠지지 않는다.
const STAFF_DEFAULT_ROLES = [DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID];

export const ROLE_DEFAULT_VISIBILITY: readonly RoleDefaultVisibility[] = INFO_ITEMS.flatMap((item): RoleDefaultVisibility[] => [
  ...STAFF_DEFAULT_ROLES.map((roleId): RoleDefaultVisibility => {
    // 04-16(D-85 · CEO 리뷰 B-29): 발행액은 사원 행만 갱신해 재시드한 기존 DB에도 공개하고,
    // 팀장 · 본부 책임자 행은 없을 때만 숨김으로 넣는다 — 관리자가 노출표에서 켠다.
    if (item.key === "revenue.issued_amount") {
      return roleId === DEFAULT_ROLE_ID
        ? { roleId, infoItem: item.key, visible: true, mode: "upsertIfUnedited" }
        : { roleId, infoItem: item.key, visible: false };
    }
    return { roleId, infoItem: item.key, visible: item.staffDefault };
  }),
  { roleId: CEO_ROLE_ID, infoItem: item.key, visible: item.staffDefault || item.key.startsWith("revenue.") },
]);
