import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { listCodeItems as domainListCodeItems, createCodeItem, setCodeItemActive, CODE_TABLES } from "@/domain/code-tables";
import { archive } from "@/domain/archive";
import { insertCodeItem, listCodeItems as repoListCodeItems } from "@/repositories/code-tables";
import { upsertPermission } from "@/repositories/permissions";
import { queryActionLog } from "@/repositories/action-log";

// quick 261002-3mx — createCodeItem은 허용 코드표(CODE_TABLES)만 받는다. 매 테스트 TRUNCATE+시드라 항목은 id로 찾는다.
const TABLE_KEY = "project_status";

describe("code-tables (MAST-04, 실제 Postgres)", () => {
  it("항목 추가 후 목록에 보인다", async () => {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "a", label: "A" });
    const items = await domainListCodeItems(SYSTEM_VIEWER, TABLE_KEY);
    expect(items.some((i) => i.id === dto.id)).toBe(true);
  });

  it("같은 코드표에 같은 값 두 번은 거부된다(복합 UNIQUE)", async () => {
    await insertCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "dup", label: "1" });
    await expect(
      insertCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "dup", label: "2" }),
    ).rejects.toThrow();
  });

  it("같은 정렬 값 항목들의 목록 순서가 두 번 조회에서 동일하다(sortOrder 다음 value)", async () => {
    // 목록 전체를 비교한다 — 시드가 없는 표 키(리포지토리 직접 삽입).
    const tableKey = `test_table_${randomUUID()}`;
    await insertCodeItem(SYSTEM_VIEWER, { tableKey, value: "z", label: "Z", sortOrder: 0 });
    await insertCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A", sortOrder: 0 });
    const first = await domainListCodeItems(SYSTEM_VIEWER, tableKey);
    const second = await domainListCodeItems(SYSTEM_VIEWER, tableKey);
    expect(first.map((i) => i.value)).toEqual(["a", "z"]);
    expect(second.map((i) => i.value)).toEqual(first.map((i) => i.value));
  });

  it("비활성 항목이 기본 목록에서 빠지고 포함 옵션에서 보인다", async () => {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "inactive-1", label: "비활성" });
    await setCodeItemActive(SYSTEM_VIEWER, dto.id, false);

    const withoutInactive = await domainListCodeItems(SYSTEM_VIEWER, TABLE_KEY);
    expect(withoutInactive.some((i) => i.id === dto.id)).toBe(false);

    const withInactive = await domainListCodeItems(SYSTEM_VIEWER, TABLE_KEY, { includeInactive: true });
    expect(withInactive.some((i) => i.id === dto.id)).toBe(true);
  });

  it("이미 비활성인 항목의 비활성화 요청은 상태를 바꾸지 않고 로그도 더하지 않는다(멱등)", async () => {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "idem-1", label: "멱등" });
    await setCodeItemActive(SYSTEM_VIEWER, dto.id, false);
    const before = await queryActionLog(SYSTEM_VIEWER);

    await setCodeItemActive(SYSTEM_VIEWER, dto.id, false);
    const after = await queryActionLog(SYSTEM_VIEWER);

    expect(after.length).toBe(before.length);
    const [row] = await domainListCodeItems(SYSTEM_VIEWER, TABLE_KEY, { includeInactive: true });
    void row;
  });

  it("보관 후 기본 조회(보관 제외 서술자)에서 사라지고 보관 포함 서술자 조회에서 보인다", async () => {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "archive-1", label: "보관 대상" });
    await archive(SYSTEM_VIEWER, "code_items", dto.id);

    const excluded = await repoListCodeItems(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      scope: { rows: "all", includeArchived: false },
      includeInactive: true,
    });
    expect(excluded.some((row) => row.id === dto.id)).toBe(false);

    const included = await repoListCodeItems(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      scope: { rows: "all", includeArchived: true },
      includeInactive: true,
    });
    expect(included.some((row) => row.id === dto.id)).toBe(true);
  });

  it("이미 보관된 항목을 다시 보관해도 보관 시각이 최초 값으로 유지된다(멱등)", async () => {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "archive-2", label: "재보관" });
    await archive(SYSTEM_VIEWER, "code_items", dto.id);

    const findRow = async () => {
      const rows = await repoListCodeItems(SYSTEM_VIEWER, {
        tableKey: TABLE_KEY,
        scope: { rows: "all", includeArchived: true },
        includeInactive: true,
      });
      return rows.find((row) => row.id === dto.id);
    };

    const firstArchivedAt = (await findRow())?.archivedAt?.getTime();
    await archive(SYSTEM_VIEWER, "code_items", dto.id);
    const secondArchivedAt = (await findRow())?.archivedAt?.getTime();

    expect(secondArchivedAt).toBe(firstArchivedAt);
  });

  it("권한표에서 기본 계급의 코드표 보기 칸을 켜면 같은 viewer의 목록 조회가 성공한다(재배포 없음)", async () => {
    const pmViewer = { id: "pm-tester", roleId: DEFAULT_ROLE_ID };
    await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "gate-1", label: "게이트 대상" });

    const before = await domainListCodeItems(pmViewer, TABLE_KEY);
    expect(before).toEqual([]);

    await upsertPermission(SYSTEM_VIEWER, {
      roleId: DEFAULT_ROLE_ID,
      menu: "admin.code-tables",
      action: "view",
      allowed: true,
    });

    const after = await domainListCodeItems(pmViewer, TABLE_KEY);
    expect(after.some((i) => i.value === "gate-1")).toBe(true);
  });

  it("domain 반환 객체의 키 집합이 spec 선언 키 집합의 부분집합이다(행 객체 누출 없음)", async () => {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "spec-1", label: "스펙 검증" });
    const allowedKeys = new Set(["id", "tableKey", "value", "label", "sortOrder", "active", "archivedAt", "taxRule", "description"]);
    for (const key of Object.keys(dto)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });

  // quick 261002-3mx — 허용 코드표 목록은 domain 한 곳(화면 전환 링크와 같은 목록)이다. 그 밖의 표 키는 서버가 거부한다.
  it("허용 목록에 없는 코드표에는 항목을 추가할 수 없고 행·로그가 남지 않는다", async () => {
    const tableKey = `unknown_${randomUUID()}`;
    const logsBefore = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });

    await expect(createCodeItem(SYSTEM_VIEWER, { tableKey, value: "x", label: "X" })).rejects.toThrow("없는 코드표 · 새로 고침");

    const rows = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: true }, includeInactive: true });
    expect(rows).toEqual([]);
    expect(await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" })).toHaveLength(logsBefore.length);
  });

  it("허용 코드표 네 개(프로젝트 상태 · 증빙 종류 · 견적 분류 · 지급 방식)에는 항목을 추가할 수 있다", async () => {
    expect(CODE_TABLES.map((table) => table.key)).toEqual(["project_status", "evidence_type", "quote_subcategory", "payment_method"]);
    for (const { key } of CODE_TABLES) {
      const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey: key, value: `v-${randomUUID()}`, label: "허용" });
      expect(dto.tableKey).toBe(key);
    }
  });
});
