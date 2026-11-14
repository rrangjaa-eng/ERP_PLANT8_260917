// 클라이언트 import 금지 — 순수 부품은 access-rules.ts
// domain/custom-fields/access.ts — 07.5-01: 보는 사람의 입력 칸 집합 하나(서버 읽기). 폼 입력 칸 · 목록 열 · 검색 키 · 거르개 · CSV가 같은 집합이다.
import { readCustomFieldAccess } from "@/repositories/permissions";
import type { DbOrTx } from "@/repositories/document-counters";
import type { FieldDefinitionTarget } from "@/domain/custom-fields/targets";
import type { InputFieldDef } from "@/domain/custom-fields/preserve";
import type { Viewer } from "@/domain/viewer";

export type CustomFieldInputDef = InputFieldDef & { id: string; sortOrder: number; optionsColumn: string[] | null };

// 04.5-05: 대상 값의 바깥 문(valueInfoItem)이 보이면 활성 ∩ 칸별 보임(03의 visibleCustomFieldKeys와 같은 규칙), 아니면 빈 집합.
// knownKeys는 정의 전체 키(보관 · 노출 행 없는 칸 포함). 정의 · 두 보임을 SQL 한 문(한 스냅숏)으로 읽는다(T-04.5-44).
// tx는 받은 그대로 넘긴다(domain은 db를 import하지 않는다).
export async function readCustomFieldInputs(
  viewer: Viewer,
  target: { entity: FieldDefinitionTarget; valueInfoItem: string },
  tx?: DbOrTx,
): Promise<{ inputDefs: CustomFieldInputDef[]; knownKeys: Set<string> }> {
  const access = await readCustomFieldAccess(viewer, viewer.roleId, target, tx);
  const inputDefs = access.valueVisible
    ? access.definitions
        .filter((def) => def.archivedAt === null && access.visibleFieldKeys.has(def.key))
        .map((def) => {
          const optionsColumn = Array.isArray(def.options) ? (def.options as string[]) : null;
          return {
            id: def.id,
            key: def.key,
            label: def.label,
            type: def.type as InputFieldDef["type"],
            options: optionsColumn ?? [],
            archivedOptions: def.archivedOptions,
            required: def.required,
            sortOrder: def.sortOrder,
            optionsColumn,
          };
        })
    : [];
  return { inputDefs, knownKeys: new Set(access.definitions.map((def) => def.key)) };
}
