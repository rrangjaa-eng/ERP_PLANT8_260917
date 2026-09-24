import type { InfoItemRef } from "@/domain/permissions/project";

// D-38·성공 기준 3: DTO 레지스트리 — 이후 페이즈가 새 DTO를 등록만 하면
// 누수 스캔(leak-scan.test.ts)이 그 DTO × 계급 케이스를 자동으로 생성한다.
// 순수 런타임 등록(강제 팩토리 없음, D-38과 같은 결). registerDto가 같은
// name 중복 등록을 거부해 모듈이 두 번 평가돼도 항목이 둘 생기지 않는다.
export type DtoRegistryEntry = {
  name: string;
  fields: ReadonlyArray<{ key: string; infoItem: InfoItemRef }>;
};

export const DTO_REGISTRY: DtoRegistryEntry[] = [];

export class DuplicateDtoError extends Error {}
// Phase 4(04-32, ENG-D3 ②): all-of 필드(infoItem이 목록)는 비어 있으면 안
// 된다 — 빈 목록은 every()가 항상 참이 되어 노출표를 거치지 않고 항상
// 키가 실리는 조용한 구멍이다.
export class EmptyInfoItemsError extends Error {}

export function registerDto(entry: DtoRegistryEntry): void {
  if (DTO_REGISTRY.some((existing) => existing.name === entry.name)) {
    throw new DuplicateDtoError(`이미 등록된 DTO입니다: ${entry.name}`);
  }
  for (const field of entry.fields) {
    if (Array.isArray(field.infoItem) && field.infoItem.length === 0) {
      throw new EmptyInfoItemsError(`빈 정보 항목 목록입니다: ${entry.name}.${field.key}`);
    }
  }
  DTO_REGISTRY.push(entry);
}
