// D-23: 역할 → (상단 바 메뉴, 폰 하단 탭, 계정 그룹, 시스템 상태 진입점) 매핑을
// 데이터로 한 곳에 둔다. SYSTEM.md §6-0이 정본이다.
//
// Phase 3(03-02, D-36)이 계급 5종 + 권한표로 이 파일 하나만 교체했다 — ui/shell/의
// 다른 컴포넌트는 건드리지 않는다. 셸 컴포넌트 쪽에는 역할 분기(관리자 불리언
// 조건문)를 두지 않는다.
//
// `ui`는 `ui`·`lib`만 import할 수 있다(D-26 boundaries) — 이 파일은 둘 다 필요로
// 하지 않는 순수 상수·함수라 domain/repositories를 참조하지 않는다. 판정(can())은
// app/(app)/layout.tsx가 미리 계산해 계산된 데이터(allowedMenus)로 넘긴다 —
// 이 파일은 domain/permissions/can.ts를 직접 import하지 않는다.
export type RoleMenuViewer = {
  roleId: string;
  allowedMenus: readonly string[];
};

export type MenuLink = {
  label: string;
  href: string;
};

export type AccountEntry =
  | { kind: "link"; label: string; href: string }
  | { kind: "action"; label: string; action: "logout" };

export type BottomTab = { label: string } & ({ kind: "link"; href: string } | { kind: "more" });

export type RoleMenu = {
  /** SYSTEM.md §6-0 1차 메뉴 5개 — 대응 화면 유무와 무관하게 역할과 상관없이 항상 다섯 전부(D-22). */
  topBarMenu: MenuLink[];
  /** SYSTEM.md §6-0 (a) PC 사용자 메뉴 · §7-8 「더보기」 시트의 「관리」 한 줄 —
   * 권한표에서 view 권한이 있는 admin.* 메뉴가 하나라도 있으면 `[{ label: "관리",
   * href: "/admin" }]`, 없으면 `[]`. 개별 관리자 화면 이름·그룹은 이 필드가 아니라
   * `adminIndexGroups`가 담당한다(「관리」 한 줄로 접기, 2026-09-22 quick/260922-i3k,
   * 사용자 결정 옵션 B — SYSTEM.md §6-0 (a)·§6-10). */
  adminMenu: MenuLink[];
  /** SYSTEM.md §6-0 (a) PC 사용자 메뉴 · §7-8 「더보기」 시트의 「계정」 그룹. */
  accountGroup: AccountEntry[];
  /** SYSTEM.md §6-0 폰 하단 탭 — 정확히 4개, 4번째는 항상 「더보기」(시트를 여는 동작, 라우트 아님). */
  bottomTabs: BottomTab[];
};

/** SYSTEM.md §6-10 「관리」 인덱스 화면의 그룹 하나 — 그룹 라벨 + 그 그룹에 속한
 * 관리자 화면 항목(허용된 것만). 항목이 0개인 그룹은 배열에 아예 나타나지 않는다. */
export type AdminMenuGroup = { label: string; items: MenuLink[] };

// 1차 메뉴 다섯의 URL 정본(이 페이즈의 유일한 출처). 02-05가 정확히 이 다섯 경로로
// 화면을 만들고, 그 플랜의 라우트 대조 검증이 이 목록과 실제 라우트를 맞춰 본다 —
// 다른 곳에 URL 문자열을 복제하지 않는다.
const TOP_BAR_MENU: readonly MenuLink[] = [
  { label: "프로젝트", href: "/projects" },
  { label: "지출결의", href: "/expenses" },
  { label: "법인카드", href: "/cards" },
  { label: "결재", href: "/approvals" },
  { label: "손익", href: "/pnl" },
];

