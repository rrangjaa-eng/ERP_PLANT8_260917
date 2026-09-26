import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createCodeItem, listCodeItems } from "@/domain/code-tables";
import { recordAction, UnknownActionTypeError } from "@/domain/action-log/record";
import { queryActionLog, appendActionLog } from "@/repositories/action-log";
import { withTransaction } from "@/lib/db-transaction";
import { pool } from "@/db/client";
import { setSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";

const TABLE_KEY = `test_action_log_${randomUUID()}`;

// Phase 4(04-32, ENG-D3 ①) — recordAction의 선택 tx 인자: 로그 쓰기와 끌 수
// 있는 종류의 설정 조회가 둘 다 그 tx로 돈다(잠근 트랜잭션 안에서 풀 연결을
// 하나 더 잡지 않는다). 인자가 없으면 아래 기존 describe의 동작 그대로다.
describe("recordAction tx 인자(ENG-D3 ①)", () => {
  it("tx 없이 부르면 지금과 같다 — 행 한 줄, 설정으로 끈 종류는 행 없음", async () => {
    await recordAction(SYSTEM_VIEWER, { actionType: "document_update" });
    const withTx = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });
    expect(withTx.length).toBe(1);

    await recordAction(SYSTEM_VIEWER, { actionType: "document_update" }, { isActionTypeEnabled: () => Promise.resolve(false) });
    const stillOne = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });
    expect(stillOne.length).toBe(1);
  });

  it("withTransaction 안에서 { tx }로 기록한 뒤 트랜잭션을 되돌리면 action_log에 그 행이 없다", async () => {
    await expect(
      withTransaction(async (tx) => {
        await recordAction(SYSTEM_VIEWER, { actionType: "document_update" }, { tx });
        throw new Error("일부러 롤백");
      }),
    ).rejects.toThrow("일부러 롤백");

    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });
    expect(rows.length).toBe(0);
  });

  it("같은 호출 동안 pool.connect 호출 수가 0이다 — 로그 쓰기·설정 조회 둘 다 tx로 돈다", async () => {
    const spy = vi.spyOn(pool, "connect");
    await withTransaction(async (tx) => {
      // 트랜잭션 자신의 연결 획득(이 콜백에 들어오기 전)은 지나간 뒤부터 센다.
      spy.mockClear();
      await recordAction(SYSTEM_VIEWER, { actionType: "document_update" }, { tx });
      expect(spy).not.toHaveBeenCalled();
    });
    spy.mockRestore();
  });

  it("끌 수 있는 종류를 설정에서 끈 상태에서 { tx }로 부르면 행이 없다(설정 조회가 tx 경로에서도 동작)", async () => {
    const withoutDocumentUpdate = ACTION_LOG_OPTIONAL_TYPES.default!.filter((type) => type !== "document_update");
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, withoutDocumentUpdate);

    await withTransaction(async (tx) => {
      await recordAction(SYSTEM_VIEWER, { actionType: "document_update" }, { tx });
    });

    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });
    expect(rows.length).toBe(0);
  });
});

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
