import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, listQuoteLines, saveQuoteLines } from "@/domain/quotes/lines";
import { firstSelectableSubcategory } from "../support/quote-subcategory";

// /qa ISSUE-001(PR #121) — 보관 · 숨김 거래처는 선택지(listProjectFormReferences)에 없어 견적 표가 UUID를 그렸다.
// 줄 DTO가 거래처 이름을 싣는다 — project.value와 vendor.value를 모두 볼 때만(all-of, 리저브 선택지와 같은 결).
const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

async function makeViewer(hidden: string | null): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `거래처 이름-${randomUUID()}`, workScope: "company" });
  for (const infoItem of ["project.value", "quote.amount", "vendor.value"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: infoItem !== hidden });
  }
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `vn-${randomUUID()}@example.test`, name: "거래처 이름 사람", roleId: role.id });
  return { id: userId, roleId: role.id };
}

async function makeLineWithArchivedVendor() {
  const vendorName = `보관거래처-${randomUUID()}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, { email: `vn-pm-${randomUUID()}@example.test`, name: "PM", roleId: "role-pm" });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const subcategory = await firstSelectableSubcategory();
  const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: `프로젝트-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [{ id: randomUUID(), isNew: true, subcategory: subcategory.value, itemName: "줄", vendorId: vendor.id, unitPrice: krw(100), execution: krw(0) }],
  });
  await db.update(vendors).set({ archivedAt: new Date(), hidden: true }).where(eq(vendors.id, vendor.id));
  return { revisionId: revision.id, vendor: { id: vendor.id, name: vendorName } };
}

describe("견적 줄 DTO의 거래처 이름(/qa ISSUE-001)", () => {
  it("보관 · 숨김 거래처도 줄에 실제 이름이 실린다", async () => {
    const { revisionId, vendor } = await makeLineWithArchivedVendor();
    const viewer = await makeViewer(null);

    const [line] = await listQuoteLines(viewer, revisionId, { status: "bidding", canWrite: false });
    expect(line?.vendorId).toBe(vendor.id);
    expect(line?.vendorName).toBe(vendor.name);
  });

  for (const hidden of ["vendor.value", "project.value"]) {
    it(`${hidden}가 가려진 계급에는 거래처 이름 키가 없다`, async () => {
      const { revisionId, vendor } = await makeLineWithArchivedVendor();
      const viewer = await makeViewer(hidden);

      const lines = await listQuoteLines(viewer, revisionId, { status: "bidding", canWrite: false });
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toHaveProperty("vendorName");
      expect(JSON.stringify(lines)).not.toContain(vendor.name);
    });
  }
});
