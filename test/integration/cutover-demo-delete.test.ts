import { randomUUID } from "node:crypto";
import { eq, ne } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, documentCounters, projects, settingsSimple } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createVendor } from "@/domain/vendors";
import { createProject } from "@/domain/projects";
import { SETTING_DEFS } from "@/domain/settings/keys";
import { applyCutover, CutoverRefusedError, dryRunCutover, type CutoverDeps } from "@/domain/cutover";
import { CUTOVER_MARKER_KEY } from "@/repositories/cutover";
import { upsertDocumentCounter } from "@/repositories/document-counters";
import { seoulToday } from "@/lib/dates";
import { countRows, makePerson, teamIdByName } from "./approvals-fixtures";

// 08-02(D8-05 · D8-09): 전환 도구 — dry-run(건수 · 확인 문자열) → apply(한 트랜잭션: 비우기 · 카운터 초기화 · 표시 · 행동 로그).
// 백업 조회는 주입한다(실제 GCP 없음).

const NOW = new Date();
const freshBackup = (minutesAgo: number, status = "SUCCESSFUL") =>
  (() => Promise.resolve({ kind: "ok" as const, status, endTime: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString() })) satisfies CutoverDeps["getLastBackup"];
const deps = (getLastBackup: CutoverDeps["getLastBackup"] = freshBackup(10)): CutoverDeps => ({ getLastBackup });

async function makeProject(pm?: Viewer) {
  const person = pm ?? (await makePerson(`PM-${randomUUID().slice(0, 6)}`, "role-pm", "기획1팀"));
  const client = await createVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID().slice(0, 6)}` });
  const project = await createProject(person, {
    clientId: client.vendor.id,
    teamId: await teamIdByName("기획1팀"),
    pmUserId: person.id,
    name: `전환 시험 ${randomUUID().slice(0, 6)}`,
    startDate: "2026-09-01",
    endDate: "2026-12-31",
  });
  return { person, project };
}

async function marker(): Promise<unknown> {
  const [row] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, CUTOVER_MARKER_KEY));
  return row?.value ?? null;
}

async function cutoverApplyLogs(): Promise<number> {
  return (await db.select().from(actionLog).where(eq(actionLog.actionType, "cutover_apply"))).length;
}

describe("전환 도구 — 프로젝트 한 줄 트레이서(08-02 Task 1)", () => {
  it("D3 = A: cutover.at은 설정 레지스트리(SETTING_DEFS)에 없다", () => {
    expect(SETTING_DEFS.filter((def) => def.key === CUTOVER_MARKER_KEY)).toEqual([]);
  });

  it("dry-run은 건수와 확인 문자열만 돌려주고 아무 행도 바꾸지 않는다", async () => {
    await makeProject();
    const before = { projects: await countRows("projects"), revisions: await countRows("quote_revisions"), counters: await countRows("document_counters") };

    const result = await dryRunCutover(SYSTEM_VIEWER);

    if (!("token" in result)) throw new Error("전환 전 dry-run이 건수를 돌려주지 않았다");
    expect(result.mode).toBe("dry-run");
    expect(result.counts.projects).toBeGreaterThanOrEqual(1);
    expect(result.token).toMatch(/^[0-9]+-[0-9a-f]{8}$/);
    expect(result.token.startsWith(`${result.total}-`)).toBe(true);
    expect({ projects: await countRows("projects"), revisions: await countRows("quote_revisions"), counters: await countRows("document_counters") }).toEqual(before);
    expect(await marker()).toBeNull();
  });

  it("apply는 업무 표를 비우고 cert 아닌 카운터를 지우고 표시 · 행동 로그를 남긴다", async () => {
    const { project: demoProject } = await makeProject();
    expect(demoProject.source).toBe("demo");
    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "cert", period: "2026", value: 7 });
    const actionLogBefore = await countRows("action_log");
    const dry = await dryRunCutover(SYSTEM_VIEWER);
    if (!("token" in dry)) throw new Error("dry-run 건수 없음");

    const result = await applyCutover(SYSTEM_VIEWER, { confirm: dry.token, now: NOW, runUrl: null }, deps());

    expect(result.mode).toBe("apply");
    expect(result.token).toBe(dry.token);
    expect(await countRows("projects")).toBe(0);
    expect(await countRows("quote_revisions")).toBe(0);
    expect(await countRows("quote_lines")).toBe(0);
    expect((await db.select().from(documentCounters).where(ne(documentCounters.counterKey, "cert"))).length).toBe(0);
    expect((await db.select().from(documentCounters).where(eq(documentCounters.counterKey, "cert")))[0]?.value).toBe(7);
    const stored = await marker();
    expect(typeof stored).toBe("string");
    expect(stored).toMatch(/\+09:00$/);
    expect(await cutoverApplyLogs()).toBe(1);
    expect(await countRows("action_log")).toBeGreaterThanOrEqual(actionLogBefore + 1);
  });

  it("apply 뒤 새 프로젝트는 source 'live' · 번호는 서울 연도 두 자리 + 001이다", async () => {
    const { person } = await makeProject();
    const dry = await dryRunCutover(SYSTEM_VIEWER);
    if (!("token" in dry)) throw new Error("dry-run 건수 없음");
    await applyCutover(SYSTEM_VIEWER, { confirm: dry.token, now: NOW, runUrl: null }, deps());

    const { project } = await makeProject(person);

    expect(project.source).toBe("live");
    expect(project.number).toBe(`${seoulToday().slice(2, 4)}001`);
  });

  it.each([
    ["4시간 전 성공", freshBackup(240)],
    ["실패한 백업", freshBackup(10, "FAILED")],
    ["백업 없음", () => Promise.resolve({ kind: "none" as const })],
    ["조회 불가", () => Promise.resolve({ kind: "unavailable" as const, reason: "not-configured" })],
  ])("백업 가드 — %s이면 backup_not_fresh로 거부하고 아무 행도 바꾸지 않는다", async (_label, getLastBackup) => {
    await makeProject();
    const dry = await dryRunCutover(SYSTEM_VIEWER);
    if (!("token" in dry)) throw new Error("dry-run 건수 없음");
    const projectsBefore = await countRows("projects");

    const error = await applyCutover(SYSTEM_VIEWER, { confirm: dry.token, now: NOW, runUrl: null }, deps(getLastBackup)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CutoverRefusedError);
    expect((error as CutoverRefusedError).reason).toBe("backup_not_fresh");
    expect((error as CutoverRefusedError).backup?.kind).toBeDefined();
    expect(await countRows("projects")).toBe(projectsBefore);
    expect(await marker()).toBeNull();
    expect(await cutoverApplyLogs()).toBe(0);
  });

  it("apply 전 새 프로젝트는 source 'demo'다", async () => {
    const { project } = await makeProject();
    const [row] = await db.select({ source: projects.source }).from(projects).where(eq(projects.id, project.id));
    expect(row?.source).toBe("demo");
  });
});
