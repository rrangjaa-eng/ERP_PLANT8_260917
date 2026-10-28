import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject, findProject } from "@/domain/projects";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { saveProjectLedger } from "@/domain/projects/ledger";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { addDays, kstToday } from "@/lib/kst-date";

// 07-18 Task 1 (W2 · D-737) — PO 번호가 일괄 저장 경로 하나에 합류한다. 중복 허용 · 경고 없음 · 100자 상한 · 권리는 기간 칸과 같다.

const TODAY = kstToday(new Date());
const FAR = addDays(TODAY, 30);

async function makeViewer(roleId: string, teamId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `po-${randomUUID()}@example.test`, name: "PO 테스트 사람", roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2026-01-01" });
  return { id: userId, roleId };
}

async function setup(status: ProjectStatus = "bidding") {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `PO본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `PO팀-${randomUUID().slice(0, 8)}` });
  const pm = await makeViewer(DEFAULT_ROLE_ID, team.id);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `PO-${randomUUID()}` });
  await db.update(projects).set({ status, startDate: null, endDate: FAR }).where(eq(projects.id, created.id));
  return { projectId: created.id, pm, teamId: team.id, clientId: client.id };
}

async function poNumberOf(projectId: string): Promise<string | null> {
  const [row] = await db.select({ poNumber: projects.poNumber }).from(projects).where(eq(projects.id, projectId));
  return row?.poNumber ?? null;
}

describe("saveProjectLedger poNumber (07-18 · D-737)", () => {
  it("PO 번호를 저장하고 다시 읽으면 같은 값이며 DTO에도 실린다", async () => {
    const s = await setup();
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", poNumber: "  PO-2026-001  " });
    expect(await poNumberOf(s.projectId)).toBe("PO-2026-001");
    expect((await findProject(s.pm, s.projectId))?.poNumber).toBe("PO-2026-001");
  });

  it("빈 문자열은 NULL로 저장한다", async () => {
    const s = await setup();
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", poNumber: "PO-1" });
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", poNumber: "   " });
    expect(await poNumberOf(s.projectId)).toBeNull();
  });

  it("같은 번호를 다른 프로젝트에 저장해도 성공한다(중복 허용 · 경고 없음)", async () => {
    const a = await setup();
    const b = await setup();
    await saveProjectLedger(a.pm, a.projectId, { seenStatus: "bidding", poNumber: "PO-DUP" });
    await saveProjectLedger(b.pm, b.projectId, { seenStatus: "bidding", poNumber: "PO-DUP" });
    expect(await poNumberOf(a.projectId)).toBe("PO-DUP");
    expect(await poNumberOf(b.projectId)).toBe("PO-DUP");
  });

  it("101자는 거부하고 DB는 그대로다", async () => {
    const s = await setup();
    const outcome = await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", poNumber: "P".repeat(101) }).catch((e: unknown) => e);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toBe("PO 번호 · 100자 이하");
    expect(await poNumberOf(s.projectId)).toBeNull();
    expect((await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", poNumber: "P".repeat(100) })).project.poNumber).toBe("P".repeat(100));
  });

  it("고칠 권리가 없는 사람(정산 중 담당 PM)은 거부되고 DB는 그대로다", async () => {
    const s = await setup("settling");
    const outcome = await saveProjectLedger(s.pm, s.projectId, { seenStatus: "settling", poNumber: "PO-X" }).catch((e: unknown) => e);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toBe("PO 번호 바꾸기 권한 없음");
    expect(await poNumberOf(s.projectId)).toBeNull();
  });

  it("바뀐 PO 번호는 같은 트랜잭션의 document_update 기록에 실리고 안 바뀌면 기록이 없다", async () => {
    const s = await setup();
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", poNumber: "PO-LOG" });
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", poNumber: "PO-LOG" });
    const rows = await db.select().from(actionLog).where(eq(actionLog.entityId, s.projectId));
    const updates = rows.filter((r) => r.actionType === "document_update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.detail).toEqual({ poNumber: { from: null, to: "PO-LOG" } });
  });
});

// 07.1-13 S8(E-P2-38 · 사용자 결정 카드 2026-10-28 01:03Z — A): 사전 견적(총 매출 예상가) 바꾸기 로그에 전후 Money 글자.
// #316 게이트 P3: 저장된 0원은 미입력이다(등록 기본 0 · 화면 「없음」 — pre-estimate-field.tsx preEstimateValue) — 로그도 null(없음).
describe("saveProjectLedger preEstimate 로그 전후 (07.1-13 S8)", () => {
  async function projectUpdates(projectId: string) {
    const rows = await db.select().from(actionLog).where(eq(actionLog.entityId, projectId)).orderBy(actionLog.seq);
    return rows.filter((row) => row.actionType === "document_update").map((row) => row.detail as Record<string, unknown>);
  }
  const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1, fxRateTouched: false });

  it("원화 1,000,000 → 1,200,000 — changes.preEstimate 전후 · preEstimateChanged 그대로", async () => {
    const s = await setup();
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", preEstimate: krw(1_000_000) });
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", preEstimate: krw(1_200_000) });
    const updates = await projectUpdates(s.projectId);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ preEstimateChanged: true, changes: { preEstimate: ["1,000,000원", "1,200,000원"] } });
  });

  it("외화 사전 견적은 외화 글자 + 원화", async () => {
    const s = await setup();
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", preEstimate: { currency: "USD", amount: 40_000, fxRate: 1350, fxRateTouched: true } });
    const [detail] = await projectUpdates(s.projectId);
    const pair = (detail?.changes as { preEstimate?: [string, string] } | undefined)?.preEstimate;
    expect(pair?.[0]).toBeNull();
    expect(pair?.[1]).toMatch(/^USD 40,000\.00 @1,350 · 54,000,000원$/);
  });

  it("같은 값 저장은 로그도 changes.preEstimate도 없다", async () => {
    const s = await setup();
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", preEstimate: krw(1_000_000) });
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", preEstimate: krw(1_000_000) });
    expect(await projectUpdates(s.projectId)).toHaveLength(1);
  });

  it("PO 번호와 함께 바꾸면 한 줄에 둘 다 — PO 번호 { from, to } 모양 그대로", async () => {
    const s = await setup();
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", preEstimate: krw(2_000_000), poNumber: "PO-PE" });
    expect(await projectUpdates(s.projectId)).toEqual([
      { preEstimateChanged: true, changes: { preEstimate: [null, "2,000,000원"] }, poNumber: { from: null, to: "PO-PE" } },
    ]);
  });

  it("값을 비우면(0) 이후가 null(없음) · 처음 넣기는 이전이 null", async () => {
    const s = await setup();
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", preEstimate: krw(3_000_000) });
    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding", preEstimate: krw(0) });
    const updates = await projectUpdates(s.projectId);
    expect(updates.map((detail) => (detail.changes as { preEstimate?: unknown }).preEstimate)).toEqual([
      [null, "3,000,000원"],
      ["3,000,000원", null],
    ]);
  });
});
