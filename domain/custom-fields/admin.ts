import { randomUUID } from "node:crypto";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { withTransaction } from "@/lib/db-transaction";
import { isUniqueViolation } from "@/lib/pg-errors";
import {
  insertFieldDefinition,
  listFieldDefinitions,
  lockCustomFieldGrants,
  type DbOrTx,
} from "@/repositories/field-definitions";
import { listRoles as defaultListRoles } from "@/repositories/roles";
import { insertVisibilityIfAbsent as defaultInsertVisibility } from "@/repositories/permissions";
import { createFieldDefinitionInput, type CreateFieldDefinitionInput } from "@/domain/custom-fields/admin-input";
import { FIELD_DEFINITION_TARGETS, customFieldInfoItem } from "@/domain/custom-fields/targets";
import { PERMISSION_DENIED_CAUSE } from "@/lib/actions/form-reason";
import { UserFacingError } from "@/lib/actions/user-facing-error";

const MENU = "admin.field-definitions";

// 요청이 대상을 고를 수 없다 — 서버가 대상 등록부의 거래처를 넣는다.
const FIELD_ENTITY = FIELD_DEFINITION_TARGETS[0];

// 이름은 보관된 칸까지 포함해 거래처 안에서 유일하다(D10-12). 문구는 액션이 nameConflictMessage로 고른다.
export class DuplicateFieldNameError extends UserFacingError {
  constructor(readonly archived: boolean) {
    super(archived ? "보관함에 같은 이름의 화면 항목 있음" : "같은 이름의 화면 항목 있음");
    this.name = "DuplicateFieldNameError";
  }
}

const NAME_UNIQUE_CONSTRAINT = "field_definitions_entity_label_key";

async function defaultFindNameConflict(viewer: Viewer, name: string): Promise<{ archived: boolean } | null> {
  const rows = await listFieldDefinitions(viewer, FIELD_ENTITY);
  const match = rows.find((row) => row.label === name);
  return match ? { archived: match.archivedAt !== null } : null;
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
  // 이름 예약 조회(경합 테스트가 건너뛰게 주입한다) — 같은 이름의 칸이 있으면 { archived }.
  findNameConflict: (viewer: Viewer, name: string) => Promise<{ archived: boolean } | null>;
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
  if (!(await canFn(viewer, MENU, "write"))) throw new ForbiddenError(PERMISSION_DENIED_CAUSE);

  // 액션 밖 호출자 방어(T-04.5-52) — 입력 스키마와 같은 상수로 이름 자르기 · 길이 · 정렬 범위를 다시 판정한다.
  const parsed = createFieldDefinitionInput.parse(input);
  const findNameConflict = deps?.findNameConflict ?? defaultFindNameConflict;
  const conflict = await findNameConflict(viewer, parsed.name);
  if (conflict) throw new DuplicateFieldNameError(conflict.archived);

  const listRoles = deps?.listRoles ?? defaultListRoles;
  const insertVisibility = deps?.insertVisibility ?? defaultInsertVisibility;
  const generateKey = deps?.generateKey ?? generateFieldKey;

  const created = await insertWithKeyRetry(viewer, parsed, generateKey, listRoles, insertVisibility);

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
      // 조회와 쓰기 사이 경합으로 이름 유일 위반이 나면 같은 조회로 활성 · 보관을 가려 같은 오류로 바꾼다.
      if (isUniqueViolation(error, NAME_UNIQUE_CONSTRAINT)) {
        const conflict = await defaultFindNameConflict(viewer, input.name);
        if (conflict) throw new DuplicateFieldNameError(conflict.archived);
        throw error;
      }
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

// 관리 화면 목록 DTO — 행 타입을 그대로 돌려주지 않고 다시 매핑한다. 키는 화면 어느 열에도 그리지 않는다.
export const FIELD_DEFINITION_ADMIN_DTO_FIELDS = [
  "id",
  "key",
  "label",
  "type",
  "options",
  "archivedOptions",
  "required",
  "sortOrder",
  "version",
  "archived",
] as const;

export type FieldDefinitionAdminDto = {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options: string[];
  archivedOptions: string[];
  required: boolean;
  sortOrder: number;
  version: number;
  archived: boolean;
};

export type ListFieldDefinitionsForAdminDeps = {
  can: typeof defaultCan;
  listFieldDefinitions: typeof listFieldDefinitions;
};

const FIELD_TYPES: ReadonlyArray<FieldDefinitionAdminDto["type"]> = ["text", "number", "date", "select"];

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toFieldType(value: string): FieldDefinitionAdminDto["type"] {
  const found = FIELD_TYPES.find((type) => type === value);
  if (!found) throw new Error(`알 수 없는 칸 타입: ${value}`);
  return found;
}

// 거래처 정의 전부(보관 포함 — 화면이 거른다)를 listFieldDefinitions 순서(sortOrder, key) 그대로.
export async function listFieldDefinitionsForAdmin(
  viewer: Viewer,
  deps?: Partial<ListFieldDefinitionsForAdminDeps>,
): Promise<FieldDefinitionAdminDto[]> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, MENU, "view"))) throw new ForbiddenError(PERMISSION_DENIED_CAUSE);

  const list = deps?.listFieldDefinitions ?? listFieldDefinitions;
  const rows = await list(viewer, FIELD_ENTITY);
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    type: toFieldType(row.type),
    options: toStringArray(row.options),
    archivedOptions: toStringArray(row.archivedOptions),
    required: row.required,
    sortOrder: row.sortOrder,
    version: row.version,
    archived: row.archivedAt !== null,
  }));
}
