import type { Viewer } from "@/domain/viewer";
import { scopeFor } from "@/domain/permissions/scope-for";
import { can } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { taxRuleSchema, type TaxRule } from "@/domain/code-tables/tax-rule";
import {
  listCodeItems as repoListCodeItems,
  insertCodeItem as repoInsertCodeItem,
  setCodeItemActive as repoSetCodeItemActive,
  findCodeItemById as repoFindCodeItemById,
  setCodeItemTaxRule as repoSetCodeItemTaxRule,
  type CodeItemRow,
} from "@/repositories/code-tables";

export class ForbiddenError extends UserFacingError {}
// 03-06: 증빙 종류(evidence_type) 항목이 아닌 코드표 항목에 세금 규칙을
// 저장하려는 시도 — 세금 규칙은 그 코드표에만 의미가 있다.
export class NotEvidenceTypeError extends UserFacingError {}

const EVIDENCE_TYPE_TABLE_KEY = "evidence_type";

// MAST-04: 코드표 항목 DTO. id·tableKey·sortOrder·active·archivedAt은
// "code_item.value" 정보 항목(구조/식별 정보) 아래, label만 별도
// "code_item.label" 정보 항목으로 가른다(judgment — SUMMARY 참고). 서버가
// 정보 노출표 판정으로 필드를 거른다 — 화면 코드는 계급 이름 분기가 없다.
export type CodeItemDto = {
  id: string;
  tableKey: string;
  value: string;
  label: string;
  sortOrder: number;
  active: boolean;
  archivedAt: Date | null;
  // evidence_type이 아닌 코드표 항목은 항상 null(컬럼 자체가 그 항목엔
  // 비어 있다).
  taxRule: TaxRule | null;
};

export const CODE_ITEM_DTO_SPEC: DtoSpec<CodeItemRow, CodeItemDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "code_item.value" },
    { key: "tableKey", from: "tableKey", infoItem: "code_item.value" },
    { key: "value", from: "value", infoItem: "code_item.value" },
    { key: "label", from: "label", infoItem: "code_item.label" },
    { key: "sortOrder", from: "sortOrder", infoItem: "code_item.value" },
    { key: "active", from: "active", infoItem: "code_item.value" },
    { key: "archivedAt", from: "archivedAt", infoItem: "code_item.value" },
    { key: "taxRule", from: "taxRule", infoItem: "code_item.value" },
  ],
};

// D-38·성공 기준 3: DTO 레지스트리 항목을 CODE_ITEM_DTO_SPEC에서 파생시킨다
// — spec과 레지스트리 항목을 각각 손으로 적으면 정본이 둘이 되어 조용히
// 어긋난다. 누수 스캔(leak-scan.test.ts)의 DTO 축이 이 등록을 읽는다.
registerDto({
  name: "CodeItemDto",
  fields: CODE_ITEM_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 읽기는 행 필터 서술자 → 리포지토리 → 투영 순서로 흐르고 행 객체를 그대로
// 돌려주지 않는다. 단순 조회 경로에서는 recordAction을 아예 부르지 않는다.
export async function listCodeItems(
  viewer: Viewer,
  tableKey: string,
  opts?: { includeInactive?: boolean },
): Promise<CodeItemDto[]> {
  const scope = await scopeFor(viewer, "code_items");
  const rows = await repoListCodeItems(viewer, {
    tableKey,
    scope,
    includeInactive: opts?.includeInactive ?? false,
  });
  const dtos = await Promise.all(rows.map((row) => project(viewer, row, CODE_ITEM_DTO_SPEC)));
  return dtos as CodeItemDto[];
}

// 쓰기는 코드표 메뉴의 쓰기 권한을 먼저 확인하고 실패 시 ForbiddenError, 성공
// 시 recordAction으로 document_create를 남긴다.
export async function createCodeItem(
  viewer: Viewer,
  input: { tableKey: string; value: string; label: string; sortOrder?: number },
): Promise<CodeItemDto> {
  const allowed = await can(viewer, "admin.code-tables", "write");
  if (!allowed) throw new ForbiddenError("코드표 항목 추가 권한이 없습니다.");

  const row = await repoInsertCodeItem(viewer, input);
  await recordAction(viewer, { actionType: "document_create", entity: "code_items", entityId: row.id });

  return (await project(viewer, row, CODE_ITEM_DTO_SPEC)) as CodeItemDto;
}

// 활성 상태 변경은 현재 값과 요청 값이 같으면 DB 쓰기를 건너뛴다(멱등). OPS-05의
// 핵심 행동 종류 목록에 이 조작에 대응하는 종류가 없어(단순 상태 토글) 이 함수는
// recordAction을 부르지 않는다(judgment — SUMMARY 참고).
export async function setCodeItemActive(
  viewer: Viewer,
  id: string,
  active: boolean,
): Promise<CodeItemDto | null> {
  const allowed = await can(viewer, "admin.code-tables", "write");
  if (!allowed) throw new ForbiddenError("코드표 항목 상태 변경 권한이 없습니다.");

  const current = await repoFindCodeItemById(viewer, id);
  if (!current) return null;

  if (current.active === active) {
    return (await project(viewer, current, CODE_ITEM_DTO_SPEC)) as CodeItemDto;
  }

  await repoSetCodeItemActive(viewer, id, active);
  const updated = await repoFindCodeItemById(viewer, id);
  return updated ? ((await project(viewer, updated, CODE_ITEM_DTO_SPEC)) as CodeItemDto) : null;
}

// 03-06: 증빙 종류 코드표 항목의 세금 규칙 저장 — taxRuleSchema로 검증하고,
// evidence_type 코드표 항목에만 허용한다(다른 코드표 항목에 세금 규칙을
// 넣는 것을 거부한다).
export async function setEvidenceTypeTaxRule(
  viewer: Viewer,
  id: string,
  taxRule: unknown,
): Promise<CodeItemDto | null> {
  const allowed = await can(viewer, "admin.code-tables", "write");
  if (!allowed) throw new ForbiddenError("세금 규칙 변경 권한이 없습니다.");

  const current = await repoFindCodeItemById(viewer, id);
  if (!current) return null;
  if (current.tableKey !== EVIDENCE_TYPE_TABLE_KEY) {
    throw new NotEvidenceTypeError("증빙 종류 코드표 항목에만 세금 규칙을 저장할 수 있습니다.");
  }

  const parsed = taxRuleSchema.parse(taxRule);
  await repoSetCodeItemTaxRule(viewer, id, parsed);

  const updated = await repoFindCodeItemById(viewer, id);
  return updated ? ((await project(viewer, updated, CODE_ITEM_DTO_SPEC)) as CodeItemDto) : null;
}
