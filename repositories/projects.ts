import { and, eq, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";
import type { DbOrTx } from "@/repositories/document-counters";

export type ProjectRow = InferSelectModel<typeof projects>;

// PROJ-01: 목록 — vendors.ts의 형태 그대로(viewer 첫 인자, Scope로 행 필터,
// 보관함 조건부). `scope.rows === "none"`이면 빈 배열.
export async function listProjects(viewer: Viewer, opts: { scope: Scope }): Promise<ProjectRow[]> {
  void viewer;
  if (opts.scope.rows === "none") return [];

  const conditions = [];
  if (!opts.scope.includeArchived) conditions.push(isNull(projects.archivedAt));

  return db
    .select()
    .from(projects)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(projects.createdAt);
}

export async function findProjectById(viewer: Viewer, id: string): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function findProjectByNumber(viewer: Viewer, number: string): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await db.select().from(projects).where(eq(projects.number, number)).limit(1);
  return row ?? null;
}

export type ProjectInsertInput = {
  number: string;
  clientId: string;
  teamId: string;
  pmUserId: string;
  name: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  preEstimateCurrency: string;
  preEstimateForeignAmount: string | null;
  preEstimateFxRate: string;
  preEstimateAmountKrw: number;
  source?: string;
  customFields?: Record<string, unknown>;
};

// **번호 부여와 같은 트랜잭션 안에서 불린다** — tx를 받는 유일한 쓰기
// 함수(Task 2 ⑧, 04-RESEARCH.md Anti-Patterns).
export async function insertProject(viewer: Viewer, input: ProjectInsertInput, tx: DbOrTx = db): Promise<ProjectRow> {
  void viewer;
  const [row] = await tx
    .insert(projects)
    .values({
      number: input.number,
      clientId: input.clientId,
      teamId: input.teamId,
      pmUserId: input.pmUserId,
      name: input.name,
      status: input.status,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      preEstimateCurrency: input.preEstimateCurrency,
      preEstimateForeignAmount: input.preEstimateForeignAmount,
      preEstimateFxRate: input.preEstimateFxRate,
      preEstimateAmountKrw: input.preEstimateAmountKrw,
      source: input.source ?? "demo",
      customFields: input.customFields ?? {},
    })
    .returning();
  if (!row) throw new Error("projects insert가 행을 반환하지 않았습니다.");
  return row;
}