// D-17 → 「관리」 한 줄로 접기(2026-09-22, quick/260922-i3k, 사용자 결정 옵션 B):
// 관리자 화면 10종(§6-8 시스템 상태 + Phase 3의 나머지 9개) 전부 — 개별 이름은
// PC 사용자 메뉴·「더보기」 시트에 더 이상 나오지 않고, 두 표면 모두 「관리」 한
// 줄(/admin)만 보여준다. 개별 화면·순서·그룹은 `/admin` 인덱스 화면
// (app/(app)/admin/page.tsx)이 adminIndexGroups로 받는다. key는
// domain/permissions/menus.ts MENUS의 admin.* 키와 같은 문자열이어야 하고,
// href는 실제 라우트 디렉터리 app/(app)/admin/<name>/과 대조해 확정했다
// (2026-09-21, 열 개 전부 확인) — `ui`는 domain을 import할 수 없어(D-26) 이
// 목록은 이 파일 안에 복제된 상수다. 여기 키가 MENUS와 어긋나면 그 항목의
// 진입점이 절대 나타나지 않고, href가 실제 라우트와 어긋나면 링크가 404로 간다.
//
// 배열 순서와 group은 SYSTEM.md §6-10 표(정본)와 원소 단위로 같아야 한다 —
// role-menu.test.ts가 그 표를 읽어 adminIndexGroups 결과와 대조한다.
//
// admin.settings의 라벨은 "시스템 설정"이다 — 아래 SETTINGS_ENTRY(/settings,
// 사용자 자신의 설정)와 "설정"으로 같은 라벨을 쓰면 관리자 화면에 두 항목이
// 동시에 보일 때 사용자가 둘을 구분할 수 없다.
const ADMIN_GROUP_MASTER = "마스터";
const ADMIN_GROUP_SETTINGS_PERMISSIONS = "설정·권한";
const ADMIN_GROUP_OPERATIONS = "운영 기록";

const ADMIN_MENUS: ReadonlyArray<{ key: string; label: string; href: string; group: string }> = [
  { key: "admin.people", label: "사람", href: "/admin/people", group: ADMIN_GROUP_MASTER },
  { key: "admin.vendors", label: "거래처", href: "/admin/vendors", group: ADMIN_GROUP_MASTER },
  {
    key: "admin.corp-cards",
    label: "법인카드 마스터",
    href: "/admin/corp-cards",
    group: ADMIN_GROUP_MASTER,
  },
  { key: "admin.code-tables", label: "코드표", href: "/admin/code-tables", group: ADMIN_GROUP_MASTER },
  { key: "admin.holidays", label: "공휴일", href: "/admin/holidays", group: ADMIN_GROUP_MASTER },
  {
    key: "admin.permissions",
    label: "권한표",
    href: "/admin/permissions",
    group: ADMIN_GROUP_SETTINGS_PERMISSIONS,
  },
  {
    key: "admin.visibility",
    label: "정보 노출표",
    href: "/admin/visibility",
    group: ADMIN_GROUP_SETTINGS_PERMISSIONS,
  },
  {
    key: "admin.settings",
    label: "시스템 설정",
    href: "/admin/settings",
    group: ADMIN_GROUP_SETTINGS_PERMISSIONS,
  },
  {
    key: "admin.system-status",
    label: "시스템 상태",
    href: "/admin/system-status",
    group: ADMIN_GROUP_OPERATIONS,
  },
  {
    key: "admin.action-log",
    label: "행동 로그",
    href: "/admin/action-log",
    group: ADMIN_GROUP_OPERATIONS,
  },
  { key: "admin.archive", label: "보관함", href: "/admin/archive", group: ADMIN_GROUP_OPERATIONS },
];

// 02-01 체크포인트 항목 H① 확정 — 「설정」은 실제 라우트(02-05가 /settings를 만든다).
// SYSTEM.md §6-0/§7-8의 계정 그룹 목록에서 「설정」이 빠지면(H②·③) 이 상수를 지운다 —
// role-menu.test.ts는 이 상수가 아니라 SYSTEM.md의 계정 그룹 문장을 기준으로
// 통과/실패가 갈리므로, 문서를 바꾸고 이 상수를 잊으면 테스트가 즉시 알린다.
const SETTINGS_ENTRY: AccountEntry = { kind: "link", label: "설정", href: "/settings" };

// 04.2-09 Task 1 — SYSTEM.md §6-0 (a)·§7-8 「계정」 그룹 맨 앞 「알림함」(S1-b).
// 상단 바 트리거 배지(§7-12 S1-a)는 TopBar.tsx가 useUnreadCount()로 별도로 붙인다 —
// 이 상수는 라우트와 라벨 정본일 뿐 건수를 담지 않는다.
export const NOTIFICATIONS_HREF = "/notifications";

/** allowedMenus에 admin.* 메뉴가 하나라도 있으면 「관리」 한 줄, 없으면 빈 배열
 * (「관리」 한 줄로 접기 — 개별 화면 이름은 adminIndexGroups가 담당). */
function buildAdminMenu(viewer: RoleMenuViewer): MenuLink[] {
  const hasAnyAdminMenu = ADMIN_MENUS.some((menu) => viewer.allowedMenus.includes(menu.key));
  return hasAnyAdminMenu ? [{ label: "관리", href: "/admin" }] : [];
}

