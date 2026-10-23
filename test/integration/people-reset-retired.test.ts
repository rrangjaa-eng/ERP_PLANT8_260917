import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError, resetPersonPassword } from "@/domain/people";
import { kstToday } from "@/lib/kst-date";
import { makePerson } from "./approvals-fixtures";

// 07-17 독립 검토 P3-6: 퇴직자 초기화 거부를 목이 아니라 실제 users.resignation_date로 고정한다(경계: 퇴직일 당일까지 재직).
const RETIRED_MESSAGE = "퇴직한 사람 · 비밀번호 초기화 없음";

function kstDayOffset(days: number): string {
  return kstToday(new Date(Date.now() + days * 86_400_000));
}

async function personResigned(resignationDate: string): Promise<string> {
  const person = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
  await db.update(users).set({ resignationDate }).where(eq(users.id, person.id));
  return person.id;
}

describe("퇴직자 비밀번호 초기화 거부(실제 퇴직일)", () => {
  it("퇴직일이 어제(KST)면 ForbiddenError · 퇴직한 사람 · 비밀번호 초기화 없음", async () => {
    const id = await personResigned(kstDayOffset(-1));
    const outcome = await resetPersonPassword(SYSTEM_VIEWER, id).then(
      () => new Error("거부되어야 하는데 성공함"),
      (caught: unknown) => caught,
    );
    expect(outcome).toBeInstanceOf(ForbiddenError);
    expect((outcome as Error).message).toBe(RETIRED_MESSAGE);
  });

  it("퇴직일이 오늘(KST)이면 아직 재직 — 초기화되어 임시 비밀번호를 돌려준다", async () => {
    const id = await personResigned(kstDayOffset(0));
    const result = await resetPersonPassword(SYSTEM_VIEWER, id);
    expect(result.tempPassword).toBeTruthy();
  });
});
