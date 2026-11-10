import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { files, uploadIntents } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createAccount } from "@/domain/auth/accounts";
import {
  COMPANY_LOGO_OWNER_KIND,
  confirmCompanyLogoUpload,
  deleteCompanyLogo,
  getCompanyLogo,
  getCompanyLogoUrl,
  requestCompanyLogoUpload,
  restoreCompanyLogo,
} from "@/domain/settings/company-logo";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";

// 07.2-10 Task 3 (PU3 · D-7225 · DC-6) — 회사 로고: files 행 owner_kind `company_logo`, 바꾸기 = 이전 행 보관 + 새 행, 삭제 · 되돌리기, PNG · JPG 2MB만.
// 로고는 전역 상태 하나라 각 사례 앞에 비운다(다른 스펙의 인쇄 머리를 남기지 않도록 끝에서도 비운다).

const MB = 1024 * 1024;

async function admin(roleId: string = SYSADMIN_ROLE_ID): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `logo-${randomUUID()}@example.test`, name: "로고 관리자", roleId });
  return { id: userId, roleId };
}

async function clearLogos() {
  await db.delete(files).where(eq(files.ownerKind, COMPANY_LOGO_OWNER_KIND));
  await db.delete(uploadIntents).where(eq(uploadIntents.ownerKind, COMPANY_LOGO_OWNER_KIND));
}

const alive = () => db.select().from(files).where(and(eq(files.ownerKind, COMPANY_LOGO_OWNER_KIND), isNull(files.removedAt)));

function declared(size: number, contentType = "image/png", name = "logo.png") {
  return { size, contentType, sha256: createHash("sha256").update(randomUUID()).digest("hex"), name };
}

async function upload(viewer: Viewer, storage: MemoryStorage, size = 1 * MB, contentType = "image/png", name = "logo.png") {
  const input = declared(size, contentType, name);
  const intent = await requestCompanyLogoUpload(viewer, input, { storage });
  storage.put(intent.url, { size: input.size, contentType: input.contentType, sha256: input.sha256 });
  return confirmCompanyLogoUpload(viewer, { intentId: intent.intentId }, { storage });
}

beforeEach(clearLogos);
afterAll(clearLogos);

describe("회사 로고 — 올리기 · 바꾸기 · 삭제 · 되돌리기", () => {
  it("로고가 없으면 getCompanyLogoUrl()은 null이다", async () => {
    expect(await getCompanyLogoUrl({ storage: createMemoryStorage() })).toBeNull();
    expect(await getCompanyLogo(await admin(), { storage: createMemoryStorage() })).toEqual({ file: null, url: null });
  });

  it("PNG 1MB를 올리면 owner_kind company_logo 행이 하나 살아 있고 읽기 주소가 나온다", async () => {
    const viewer = await admin();
    const storage = createMemoryStorage();
    const file = await upload(viewer, storage);
    const rows = await alive();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: file.id, ownerKind: "company_logo", contentType: "image/png", sizeBytes: 1 * MB, uploadedBy: viewer.id });
    expect(await getCompanyLogoUrl({ storage })).not.toBeNull();
    expect(storage.retains).toHaveLength(1);
  });

  it("바꾸기: 이전 행은 보관(removed_at)되고 새 행 하나만 살아 있다", async () => {
    const viewer = await admin();
    const storage = createMemoryStorage();
    const first = await upload(viewer, storage, 1 * MB, "image/png", "첫.png");
    const second = await upload(viewer, storage, 500 * 1024, "image/jpeg", "둘.jpg");
    const rows = await alive();
    expect(rows.map((row) => row.id)).toEqual([second.id]);
    const [old] = await db.select().from(files).where(eq(files.id, first.id));
    expect(old?.removedAt).not.toBeNull();
  });

  it("삭제하면 살아 있는 행이 없고, 되돌리기로 그 행이 돌아온다", async () => {
    const viewer = await admin();
    const storage = createMemoryStorage();
    const file = await upload(viewer, storage);
    await deleteCompanyLogo(viewer, { fileId: file.id });
    expect(await alive()).toHaveLength(0);
    expect(await getCompanyLogoUrl({ storage })).toBeNull();
    await restoreCompanyLogo(viewer, { fileId: file.id });
    expect((await alive()).map((row) => row.id)).toEqual([file.id]);
  });

  it("바꾼 뒤 삭제하고 되돌리면 삭제한 새 행이 돌아오고 옛 행은 그대로 보관이다", async () => {
    const viewer = await admin();
    const storage = createMemoryStorage();
    const first = await upload(viewer, storage, 1 * MB, "image/png", "첫.png");
    const second = await upload(viewer, storage, 400 * 1024, "image/png", "둘.png");
    await deleteCompanyLogo(viewer, { fileId: second.id });
    await restoreCompanyLogo(viewer, { fileId: second.id });
    expect((await alive()).map((row) => row.id)).toEqual([second.id]);
    const [old] = await db.select().from(files).where(eq(files.id, first.id));
    expect(old?.removedAt).not.toBeNull();
  });
});

