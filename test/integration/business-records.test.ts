import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveAdjustments, leaveRequests, quoteRevisions, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { insertVendor } from "@/repositories/vendors";
import { hasBusinessRecordsBefore } from "@/repositories/business-records";
import { makePerson } from "./approvals-fixtures";

// quick 261001-85g(ADMN-06, 사용자 결정 2026-10-01) — 설정 가져오기의 「실제 운영된 환경」 판정 재료.
// 공유 통합 DB라 다른 파일의 기록과 겹치지 않게 아주 먼 과거(1985년)를 쓰고, 넣은 행은 테스트 끝에 지운다.
const YEAR = 1985;

async function makeProject() {
  const pm = await makePerson("업무 기록 PM", DEFAULT_ROLE_ID, null);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `기록거래처-${randomUUID()}`, normalizedName: `기록거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `기록-${randomUUID()}` });
  return { project, pm };
}

describe("hasBusinessRecordsBefore — 그 해 전 업무 기록(실제 DB)", () => {
  it("연차 신청: 그 해 전이면 참, 같은 해는 경계 밖", async () => {
    const person = await makePerson("기록 연차 신청", DEFAULT_ROLE_ID, null);
    const [row] = await db
      .insert(leaveRequests)
      .values({ drafterId: person.id, kind: "full_day", startDate: `${YEAR}-03-02`, endDate: `${YEAR}-03-02`, daysQuarters: 4, fiscalYear: YEAR })
      .returning();
    try {
      expect(await hasBusinessRecordsBefore(SYSTEM_VIEWER, YEAR + 1)).toBe(true);
      expect(await hasBusinessRecordsBefore(SYSTEM_VIEWER, YEAR)).toBe(false);
    } finally {
      if (row) await db.delete(leaveRequests).where(eq(leaveRequests.id, row.id));
    }
  });

  it("연차 조정: 그 해 전이면 참, 같은 해는 경계 밖", async () => {
    const person = await makePerson("기록 연차 조정", DEFAULT_ROLE_ID, null);
    const [row] = await db
      .insert(leaveAdjustments)
      .values({ userId: person.id, bucket: "annual", fiscalYear: YEAR, amountQuarters: 4, reason: "기록 테스트", createdBy: person.id })
      .returning();
    try {
      expect(await hasBusinessRecordsBefore(SYSTEM_VIEWER, YEAR + 1)).toBe(true);
      expect(await hasBusinessRecordsBefore(SYSTEM_VIEWER, YEAR)).toBe(false);
    } finally {
      if (row) await db.delete(leaveAdjustments).where(eq(leaveAdjustments.id, row.id));
    }
  });

  it("매출 기록: 그 해 1월 1일 전이면 참, 1월 1일은 경계 밖", async () => {
    const { project } = await makeProject();
    const [row] = await db
      .insert(revenueEntries)
      .values({ projectId: project.id, kind: "issue", entryDate: `${YEAR}-12-31`, amountCurrency: "KRW", amountFxRate: "1", amountAmountKrw: 1000 })
      .returning();
    try {
      expect(await hasBusinessRecordsBefore(SYSTEM_VIEWER, YEAR + 1)).toBe(true);
      expect(await hasBusinessRecordsBefore(SYSTEM_VIEWER, YEAR)).toBe(false);
    } finally {
      if (row) await db.delete(revenueEntries).where(eq(revenueEntries.id, row.id));
    }
  });

  it("고객 승인 견적: 서울 기준 그 해 1월 1일 0시 전이면 참(UTC로는 전년 12월 31일 15시)", async () => {
    const { project, pm } = await makeProject();
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    try {
      // 서울 1986-01-01 00:30 = UTC 1985-12-31 15:30 — 1986년 기록이라 1986년 기준으로는 전이 아니다.
      await db
        .update(quoteRevisions)
        .set({ customerApprovedAt: new Date(Date.UTC(YEAR, 11, 31, 15, 30)), customerApprovedBy: pm.id })
        .where(eq(quoteRevisions.id, revision.id));
      expect(await hasBusinessRecordsBefore(SYSTEM_VIEWER, YEAR + 1)).toBe(false);
      expect(await hasBusinessRecordsBefore(SYSTEM_VIEWER, YEAR + 2)).toBe(true);
    } finally {
      await db.update(quoteRevisions).set({ customerApprovedAt: null, customerApprovedBy: null }).where(eq(quoteRevisions.id, revision.id));
    }
  });
});
