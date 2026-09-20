// D-38: Server Action 레지스트리 — 순수 런타임 등록(강제 팩토리 없음, YAGNI).
// 03-03의 누수 스캔 생성기가 이 배열을 테스트 입력으로 읽는다. registerAction이
// 같은 name의 중복 등록을 거부해 모듈이 두 번 평가돼도 항목이 둘 생기지 않는다.
export type ActionRegistryEntry = {
  name: string;
  menu: string;
  action: "view" | "write" | "approve";
  dtoName: string | null;
};

export const ACTION_REGISTRY: ActionRegistryEntry[] = [];

export class DuplicateActionError extends Error {}

export function registerAction(entry: ActionRegistryEntry): void {
  if (ACTION_REGISTRY.some((existing) => existing.name === entry.name)) {
    throw new DuplicateActionError(`이미 등록된 action입니다: ${entry.name}`);
  }
  ACTION_REGISTRY.push(entry);
}
