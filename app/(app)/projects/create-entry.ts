// quick 261001-85g(사용자 결정 2026-10-01 · /qa · /design-review) — 프로젝트 등록 진입점 규칙(목록 「프로젝트 등록」과
// 상세 「프로젝트 복사」가 같이 쓴다)과 프로젝트가 하나도 없는 빈 목록. 팀 · 담당 PM 수는 업무 범위로 좁힌 선택지
// (scopeCreateFormReferences)의 수다 — 팀 업무 범위인데 오늘 팀이 없으면 0이라 등록할 수 없다(할 수 없는 선택지는 숨김).
type CreateChoices = { canWrite: boolean; teamCount: number; pmUserCount: number; clientCount: number };

export function canCreateProject(input: CreateChoices): boolean {
  return input.canWrite && input.teamCount > 0 && input.pmUserCount > 0 && input.clientCount > 0;
}

// 빈 화면은 무엇이 없는지 · 다음 한 수(SYSTEM.md §7-7 EMPTY). 거래처만 없어 등록할 수 없고 거래처를 만들 수 있을 때만
// 「거래처 등록」 — 거래처 정보가 가려져 목록이 빈 계급(vendorShown 거짓)은 거래처가 없는 것이 아니라 행동이 없다.
export function projectsEmptyState(
  input: CreateChoices & { vendorShown: boolean; canWriteVendors: boolean; canViewVendors: boolean },
): { message: string; action: { label: string; href: string } | undefined } {
  if (canCreateProject(input)) {
    return { message: "등록된 프로젝트가 없습니다", action: { label: "프로젝트 등록", href: "/projects?new=1" } };
  }
  const onlyClientsMissing = input.clientCount === 0 && canCreateProject({ ...input, clientCount: 1 });
  // Codex 리뷰 P2 — 거래처 화면은 보기 권한이 없으면 404다. 쓰기만 있는 계급에게 링크를 주지 않는다.
  if (onlyClientsMissing && input.vendorShown && input.canWriteVendors && input.canViewVendors) {
    return { message: "등록된 거래처가 없습니다", action: { label: "거래처 등록", href: "/admin/vendors?new=1" } };
  }
  return { message: "등록된 프로젝트가 없습니다", action: undefined };
}
