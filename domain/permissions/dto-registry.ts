// D-38·성공 기준 3: DTO 레지스트리 — 이후 페이즈가 새 DTO를 등록만 하면
// 누수 스캔(leak-scan.test.ts)이 그 DTO × 계급 케이스를 자동으로 생성한다.
// 순수 런타임 등록(강제 팩토리 없음, D-38과 같은 결). registerDto가 같은
// name 중복 등록을 거부해 모듈이 두 번 평가돼도 항목이 둘 생기지 않는다.
export type DtoRegistryEntry = {
  name: string;
  fields: ReadonlyArray<{ key: string; infoItem: string }>;
};

export const DTO_REGISTRY: DtoRegistryEntry[] = [];

export class DuplicateDtoError extends Error {}

export function registerDto(entry: DtoRegistryEntry): void {
  if (DTO_REGISTRY.some((existing) => existing.name === entry.name)) {
    throw new DuplicateDtoError(`이미 등록된 DTO입니다: ${entry.name}`);
  }
  DTO_REGISTRY.push(entry);
}
