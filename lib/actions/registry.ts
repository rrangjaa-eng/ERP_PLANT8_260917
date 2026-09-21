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

// D-38·성공 기준 3: 내보내기(Excel 등) 함수 레지스트리 — 세 번째 축.
// `menu`는 그 내보내기를 게이트하는 메뉴(보기 권한)이고, `dtoName`은 내보내는
// 행이 어느 DTO를 지나는지다. `dtoName: null`은 행 DTO를 내보내지 않는
// 함수에만 허용된다(예: 사람 단위 정보 항목이 없는 키-값 스냅샷) — 그 함수는
// 노출표가 아니라 메뉴 보기 권한이 게이트다. 행을 내보내는 함수는 반드시
// DTO 이름을 적는다. 이 플랜은 빈 배열과 등록 함수만 만든다 — 03-04(설정
// JSON, dtoName: null)와 03-07(행동 로그, DTO 있음)이 항목을 넣으면 누수
// 스캔의 내보내기 축이 자동으로 그 항목을 검사한다.
export type ExportRegistryEntry = {
  name: string;
  menu: string;
  dtoName: string | null;
};

export const EXPORT_REGISTRY: ExportRegistryEntry[] = [];

export class DuplicateExportError extends Error {}

export function registerExport(entry: ExportRegistryEntry): void {
  if (EXPORT_REGISTRY.some((existing) => existing.name === entry.name)) {
    throw new DuplicateExportError(`이미 등록된 export입니다: ${entry.name}`);
  }
  EXPORT_REGISTRY.push(entry);
}
