import { randomUUID } from "node:crypto";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { withTransaction } from "@/lib/db-transaction";
import { isUniqueViolation } from "@/lib/pg-errors";
import { insertFieldDefinition, lockCustomFieldGrants, type DbOrTx } from "@/repositories/field-definitions";
import { listRoles as defaultListRoles } from "@/repositories/roles";
import { insertVisibilityIfAbsent as defaultInsertVisibility } from "@/repositories/permissions";
import type { CreateFieldDefinitionInput } from "@/domain/custom-fields/admin-input";

const MENU = "admin.field-definitions";

// 이 플랜의 대상은 거래처 하나 — 요청이 대상을 고를 수 없다(08이 targets.ts 등록부로 옮긴다).
const FIELD_ENTITY = "vendor";

// 정보 노출표 항목 키 규약 `cf.<entity>.<key>`(08이 targets.ts로 옮긴다).
function customFieldInfoItem(entity: string, key: string): string {
  return `cf.${entity}.${key}`;
}

// 키 충돌(entity, key)이면 새 키로 트랜잭션 전체를 다시 연다 — 제약 위반 뒤의 트랜잭션은 쓸 수 없다.
const KEY_ATTEMPTS = 3;

// 키는 이름에서 유도하지 않는다(A1) — 이름을 바꿔도 키는 그대로다.
function generateFieldKey(): string {
  return `cf_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export type CreateFieldDefinitionDeps = {
  can: typeof defaultCan;
  generateKey: () => string;
  listRoles: (viewer: Viewer, opts: { includeArchived: boolean }, tx: DbOrTx) => Promise<Array<{ id: string }>>;
  insertVisibility: (
    viewer: Viewer,
    input: { roleId: string; infoItem: string; visible: boolean; updatedBy?: string | null },
    tx: DbOrTx,
  ) => Promise<void>;
  recordAction: typeof defaultRecordAction;
};

// 칸 정의와 전 계급(보관 계급 포함) 노출 행을 한 트랜잭션에서 만든다 — 중간에 실패하면 아무것도
// 남지 않는다. 트랜잭션 첫 문장이 lockCustomFieldGrants이고 계급 목록은 그 뒤 같은 연결에서 읽는다
// (T-04.5-07: 계급 생성 쪽 부여와 직렬화 · 잠금을 쥔 채 풀의 두 번째 연결을 요구하지 않는다).
export async function createFieldDefinition(
  viewer: Viewer,
  input: CreateFieldDefinitionInput,
  deps?: Partial<CreateFieldDefinitionDeps>,
): Promise<{ id: string; key: string }> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, MENU, "write"))) throw new ForbiddenError("권한 없음");

  const listRoles = deps?.listRoles ?? defaultListRoles;
  const insertVisibility = deps?.insertVisibility ?? defaultInsertVisibility;
  const generateKey = deps?.generateKey ?? generateFieldKey;

  const created = await insertWithKeyRetry(viewer, input, generateKey, listRoles, insertVisibility);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "document_create",
    entity: "field_definitions",
    entityId: created.id,
    detail: { key: created.key, entity: FIELD_ENTITY },
  });

  return created;
}

async function insertWithKeyRetry(
  viewer: Viewer,
  input: CreateFieldDefinitionInput,
  generateKey: () => string,
  listRoles: CreateFieldDefinitionDeps["listRoles"],
  insertVisibility: CreateFieldDefinitionDeps["insertVisibility"],
): Promise<{ id: string; key: string }> {
  for (let attempt = 1; ; attempt += 1) {
    const key = generateKey();
    try {
      return { id: await insertWithGrants(viewer, input, key, listRoles, insertVisibility), key };
    } catch (error) {
      // 이름 유일(field_definitions_entity_label_key) 등 다른 위반은 다시 하지 않는다.
      if (attempt >= KEY_ATTEMPTS || !isUniqueViolation(error, "field_definitions_entity_key_key")) throw error;
    }
  }
}

async function insertWithGrants(
  viewer: Viewer,
  input: CreateFieldDefinitionInput,
  key: string,
  listRoles: CreateFieldDefinitionDeps["listRoles"],
  insertVisibility: CreateFieldDefinitionDeps["insertVisibility"],
): Promise<string> {
  const id = randomUUID();
  await withTransaction(async (tx) => {
    await lockCustomFieldGrants(viewer, tx);
    const roles = await listRoles(viewer, { includeArchived: true }, tx);
    await insertFieldDefinition(
      viewer,
      {
        id,
        entity: FIELD_ENTITY,
        key,
        label: input.name.trim(),
        type: input.type,
        required: input.required,
        sortOrder: input.sortOrder,
      },
      tx,
    );
    for (const role of roles) {
      await insertVisibility(
        viewer,
        { roleId: role.id, infoItem: customFieldInfoItem(FIELD_ENTITY, key), visible: true, updatedBy: viewer.id },
        tx,
      );
    }
  });
  return id;
}
