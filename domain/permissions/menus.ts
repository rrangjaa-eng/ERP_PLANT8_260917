// ADMN-01: 메뉴×동작 레지스트리 — 권한표 격자의 열 정본이자 seedMasterData의
// 입력이다. 이 페이즈가 쓸 메뉴 전부를 지금 등록한다(Phase 2의 1차 메뉴 5개 +
// Phase 3가 만들 관리 메뉴 전부) — 뒤 플랜이 화면을 더할 때마다 시드를 다시
// 돌려야 하는 상태를 만들지 않는다. 화면이 아직 없는 메뉴의 권한 칸은 체크만
// 존재하고 갈 곳이 없을 뿐 판정에는 문제가 없다. 뒤 플랜은 화면만 더하고 이
// 배열은 건드리지 않는다.
export const PERMISSION_ACTIONS = ["view", "write", "approve"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type MenuDef = { key: string; label: string };

export const MENUS: MenuDef[] = [
  { key: "projects", label: "프로젝트" },
  // 04-02(D-57): 매출 섹션 쓰기 주체가 갈린다 — 계약 금액은 기존
  // "projects" 메뉴의 write(PM)를 그대로 쓰고, 세금계산서 발행·입금 줄은
  // 이 새 메뉴의 write로 별도 게이트한다("경영관리"는 이 milestone의
  // SEED_ROLES 5종에 없는 조직상 역할이라 권한표에서 관리자가 실제
  // 담당 계급에 배정한다 — 코드에 역할 이름을 박지 않는다).
  { key: "projects.revenue", label: "매출 정산" },
  { key: "expenses", label: "지출결의" },
  { key: "cards", label: "법인카드" },
  { key: "approvals", label: "결재함" },
  { key: "pnl", label: "손익" },
  { key: "admin.system-status", label: "시스템 상태" },
  { key: "admin.code-tables", label: "코드표" },
  { key: "admin.people", label: "사람" },
  { key: "admin.vendors", label: "거래처" },
  { key: "admin.corp-cards", label: "법인카드 마스터" },
  { key: "admin.permissions", label: "권한표" },
  { key: "admin.visibility", label: "정보 노출표" },
  { key: "admin.settings", label: "설정" },
  { key: "admin.action-log", label: "행동 로그" },
  { key: "admin.archive", label: "보관함" },
];
