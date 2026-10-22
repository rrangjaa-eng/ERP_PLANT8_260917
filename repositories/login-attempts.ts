import { and, eq, exists, gte, isNull, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { loginAttempts, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// viewer는 Phase 3의 scopeFor(viewer) 자리 — 지금은 받기만 한다(4계층 규칙,
// 01-04 린트가 첫 인자 필수를 강제한다).

export async function countOpenFailures(
  viewer: Viewer,
  email: string,
  since: Date,
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        isNull(loginAttempts.resolvedAt),
        gte(loginAttempts.attemptedAt, since),
      ),
    );
  return row?.count ?? 0;
}

// 07-17 SC-11: 창 안 열린 실패 수가 임계 이상인 이메일(소문자) 묶음 — 사람 목록이 사람마다 묻지 않게 한 질의로.
// 묶기 · 비교 모두 lower(email) — 시도 행 이메일의 대소문자가 사람 이메일과 다를 수 있다(부록 ND).
// 07-17 Codex P2: 없는 사람 이메일은 묶음에 넣지 않음 — 비인증 실패 기록이 묶음(IN 목록)을 키우지 못하게.
export async function listLockedEmails(
  viewer: Viewer,
  opts: { threshold: number; since: Date },
  tx: DbOrTx = db,
): Promise<Set<string>> {
  void viewer;
  const email = sql<string>`lower(${loginAttempts.email})`;
  const rows = await tx
    .select({ email })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.success, false),
        isNull(loginAttempts.resolvedAt),
        gte(loginAttempts.attemptedAt, opts.since),
        exists(tx.select({ one: sql`1` }).from(users).where(sql`lower(${users.email}) = ${email}`)),
      ),
    )
    .groupBy(email)
    .having(sql`count(*) >= ${opts.threshold}`);
  return new Set(rows.map((row) => row.email));
}

export async function recordAttempt(
  viewer: Viewer,
  // attemptedAt을 빼면 DB 기본값(트랜잭션 시작 시각) — 07-09 미리 기록 행이 action_log.occurred_at과 같은 시계를 쓴다.
  row: { email: string; success: boolean; ip: string | null; attemptedAt?: Date },
  tx: DbOrTx = db,
): Promise<void> {
  void viewer;
  await tx.insert(loginAttempts).values(row);
}

export async function resolveOpenFailures(
  viewer: Viewer,
  email: string,
  reason: "success" | "admin_unlock" | "admin_reset",
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  const resolved = await tx
    .update(loginAttempts)
    .set({ resolvedAt: new Date(), resolvedReason: reason })
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        isNull(loginAttempts.resolvedAt),
      ),
    )
    .returning({ id: loginAttempts.id });
  return resolved.length;
}

// 07-09 FA-1: 창 안 열린 실패 중 가장 이른 시각 — 「잠금 기록 확인」이 이 시각 이후의 account_lock만 지금 잠금의 기록으로 본다.
export async function firstOpenFailureAt(viewer: Viewer, email: string, since: Date, tx: DbOrTx): Promise<Date | null> {
  void viewer;
  const [row] = await tx
    .select({ first: sql<Date | null>`min(${loginAttempts.attemptedAt})`.mapWith(loginAttempts.attemptedAt) })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        isNull(loginAttempts.resolvedAt),
        gte(loginAttempts.attemptedAt, since),
      ),
    );
  return row?.first ?? null;
}

// 04.2-03(D-712): 같은 이메일의 실패 기록 트랜잭션을 줄 세운다 — 동시 실패
// 둘이 서로의 미커밋 INSERT를 못 봐 둘 다 N-1을 세는 일을 막는다. 트랜잭션
// 끝에 풀린다. 이메일은 바인딩 파라미터로 넘긴다(SQL에 이어 붙이지 않는다).
export async function lockLoginEmail(viewer: Viewer, email: string, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"login_attempts:" + email}, 0))`);
}

// 테스트 전용(창 만료 시뮬레이션) — repositories에 두어 4계층 규칙을 지킨다.
export async function backdateOpenFailures(
  viewer: Viewer,
  email: string,
  to: Date,
): Promise<void> {
  void viewer;
  await db
    .update(loginAttempts)
    .set({ attemptedAt: to })
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        isNull(loginAttempts.resolvedAt),
      ),
    );
}
