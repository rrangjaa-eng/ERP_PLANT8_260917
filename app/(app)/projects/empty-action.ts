// quick 261001-85g(사용자 결정 2026-10-01) — 프로젝트가 하나도 없는 빈 목록의 행동(빈 화면은 다음 행동으로 이끈다).
// 등록할 수 있으면 「프로젝트 등록」. 거래처가 하나도 없어 등록할 수 없고 거래처를 만들 수 있으면 「거래처 등록」 —
// 거래처 정보가 가려져 목록이 빈 계급(vendorShown 거짓)은 거래처가 없는 것이 아니라 행동이 없다.
export function projectsEmptyAction(input: {
  canCreate: boolean;
  canWrite: boolean;
  vendorShown: boolean;
  clientCount: number;
  canWriteVendors: boolean;
}): { label: string; href: string } | undefined {
  if (input.canCreate) return { label: "프로젝트 등록", href: "/projects?new=1#project-form" };
  if (input.canWrite && input.vendorShown && input.clientCount === 0 && input.canWriteVendors) {
    return { label: "거래처 등록", href: "/admin/vendors?new=1#vendor-form" };
  }
  return undefined;
}
