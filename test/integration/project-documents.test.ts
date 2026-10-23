import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { files, projectDocuments, projects, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { completeEvidenceUpload, createEvidenceViewUrl, removeEvidence } from "@/domain/evidence";
import { listProjectDocuments, projectDocumentOwner, projectDocumentRights, projectHasPurchaseOrder, PROJECT_DOCUMENT_KIND } from "@/domain/projects/documents";
import { requestProjectDocumentUpload } from "@/domain/projects/document-upload";
import { hasProjectDocument } from "@/repositories/project-documents";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";

// 07-22(W3 · SC-20) — 프로젝트 서류(발주서 · 기타 여러 장): 권리 = 프로젝트 정보 면을 고칠 수 있는 사람(periodEditRights), 파일 없는 서류 행은 세지 않는다.

async function setup(): Promise<{ projectId: string; pm: Viewer }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `pm-${randomUUID()}@example.test`, name: "서류 PM", roleId: DEFAULT_ROLE_ID });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: userId, name: `서류-${randomUUID().slice(0, 8)}` });
  return { projectId: project.id, pm: { id: userId, roleId: DEFAULT_ROLE_ID } };
}

// 전사 보는 범위 · 프로젝트 보기만(쓰기 없음). quoteAmount=false면 견적 금액을 못 보는 계급(cso P2-1 실측 계급과 같은 모양).
async function makeReader(opts: { quoteAmount?: boolean; write?: boolean } = {}): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `서류읽기-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  if (opts.write) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.period", action: "write", allowed: true });
  }
  for (const infoItem of ["project.value", "vendor.value", "team.value", "person.value"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  if (opts.quoteAmount !== false) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "quote.amount", visible: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `reader-${randomUUID()}@example.test`, name: "서류 읽기", roleId: role.id });
  return { id: userId, roleId: role.id };
}

async function attach(viewer: Viewer, projectId: string, kind: "purchase_order" | "other", storage: MemoryStorage = createMemoryStorage(), name = "발주서.pdf") {
  const declared = { size: 120_000, contentType: "application/pdf", sha256: randomBytes(32).toString("hex"), name };
  const intent = await requestProjectDocumentUpload(viewer, { projectId, kind, ...declared }, { storage });
  storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
  return completeEvidenceUpload(viewer, { intentId: intent.intentId }, { storage });
}

describe("프로젝트 서류 — 붙이기 · 목록 · 지우기", () => {
  it("담당 PM이 발주서 · 기타를 붙이고 지우면 목록 · hasProjectDocument가 따라온다", async () => {
    const { projectId, pm } = await setup();
    const po = await attach(pm, projectId, "purchase_order");

    const first = await listProjectDocuments(pm, projectId);
    expect(first?.canWrite).toBe(true);
    expect(first?.documents).toHaveLength(1);
    expect(first?.documents[0]).toMatchObject({ fileId: po.id, kind: "purchase_order", name: "발주서.pdf", uploaderName: "서류 PM" });
    expect(typeof first?.documents[0]?.createdAt).toBe("string");
    expect(await hasProjectDocument(pm, projectId, "purchase_order")).toBe(true);
    expect(await projectHasPurchaseOrder(pm, projectId)).toBe(true);

    await attach(pm, projectId, "other", createMemoryStorage(), "현장 사진.pdf");
    expect((await listProjectDocuments(pm, projectId))?.documents.map((doc) => doc.kind)).toEqual(["purchase_order", "other"]);

    await removeEvidence(pm, { fileId: po.id });
    expect((await listProjectDocuments(pm, projectId))?.documents.map((doc) => doc.kind)).toEqual(["other"]);
    expect(await hasProjectDocument(pm, projectId, "purchase_order")).toBe(false);
  });

  it("서류 파일의 privateToOwner는 false", async () => {
    const { projectId, pm } = await setup();
    const po = await attach(pm, projectId, "purchase_order");
    const [row] = await db.select({ flag: files.privateToOwner, ownerKind: files.ownerKind }).from(files).where(eq(files.id, po.id));
    expect(row).toEqual({ flag: false, ownerKind: PROJECT_DOCUMENT_KIND });
  });

  it("올리기를 끝내지 않은 시도는 목록 · hasProjectDocument에 잡히지 않는다(파일 없는 서류 행 금지)", async () => {
    const { projectId, pm } = await setup();
    await requestProjectDocumentUpload(pm, { projectId, kind: "purchase_order", size: 120_000, contentType: "application/pdf", sha256: randomBytes(32).toString("hex"), name: "중단.pdf" }, { storage: createMemoryStorage() });
    expect((await listProjectDocuments(pm, projectId))?.documents).toEqual([]);
    expect(await hasProjectDocument(pm, projectId, "purchase_order")).toBe(false);
  });

  it("선언 검사에 걸린 시도는 서류 행을 남기지 않는다", async () => {
    const { projectId, pm } = await setup();
    await expect(
      requestProjectDocumentUpload(pm, { projectId, kind: "purchase_order", size: 120_000, contentType: "text/plain", sha256: randomBytes(32).toString("hex"), name: "메모.txt" }, { storage: createMemoryStorage() }),
    ).rejects.toThrow();
    const live = await db.select().from(projectDocuments).where(eq(projectDocuments.projectId, projectId));
    expect(live.filter((row) => row.removedAt === null)).toEqual([]);
  });
});

describe("프로젝트 서류 — 권리", () => {
  it("보기만 하는 사람은 목록은 보지만 붙이기는 거부되고 행이 생기지 않는다", async () => {
    const { projectId, pm } = await setup();
    await attach(pm, projectId, "purchase_order");
    const reader = await makeReader();

    const seen = await listProjectDocuments(reader, projectId);
    expect(seen?.canWrite).toBe(false);
    expect(seen?.documents).toHaveLength(1);

    const before = (await db.select().from(projectDocuments).where(eq(projectDocuments.projectId, projectId))).length;
    await expect(attach(reader, projectId, "other")).rejects.toThrow();
    expect((await db.select().from(projectDocuments).where(eq(projectDocuments.projectId, projectId))).length).toBe(before);
  });

  it("보기만 하는 사람은 지우기도 거부된다", async () => {
    const { projectId, pm } = await setup();
    const po = await attach(pm, projectId, "purchase_order");
    const reader = await makeReader();
    await expect(removeEvidence(reader, { fileId: po.id })).rejects.toThrow();
    expect(await hasProjectDocument(pm, projectId, "purchase_order")).toBe(true);
  });

  it("프로젝트를 못 보는 사람에게는 목록이 없고 붙이기는 없는 프로젝트로 거부된다", async () => {
    const { projectId } = await setup();
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `other-${randomUUID()}@example.test`, name: "남 PM", roleId: DEFAULT_ROLE_ID });
    const stranger: Viewer = { id: userId, roleId: DEFAULT_ROLE_ID };
    expect(await listProjectDocuments(stranger, projectId)).toBeNull();
    await expect(attach(stranger, projectId, "purchase_order")).rejects.toThrow("존재하지 않는 프로젝트");
  });

  it("완료 프로젝트는 담당 PM도 붙이지 못한다(정보 면 고치기 권리와 같음)", async () => {
    const { projectId, pm } = await setup();
    await db.update(projects).set({ status: "completed", startDate: "2026-01-01", endDate: "2026-01-31" }).where(eq(projects.id, projectId));
    expect((await listProjectDocuments(pm, projectId))?.canWrite).toBe(false);
    await expect(attach(pm, projectId, "purchase_order")).rejects.toThrow();
  });
});

// 사용자 결정(10/23 「견적 금액 권한도 확인」 · cso P2-1) — 발주서에는 견적 금액이 적혀 있으므로 서류 읽기 = 행 범위 ∧ quote.amount 노출
// (견적 차수 증빙 revisionEvidenceRights와 같은 기준). 쓰기는 읽기를 전제로 한다.
describe("프로젝트 서류 — 견적 금액 노출", () => {
  it("quote.amount를 못 보는 계급은 권리 read=false · 받기 거부 · 섹션 데이터 없음", async () => {
    const { projectId, pm } = await setup();
    const po = await attach(pm, projectId, "purchase_order");
    const reader = await makeReader({ quoteAmount: false });
    const [doc] = await db.select({ id: projectDocuments.id }).from(projectDocuments).where(eq(projectDocuments.projectId, projectId));
    if (!doc) throw new Error("서류 행이 없습니다");

    const owner = await projectDocumentOwner(reader, doc.id);
    if (!owner) throw new Error("범위 안 프로젝트의 서류 주인이 없습니다");
    expect(await projectDocumentRights(reader, owner)).toEqual({ read: false, write: false });
    expect(await createEvidenceViewUrl(reader, { fileId: po.id }, { storage: createMemoryStorage() })).toBeNull();
    expect(await listProjectDocuments(reader, projectId)).toBeNull();
  });

  it("quote.amount 없는 쓰기 계급도 붙이기는 없는 프로젝트로 거부되고 행이 생기지 않는다", async () => {
    const { projectId } = await setup();
    const writer = await makeReader({ quoteAmount: false, write: true });
    const before = (await db.select().from(projectDocuments).where(eq(projectDocuments.projectId, projectId))).length;
    await expect(attach(writer, projectId, "other")).rejects.toThrow("존재하지 않는 프로젝트");
    expect((await db.select().from(projectDocuments).where(eq(projectDocuments.projectId, projectId))).length).toBe(before);
  });

  it("quote.amount를 보는 같은 모양의 계급은 그대로 읽고 받는다", async () => {
    const { projectId, pm } = await setup();
    const po = await attach(pm, projectId, "purchase_order");
    const reader = await makeReader();
    const [doc] = await db.select({ id: projectDocuments.id }).from(projectDocuments).where(eq(projectDocuments.projectId, projectId));
    if (!doc) throw new Error("서류 행이 없습니다");

    const owner = await projectDocumentOwner(reader, doc.id);
    if (!owner) throw new Error("범위 안 프로젝트의 서류 주인이 없습니다");
    expect(await projectDocumentRights(reader, owner)).toEqual({ read: true, write: false });
    expect(await createEvidenceViewUrl(reader, { fileId: po.id }, { storage: createMemoryStorage() })).not.toBeNull();
    expect((await listProjectDocuments(reader, projectId))?.documents).toHaveLength(1);
  });
});
