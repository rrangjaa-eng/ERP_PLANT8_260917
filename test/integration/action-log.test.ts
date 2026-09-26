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
import type { PoolClient } from "pg";
import { auth } from "@/lib/auth";
import { createAccount } from "@/domain/auth/accounts";
import { lockoutConfig, recordLoginFailure, windowStart } from "@/domain/auth/lockout";
import { countOpenFailures } from "@/repositories/login-attempts";

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

// 04.2-03(D-712): 계정이 잠기는 순간(N번째 실패) 행동 로그에 account_lock 한 행.
// 실패 기록·세기·잠금 로그가 한 트랜잭션이다(Codex #12) — 감사 쓰기가 실패하면
// 실패 기록도 롤백된다. 로그인 도우미는 lockout.test.ts의 signIn 모양을 이 파일
// 안에 지역으로 둔다. 블록마다 고유 x-client-ip·고유 이메일, 블록당 로그인 10회
// 이하(RATE_LIMIT_LOGIN_MAX) — 감사 실패·동시 실패·풀 교착은 recordLoginFailure를
// 직접 불러 rate limit에 걸리지 않는다.
const LOCK_BASE_URL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

function uniqueLockEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

async function signIn(email: string, password: string, ip: string): Promise<Response> {
  return auth.handler(
    new Request(`${LOCK_BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-ip": ip },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function failTimes(email: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await recordLoginFailure(email, "198.51.100.90");
  }
}

async function openFailures(email: string): Promise<number> {
  const { windowMinutes } = await lockoutConfig();
  return countOpenFailures(SYSTEM_VIEWER, email, windowStart(new Date(), windowMinutes));
}

describe("계정 잠금 행동 로그 (D-712)", () => {
  it("N-1회 실패 → 0행, N번째 → 1행(행위자 null · detail에 이메일), N+1번째(잠긴 뒤 403) → 여전히 1행", async () => {
    const email = uniqueLockEmail("lock-log-a");
    const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: "Lock Log A" });
    const ip = "198.51.100.71";
    const { threshold } = await lockoutConfig();

    for (let i = 0; i < threshold - 1; i++) {
      await signIn(email, "wrong-password", ip);
    }
    expect(await queryActionLog(SYSTEM_VIEWER, { actionType: "account_lock" })).toHaveLength(0);

    await signIn(email, "wrong-password", ip);
    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "account_lock" });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.actorId).toBeNull();
    expect(row?.entity).toBe("user");
    expect(row?.entityId).toBe(userId);
    const detail = row?.detail as Record<string, unknown> | undefined;
    expect(detail?.email).toBe(email);
    expect(typeof detail?.threshold).toBe("number");
    expect(typeof detail?.windowMinutes).toBe("number");

    const afterLocked = await signIn(email, "wrong-password", ip);
    expect(afterLocked.status).toBe(403);
    expect(await queryActionLog(SYSTEM_VIEWER, { actionType: "account_lock" })).toHaveLength(1);
  });

  it("감사 쓰기가 실패하면 N번째 실패 기록도 롤백되고, 다음 실패가 다시 N번째가 되어 잠금 기록을 남긴다", async () => {
    const email = uniqueLockEmail("lock-log-b");
    const { threshold } = await lockoutConfig();
    await failTimes(email, threshold - 1);

    await expect(
      recordLoginFailure(email, "198.51.100.72", {
        recordAction: () => Promise.reject(new Error("감사 쓰기 실패")),
      }),
    ).rejects.toThrow("감사 쓰기 실패");
    expect(await openFailures(email)).toBe(threshold - 1);
    expect(await queryActionLog(SYSTEM_VIEWER, { actionType: "account_lock" })).toHaveLength(0);

    await recordLoginFailure(email, "198.51.100.72");
    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "account_lock" });
    expect(rows).toHaveLength(1);
    // 없는 이메일도 잠긴다(계정 존재와 무관) — 대상 id는 null.
    expect(rows[0]?.entityId).toBeNull();
  });

  it("동시 실패 둘이 N-2에서 N이 되면 잠금 행동 로그가 0건이 아니다", async () => {
    const email = uniqueLockEmail("lock-log-c");
    const { threshold } = await lockoutConfig();
    await failTimes(email, threshold - 2);

    await Promise.all([recordLoginFailure(email, "198.51.100.73"), recordLoginFailure(email, "198.51.100.73")]);

    expect(await openFailures(email)).toBe(threshold);
    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "account_lock" });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("빈 연결 1개만 남긴 풀에서도 N번째 실패가 5초 안에 끝나고 account_lock 1행(entityId = 사용자 id)을 남긴다(eng E5)", async () => {
    const email = uniqueLockEmail("lock-log-d");
    const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: "Lock Log D" });
    const { threshold } = await lockoutConfig();
    await failTimes(email, threshold - 1);

    const held: PoolClient[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const max = pool.options.max ?? 10;
      for (let i = 0; i < max - 1; i++) {
        held.push(await pool.connect());
      }
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), 5000);
      });
      const result = await Promise.race([recordLoginFailure(email, "198.51.100.74"), timeout]);
      if (result === "timeout") {
        throw new Error("두 번째 풀 연결을 잠금 트랜잭션 안에서 잡았다(eng E5)");
      }
      expect(result).toEqual({ locked: true });
    } finally {
      clearTimeout(timer);
      for (const client of held) client.release();
    }

    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "account_lock" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entityId).toBe(userId);
  }, 15_000);
});
