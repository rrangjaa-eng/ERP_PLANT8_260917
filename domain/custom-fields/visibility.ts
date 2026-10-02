import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  listFieldDefinitions as defaultListFieldDefinitions,
  lockCustomFieldGrants,
} from "@/repositories/field-definitions";
import { insertVisibilityIfAbsent, listVisibility } from "@/repositories/permissions";
import { FIELD_DEFINITION_TARGETS, customFieldInfoItem, parseCustomFieldInfoItem } from "@/domain/custom-fields/targets";

// 04.5-03: 커스텀 항목(cf.<entity>.<key>)의 노출 — INFO_ITEMS(코드 상수) 옆에 더한다(add-alongside).
// 이 모듈은 domain/permissions/roles.ts를 정적으로 import하지 않는다(roles → 이 모듈 → viewer → roles 순환).

export type CustomFieldColumn = { id: string; label: string };

// 노출표 열: 대상마다 활성 정의를 기존 정렬(sortOrder, key) 그대로.
export async function customFieldColumns(viewer: Viewer): Promise<CustomFieldColumn[]> {
  const columns: CustomFieldColumn[] = [];
  for (const entity of FIELD_DEFINITION_TARGETS) {
    const defs = await defaultListFieldDefinitions(viewer, entity);
    for (const def of defs) {
      if (def.archivedAt === null) columns.push({ id: customFieldInfoItem(entity, def.key), label: def.label });
    }
  }
  return columns;
}

const infoItemKeys = new Set(INFO_ITEMS.map((item) => item.key));

// 노출표 저장 허용: INFO_ITEMS 키, 또는 대상 상수 안에서 활성 정의가 실제로 있는 cf. 키(T-04.5-03).
export async function isAssignableInfoItem(infoItem: string): Promise<boolean> {
  if (infoItemKeys.has(infoItem)) return true;
  const parsed = parseCustomFieldInfoItem(infoItem);
  if (!parsed) return false;
  const entity = FIELD_DEFINITION_TARGETS.find((target) => target === parsed.entity);
  if (!entity) return false;
  const defs = await defaultListFieldDefinitions(SYSTEM_VIEWER, entity);
  return defs.some((def) => def.key === parsed.key && def.archivedAt === null);
}

export type GrantCustomFieldsDeps = { listFieldDefinitions: typeof defaultListFieldDefinitions };

// 새 계급의 기본 행: 대상 상수 안의 모든 정의(보관 포함 — 복원 때 기본값이 살아 있게)에 보임 행을 없을 때만.
export async function grantCustomFieldsToRole(
  viewer: Viewer,
  roleId: string,
  deps?: Partial<GrantCustomFieldsDeps>,
  outerTx?: DbOrTx,
): Promise<void> {
  const listFieldDefinitions = deps?.listFieldDefinitions ?? defaultListFieldDefinitions;
  // T-04.5-07: 칸 생성(01)과 같은 잠금을 첫 문장으로 잡고, 정의는 그 뒤 같은 연결(tx)로 읽는다 — 잠금 뒤의 조회라
  // 먼저 커밋된 칸을 전부 보고, 잠금 보유자가 풀의 두 번째 연결을 요구하지 않는다(풀 고갈 교착 없음).
  // 계급 생성(createRole)은 자기 트랜잭션(outerTx)을 넘긴다 — 부여가 실패하면 계급 행도 함께 롤백된다.
  const grant = async (tx: DbOrTx) => {
    await lockCustomFieldGrants(viewer, tx);
    for (const entity of FIELD_DEFINITION_TARGETS) {
      const defs = await listFieldDefinitions(viewer, entity, tx);
      for (const def of defs) {
        await insertVisibilityIfAbsent(
          viewer,
          { roleId, infoItem: customFieldInfoItem(entity, def.key), visible: true },
          tx,
        );
      }
    }
  };
  await (outerTx ? grant(outerTx) : withTransaction(grant));
}

// 보는 사람에게 보이는 커스텀 칸 키: 그 대상의 활성 정의 중 보는 사람 계급에 cf.<entity>.<key> 보임 행이 있는 것.
// 조회는 두 번(정의 · 그 계급의 노출 행) — 행마다 visible()을 부르지 않는다. 계급이 없으면 빈 집합(기본 거부).
export async function visibleCustomFieldKeys(viewer: Viewer, entity: string): Promise<Set<string>> {
  if (!viewer.roleId) return new Set();
  const [defs, rows] = await Promise.all([
    defaultListFieldDefinitions(viewer, entity),
    listVisibility(viewer, { roleId: viewer.roleId }),
  ]);
  const shown = new Set(rows.filter((row) => row.visible).map((row) => row.infoItem));
  return new Set(
    defs
      .filter((def) => def.archivedAt === null && shown.has(customFieldInfoItem(entity, def.key)))
      .map((def) => def.key),
  );
}

// 칸 값 객체에서 보이는 키만 남긴 새 객체 — 값이 없으면(「거래처 정보」로 이미 가려짐) 그대로 없다.
export function pickVisibleCustomFields(
  values: Record<string, unknown> | undefined,
  keys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (values === undefined) return undefined;
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
}
