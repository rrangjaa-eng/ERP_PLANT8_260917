import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { GateBlockedError } from "@/domain/rules/gate";
import { PROJECT_STATUSES } from "@/domain/projects/status-transitions";

// 04-06(D-75) — 프로젝트 상태 다섯 값. 04-20·04-21이 같은 파일에 전환
// describe를 더한다. 이 목록은 db/migrations/0012_project_status_five_values.sql
// (test/integration/migration-upgrade.test.ts가 재시드 없이 같은 목록을 단언)과
// domain/seed/index.ts가 글자 그대로 같아야 하는 값이다.
const FIVE_STATUS_CODES = [
  { value: "bidding", label: "수주중", sortOrder: 0, description: "제안·PT 단계 · 쌓인 비용은 진행 뒤 프로젝트 비용" },
  { value: "in_progress", label: "진행", sortOrder: 1, description: "수주 확정 · 종료일 다음 날 자동으로 정산" },
  { value: "settling", label: "정산", sortOrder: 2, description: "행사 종료 · 발행 요청과 증빙 첨부를 마치는 단계" },
  { value: "completed", label: "완료", sortOrder: 3, description: "정산 마감 · 견적 줄이 잠기고 되돌리기 없음" },
  { value: "lost", label: "미수주", sortOrder: 4, description: "수주 실패 · 쌓인 비용은 팀 미수주 비용" },
];

async function setupProjectWithLine(status: string) {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "상태 테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db
    .select()
    .from(codeItems)
    .where(eq(codeItems.tableKey, "quote_subcategory"))
    .limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");

  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `프로젝트-${randomUUID()}`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("createProject가 1차 차수를 만들지 않았습니다");

  await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
    {
      subcategory: subcategory.value,
      itemName: "상태 바꾸기 전 줄",
      unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
      execution: { currency: "KRW", amount: 50_000, fxRate: 1 },
    },
  ]);
  await db.update(projects).set({ status }).where(eq(projects.id, project.id));

  return { project, revision, subcategoryValue: subcategory.value };
}

describe("프로젝트 상태 다섯 값 (04-06, D-75)", () => {
  it("(f) 코드표 project_status가 정확히 다섯 값이고 projects.status에 다섯 값 밖의 값이 없다", async () => {
    const rows = await db
      .select({
        value: codeItems.value,
        label: codeItems.label,
        sortOrder: codeItems.sortOrder,
        description: codeItems.description,
      })
      .from(codeItems)
      .where(eq(codeItems.tableKey, "project_status"))
      .orderBy(asc(codeItems.sortOrder));
    expect(rows).toEqual(FIVE_STATUS_CODES);
    expect(rows.map((row) => row.value).sort()).toEqual([...PROJECT_STATUSES].sort());

    await setupProjectWithLine("completed");
    await setupProjectWithLine("lost");
    const stray = await db
      .select({ status: projects.status })
      .from(projects)
      .where(notInArray(projects.status, [...PROJECT_STATUSES]));
    expect(stray).toEqual([]);
  });

  it("(g) 미수주 프로젝트의 견적 줄 저장은 통과하고 완료 프로젝트의 저장은 「완료 · 견적 줄 잠김」으로 거부된다", async () => {
    const lost = await setupProjectWithLine("lost");
    const saved = await saveQuoteLines(SYSTEM_VIEWER, lost.revision.id, [
      {
        subcategory: lost.subcategoryValue,
        itemName: "미수주 뒤 도착한 PT 제작비",
        unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
        execution: { currency: "KRW", amount: 300_000, fxRate: 1 },
      },
    ]);
    expect(saved.lines.map((line) => line.itemName)).toContain("미수주 뒤 도착한 PT 제작비");
    const lostLines = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, lost.revision.id));
    expect(lostLines.map((line) => line.itemName).sort()).toEqual(["미수주 뒤 도착한 PT 제작비", "상태 바꾸기 전 줄"].sort());

    const completed = await setupProjectWithLine("completed");
    const before = await db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.revisionId, completed.revision.id))
      .orderBy(asc(quoteLines.id));

    const attempt = saveQuoteLines(SYSTEM_VIEWER, completed.revision.id, [
      {
        subcategory: completed.subcategoryValue,
        itemName: "완료 뒤 시도",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ]);
    await expect(attempt).rejects.toBeInstanceOf(GateBlockedError);
    await expect(attempt).rejects.toThrow("완료 · 견적 줄 잠김");

    const after = await db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.revisionId, completed.revision.id))
      .orderBy(asc(quoteLines.id));
    expect(after).toEqual(before);
    expect(after.map((line) => line.itemName)).toEqual(["상태 바꾸기 전 줄"]);
  });
});
