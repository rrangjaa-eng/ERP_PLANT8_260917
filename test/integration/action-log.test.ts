import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createCodeItem, listCodeItems } from "@/domain/code-tables";
import { recordAction, UnknownActionTypeError } from "@/domain/action-log/record";
import { queryActionLog, appendActionLog } from "@/repositories/action-log";

const TABLE_KEY = `test_action_log_${randomUUID()}`;

describe("action-log (OPS-05, 실제 Postgres)", () => {
  it("코드표 추가가 행동 로그 행 하나를 남긴다", async () => {
    await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "a", label: "A" });
    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    expect(rows.length).toBe(1);
  });

  it("목록 조회는 행동 로그 행을 0개 남긴다", async () => {
    await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "a", label: "A" });
    await listCodeItems(SYSTEM_VIEWER, TABLE_KEY);
    const rows = await queryActionLog(SYSTEM_VIEWER);
    // 추가 행 하나뿐 — 목록 조회는 아무것도 더하지 않는다.
    expect(rows.length).toBe(1);
  });

  it("같은 핵심 행동을 두 번 하면 행동 로그 행이 둘이다(append-only, 중복 제거 없음)", async () => {
    await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "a", label: "A" });
    await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "b", label: "B" });
    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    expect(rows.length).toBe(2);
  });

  it("occurred_at이 같은 행들이 seq(단조 증가)로 삽입 순서를 유지한다", async () => {
    const entry = {
      actorId: null,
      actorRoleId: null,
      actionType: "login",
      entity: null,
      entityId: null,
      documentId: null,
      detail: {},
    };
    const first = await appendActionLog(SYSTEM_VIEWER, entry);
    const second = await appendActionLog(SYSTEM_VIEWER, entry);
    expect(second.seq).toBeGreaterThan(first.seq);
  });

  it("핵심 목록에 없는 종류가 거부되고 행이 안 생긴다", async () => {
    await expect(
      recordAction(SYSTEM_VIEWER, { actionType: "not_a_core_type" }),
    ).rejects.toBeInstanceOf(UnknownActionTypeError);
    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "not_a_core_type" });
    expect(rows.length).toBe(0);
  });

  it("끌 수 없는 종류는 설정 조회 실패에도 기록된다", async () => {
    await recordAction(
      SYSTEM_VIEWER,
      { actionType: "excel_export" },
      {
        isActionTypeEnabled: () => {
          throw new Error("호출되면 안 된다");
        },
      },
    );
    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    expect(rows.length).toBe(1);
  });
});
