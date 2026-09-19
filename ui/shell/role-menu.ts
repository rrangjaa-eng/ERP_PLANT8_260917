// D-23: 역할 → (상단 바 메뉴, 폰 하단 탭, 계정 그룹, 관리자 시스템 상태 진입점) 매핑을
// 데이터로 한 곳에 둔다. SYSTEM.md §6-0이 정본이다.
//
// Phase 2는 D-14의 관리자·직원 두 계급만 채운다. Phase 3이 계급 5종·정보 노출표로
// 바꿀 때 이 파일 하나만 교체하고 ui/shell/의 다른 컴포넌트는 건드리지 않는다 — 그래서
// 셸 컴포넌트 쪽에는 역할 분기(`isAdmin` 조건문)를 두지 않는다.
//
// `ui`는 `ui`·`lib`만 import할 수 있다(D-26 boundaries) — 이 파일은 둘 다 필요로
// 하지 않는 순수 상수·함수라 domain/repositories를 참조하지 않는다. 입력 타입은
// lib/actions/client.ts의 `ctx.viewer`가 이미 쓰는 최소 모양(관리자 여부)을
// 구조적으로만 흉내 낸다 — domain/viewer.ts의 `Viewer` 타입을 직접 import하지 않는다.
export type RoleMenuViewer = {
  isAdmin: boolean;
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
  /** SYSTEM.md §6-0 (a) PC 사용자 메뉴 + §6-8 — 관리자만, 직원은 null(D-17). */
  systemStatus: MenuLink | null;
  /** SYSTEM.md §6-0 (a) PC 사용자 메뉴 · §7-8 「더보기」 시트의 「계정」 그룹. */
  accountGroup: AccountEntry[];
  /** SYSTEM.md §6-0 폰 하단 탭 — 정확히 4개, 4번째는 항상 「더보기」(시트를 여는 동작, 라우트 아님). */
  bottomTabs: BottomTab[];
};

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

// D-17: 관리자 전용 시스템 상태 화면(§6-8) — PC 사용자 메뉴와 관리자용 「더보기」
// 시트 둘 다의 진입점이다. 라우트 자체는 Task 3이 (app) 그룹 안으로 옮기지만
// URL(/admin/system-status)은 이동으로 바뀌지 않는다(라우트 그룹은 URL에 영향 없음).
const SYSTEM_STATUS: MenuLink = { label: "시스템 상태", href: "/admin/system-status" };

// 02-01 체크포인트 항목 H① 확정 — 「설정」은 실제 라우트(02-05가 /settings를 만든다).
// SYSTEM.md §6-0/§7-8의 계정 그룹 목록에서 「설정」이 빠지면(H②·③) 이 상수를 지운다 —
// role-menu.test.ts는 이 상수가 아니라 SYSTEM.md의 계정 그룹 문장을 기준으로
// 통과/실패가 갈리므로, 문서를 바꾸고 이 상수를 잊으면 테스트가 즉시 알린다.
const SETTINGS_ENTRY: AccountEntry = { kind: "link", label: "설정", href: "/settings" };

function buildAccountGroup(): AccountEntry[] {
  return [
    { kind: "link", label: "내 정보", href: "/account" },
    SETTINGS_ENTRY,
    { kind: "action", label: "로그아웃", action: "logout" },
  ];
}

// SYSTEM.md §6-0 역할별 탭 표의 「관리자」·「직원」 두 행(D-14 임시 상태) — Phase 3이
// 계급 5종으로 바꿀 때 이 함수 본문만 다시 쓴다.
function buildBottomTabs(viewer: RoleMenuViewer): BottomTab[] {
  const roleTabs: BottomTab[] = viewer.isAdmin
    ? [
        { kind: "link", label: "내 차례", href: "/" },
        { kind: "link", label: "결재", href: "/approvals" },
        { kind: "link", label: "손익", href: "/pnl" },
      ]
    : [
        { kind: "link", label: "내 차례", href: "/" },
        { kind: "link", label: "프로젝트", href: "/projects" },
        { kind: "link", label: "지출결의", href: "/expenses" },
      ];
  return [...roleTabs, { kind: "more", label: "더보기" }];
}

/**
 * 역할 → 셸 메뉴 매핑. 순수 함수 — 부작용 없음, 같은 입력엔 항상 같은 결과다.
 * `ui/shell/Shell.tsx`·`TopBar.tsx`·`BottomTabs.tsx`·`MoreSheet.tsx`는 이 함수의
 * 결과만 받아 렌더한다 — 컴포넌트 안에 `isAdmin` 조건문을 두지 않는다.
 */
export function roleMenu(viewer: RoleMenuViewer): RoleMenu {
  return {
    topBarMenu: [...TOP_BAR_MENU],
    systemStatus: viewer.isAdmin ? { ...SYSTEM_STATUS } : null,
    accountGroup: buildAccountGroup(),
    bottomTabs: buildBottomTabs(viewer),
  };
}