/** SYSTEM.md §6-10 「관리」 인덱스 화면의 그룹 3개 — allowedMenus에 있는 admin.*
 * 메뉴만 ADMIN_MENUS 순서 그대로 그룹별로 묶는다. 순서는 allowedMenus의 순서와
 * 무관하다(순수 함수). 항목이 0개인 그룹은 결과 배열에 나타나지 않는다 — 서버가
 * 거른 목록을 그대로 렌더할 app/(app)/admin/page.tsx가 빈 그룹 머리글을 찍지
 * 않아도 되게 한다. */
export function adminIndexGroups(viewer: RoleMenuViewer): AdminMenuGroup[] {
  const allowed = ADMIN_MENUS.filter((menu) => viewer.allowedMenus.includes(menu.key));
  const groupOrder = [ADMIN_GROUP_MASTER, ADMIN_GROUP_SETTINGS_PERMISSIONS, ADMIN_GROUP_OPERATIONS];
  return groupOrder
    .map((label) => ({
      label,
      items: allowed
        .filter((menu) => menu.group === label)
        .map(({ label: itemLabel, href }) => ({ label: itemLabel, href })),
    }))
    .filter((group) => group.items.length > 0);
}

function buildAccountGroup(): AccountEntry[] {
  return [
    { kind: "link", label: "알림함", href: NOTIFICATIONS_HREF },
    { kind: "link", label: "내 정보", href: "/account" },
    SETTINGS_ENTRY,
    { kind: "action", label: "로그아웃", action: "logout" },
  ];
}

type RoleTabLink = { label: string; href: string };

// SYSTEM.md §6-0 역할별 탭 표(계급 5종, 2026-09-20 D-14 임시 두 행 해소) —
// 탭 1~3만 담는다. 4번째 「더보기」는 buildBottomTabs가 항상 붙인다. 모르는
// 계급 식별자는 DEFAULT_ROLE_TABS(기본 계급, role-pm)로 떨어진다 — 빈 탭
// 목록을 만들지 않는다.
const DEFAULT_ROLE_TABS: readonly RoleTabLink[] = [
  { label: "내 차례", href: "/" },
  { label: "프로젝트", href: "/projects" },
  { label: "지출결의", href: "/expenses" },
];

const ROLE_BOTTOM_TABS: Readonly<Record<string, readonly RoleTabLink[]>> = {
  "role-ceo": [
    { label: "내 차례", href: "/" },
    { label: "결재", href: "/approvals" },
    { label: "손익", href: "/pnl" },
  ],
  "role-division-head": [
    { label: "내 차례", href: "/" },
    { label: "결재", href: "/approvals" },
    { label: "손익", href: "/pnl" },
  ],
  "role-team-lead": [
    { label: "내 차례", href: "/" },
    { label: "결재", href: "/approvals" },
    { label: "손익", href: "/pnl" },
  ],
  "role-pm": DEFAULT_ROLE_TABS,
  "role-sysadmin": [
    { label: "내 차례", href: "/" },
    { label: "결재", href: "/approvals" },
    { label: "손익", href: "/pnl" },
  ],
};

function buildBottomTabs(viewer: RoleMenuViewer): BottomTab[] {
  const tabs = ROLE_BOTTOM_TABS[viewer.roleId] ?? DEFAULT_ROLE_TABS;
  const roleTabs: BottomTab[] = tabs.map((tab) => ({ kind: "link", label: tab.label, href: tab.href }));
  return [...roleTabs, { kind: "more", label: "더보기" }];
}

/**
 * 역할 → 셸 메뉴 매핑. 순수 함수 — 부작용 없음, 같은 입력엔 항상 같은 결과다.
 * `ui/shell/Shell.tsx`·`TopBar.tsx`·`BottomTabs.tsx`·`MoreSheet.tsx`는 이 함수의
 * 결과만 받아 렌더한다 — 컴포넌트 안에 계급 조건문을 두지 않는다. 관리자 메뉴
 * 진입점은 `allowedMenus`(app/(app)/layout.tsx가 can()으로 미리 계산)에 그
 * 메뉴 키가 있을 때만 존재한다.
 */
export function roleMenu(viewer: RoleMenuViewer): RoleMenu {
  return {
    topBarMenu: [...TOP_BAR_MENU],
    adminMenu: buildAdminMenu(viewer),
    accountGroup: buildAccountGroup(),
    bottomTabs: buildBottomTabs(viewer),
  };
}
