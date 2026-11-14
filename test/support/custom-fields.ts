import { randomUUID } from "node:crypto";
import { customFieldInfoItem, type FieldDefinitionTarget } from "@/domain/custom-fields/targets";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import { insertVisibilityIfAbsent } from "@/repositories/permissions";

// 07.5: 통합 시험용 추가 칸 시드 — 정의 + 계급마다 `cf.<entity>.<key>` 보임 행 쌍(Pitfall 7: 정의만 넣고 보임 행이 없으면 값이 조용히 버려진다).
// 키는 `cf_` + 무작위 8자(domain/custom-fields/admin.ts 생성 규칙과 같은 꼴). 보임 행이 없는 계급은 이 칸이 안 보인다.
export async function seedCustomFieldDefinition(
  entity: FieldDefinitionTarget,
  def: { label: string; type: "text" | "number" | "date" | "select"; required?: boolean; options?: string[]; sortOrder?: number },
  opts: { visibleRoleIds: readonly string[] },
): Promise<{ id: string; key: string }> {
  const id = randomUUID();
  const key = `cf_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await insertFieldDefinition(SYSTEM_VIEWER, {
    id,
    entity,
    key,
    label: def.label,
    type: def.type,
    options: def.options,
    required: def.required ?? false,
    sortOrder: def.sortOrder ?? 1,
  });
  for (const roleId of opts.visibleRoleIds) {
    await insertVisibilityIfAbsent(SYSTEM_VIEWER, { roleId, infoItem: customFieldInfoItem(entity, key), visible: true });
  }
  return { id, key };
}