describe("회사 로고 — 검사", () => {
  it("SVG는 형식 오류 문구로 거부한다", async () => {
    const viewer = await admin();
    await expect(requestCompanyLogoUpload(viewer, declared(10 * 1024, "image/svg+xml", "logo.svg"), { storage: createMemoryStorage() })).rejects.toThrow("형식 오류 · PNG·JPG로 다시");
  });

  it("3MB는 크기 초과 문구(크기 · 2MB 초과 · 줄여 다시)로 거부한다", async () => {
    const viewer = await admin();
    await expect(requestCompanyLogoUpload(viewer, declared(3 * MB), { storage: createMemoryStorage() })).rejects.toThrow("3.0MB · 2MB 초과 · 줄여 다시");
  });

  it("거부된 요청은 의도 행을 남기지 않는다", async () => {
    const viewer = await admin();
    await requestCompanyLogoUpload(viewer, declared(3 * MB), { storage: createMemoryStorage() }).catch(() => undefined);
    expect(await db.select().from(uploadIntents).where(eq(uploadIntents.ownerKind, COMPANY_LOGO_OWNER_KIND))).toHaveLength(0);
  });

  it("선언과 다른 바이트(크기)가 올라오면 완료를 거부하고 객체를 지운다", async () => {
    const viewer = await admin();
    const storage = createMemoryStorage();
    const input = declared(1 * MB);
    const intent = await requestCompanyLogoUpload(viewer, input, { storage });
    storage.put(intent.url, { size: input.size + 1, contentType: input.contentType, sha256: input.sha256 });
    await expect(confirmCompanyLogoUpload(viewer, { intentId: intent.intentId }, { storage })).rejects.toThrow();
    expect(await alive()).toHaveLength(0);
  });
});

describe("회사 로고 — 서명 실패", () => {
  it("읽기 주소 서명이 실패해도 설정 화면용 getCompanyLogo는 파일을 주고 미리보기 주소만 null이다", async () => {
    const viewer = await admin();
    const storage = createMemoryStorage();
    await upload(viewer, storage);
    const failing = { ...storage, createSignedGet: () => Promise.reject(new Error("sign failed")) } as MemoryStorage;
    const result = await getCompanyLogo(viewer, { storage: failing });
    expect(result.file).not.toBeNull();
    expect(result.url).toBeNull();
  });
});

describe("회사 로고 — 권리(admin.settings write)", () => {
  it("쓰기 권리가 없는 계정은 올리기 · 삭제 · 되돌리기에서 ForbiddenError다", async () => {
    const owner = await admin();
    const storage = createMemoryStorage();
    const file = await upload(owner, storage);
    const pm = await admin(DEFAULT_ROLE_ID);
    await expect(requestCompanyLogoUpload(pm, declared(1 * MB), { storage })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteCompanyLogo(pm, { fileId: file.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(restoreCompanyLogo(pm, { fileId: file.id })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await alive()).toHaveLength(1);
  });

  it("로고가 아닌 파일 id로는 삭제 · 되돌리기를 못 한다", async () => {
    const viewer = await admin();
    await expect(deleteCompanyLogo(viewer, { fileId: randomUUID() })).rejects.toThrow();
    await expect(restoreCompanyLogo(viewer, { fileId: randomUUID() })).rejects.toThrow();
  });
});
