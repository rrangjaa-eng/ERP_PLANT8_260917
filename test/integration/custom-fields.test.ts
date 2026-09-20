import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createVendor } from "@/domain/vendors";
import {
  insertFieldDefinition,
  updateFieldDefinition,
  findFieldDefinitionById,
} from "@/repositories/field-definitions";

const VENDOR_ENTITY = "vendor";

describe("custom fields (ROADMAP 트레일링 스키마 규약, 실제 Postgres)", () => {
  it("등록된 키만 저장된다 — vendors.custom_fields에 정의된 필드만 실제로 담긴다", async () => {
    await insertFieldDefinition(SYSTEM_VIEWER, {
      id: `fd-${randomUUID()}`,
      entity: VENDOR_ENTITY,
      key: "contractNote",
      type: "text",
      required: false,
    });

    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: `거래처-${randomUUID()}`,
      customFields: { contractNote: "특이사항 없음" },
    });

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id)).limit(1);
    expect(row?.customFields).toEqual({ contractNote: "특이사항 없음" });
  });

  it("등록되지 않은 키를 거부한다", async () => {
    await insertFieldDefinition(SYSTEM_VIEWER, {
      id: `fd-${randomUUID()}`,
      entity: VENDOR_ENTITY,
      key: "registeredKey",
      type: "text",
      required: false,
    });

    await expect(
      createVendor(SYSTEM_VIEWER, {
        name: `거래처-${randomUUID()}`,
        customFields: { registeredKey: "값", unregisteredKey: "안됨" },
      }),
    ).rejects.toThrow();
  });

  it("타입이 맞지 않는 값을 거부한다 — select 필드에 등록되지 않은 선택지", async () => {
    await insertFieldDefinition(SYSTEM_VIEWER, {
      id: `fd-${randomUUID()}`,
      entity: VENDOR_ENTITY,
      key: "grade",
      type: "select",
      options: ["A", "B"],
      required: false,
    });

    await expect(
      createVendor(SYSTEM_VIEWER, {
        name: `거래처-${randomUUID()}`,
        customFields: { grade: "C" },
      }),
    ).rejects.toThrow();
  });

  it("필드 정의 갱신 함수가 타입 컬럼을 대상으로 받지 않는다 — 타입은 갱신 후에도 그대로다", async () => {
    const id = `fd-${randomUUID()}`;
    await insertFieldDefinition(SYSTEM_VIEWER, {
      id,
      entity: `test-entity-${randomUUID()}`,
      key: "k1",
      type: "text",
      required: false,
    });

    await updateFieldDefinition(SYSTEM_VIEWER, id, { required: true, sortOrder: 5 });

    const after = await findFieldDefinitionById(SYSTEM_VIEWER, id);
    expect(after?.type).toBe("text");
    expect(after?.required).toBe(true);
    expect(after?.sortOrder).toBe(5);
  });

  it("같은 (entity, key) 조합을 두 번 정의하면 거부된다(복합 UNIQUE)", async () => {
    const entity = `test-entity-${randomUUID()}`;
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity, key: "dup", type: "text" });
    await expect(
      insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity, key: "dup", type: "number" }),
    ).rejects.toThrow();
  });

  it("마스터 표 custom_fields 컬럼에 GIN 인덱스가 실제로 존재한다(pg_indexes 조회)", async () => {
    const result = await db.execute(
      sql`select indexname, indexdef from pg_indexes where indexname like '%custom_fields_idx%' order by indexname`,
    );
    const rows = result.rows as { indexname: string; indexdef: string }[];
    const names = rows.map((r) => r.indexname);

    for (const expected of [
      "vendors_custom_fields_idx",
      "code_items_custom_fields_idx",
      "roles_custom_fields_idx",
      "org_units_custom_fields_idx",
      "teams_custom_fields_idx",
      "corp_cards_custom_fields_idx",
    ]) {
      expect(names).toContain(expected);
    }
    for (const row of rows) {
      expect(row.indexdef.toLowerCase()).toContain("using gin");
    }
  });
});
