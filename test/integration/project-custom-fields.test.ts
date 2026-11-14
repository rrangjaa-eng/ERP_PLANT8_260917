import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions, projects, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, findProject, ProjectInputRejectedError, type ProjectInput } from "@/domain/projects";
import { visibleCustomFieldKeys } from "@/domain/custom-fields/visibility";
import {
  ARCHIVED_OPTION_MESSAGE,
  REQUIRED_SELECT_EMPTY_MESSAGE,
  REQUIRED_VALUE_EMPTY_MESSAGE,
  UnknownCustomFieldKeyError,
} from "@/domain/custom-fields/preserve";
import { CUSTOM_DATE_INVALID_MESSAGE } from "@/domain/custom-fields/build-schema";
import { seedCustomFieldDefinition } from "@/test/support/custom-fields";

// 07.5-02(D-7504 · D-7505 · D-7508 · D-7523 · eng A-6 · A-12 · A-16) — 프로젝트 등록이 보는 사람의 입력 칸(활성 ∧ project.value ∧
// cf.project.<key>)만 판정하고, ProjectDto 출구(createProject 반환 · findProject)가 추가 칸을 칸별로 거른다.

async function makeViewer(infoItems: string[] = ["project.value"]): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `추가 칸 계급-${randomUUID()}`, workScope: "company", viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `pcf-${randomUUID()}@example.test`, name: "추가 칸 등록 사람", roleId: role.id });
  for (const action of ["view", "write"] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action, allowed: true });
  }
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

function roleOf(viewer: Viewer): string {
  if (!viewer.roleId) throw new Error("계급 없음");
  return viewer.roleId;
}

async function baseInput(viewer: Viewer, patch: Partial<ProjectInput> = {}): Promise<ProjectInput> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `고객사-${randomUUID()}`, normalizedName: `고객사-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  return { clientId: client.id, teamId: team.id, pmUserId: viewer.id, name: `추가 칸-${randomUUID()}`, ...patch };
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부될 줄 알았는데 통과했다");
}

async function storedCustomFields(projectId: string): Promise<Record<string, unknown>> {
  const [row] = await db.select({ customFields: projects.customFields }).from(projects).where(eq(projects.id, projectId));
  return row?.customFields as Record<string, unknown>;
}

describe("프로젝트 등록 추가 칸 · DTO 칸별 거름(D-7505 · D-7508)", () => {
  it("보이는 칸 값은 저장 · 반환 DTO · findProject에 있고, 칸을 끈 계급 직렬화에는 값이 없다", async () => {
    const a = await makeViewer();
    const b = await makeViewer();
    const place = await seedCustomFieldDefinition("project", { label: "장소", type: "text" }, { visibleRoleIds: [roleOf(a)] });

    const created = await createProject(a, await baseInput(a, { customFields: { [place.key]: "코엑스" } }));

    expect(created.customFields).toEqual({ [place.key]: "코엑스" });
    expect((await findProject(a, created.id))?.customFields).toEqual({ [place.key]: "코엑스" });
    const seenByB = await findProject(b, created.id);
    expect(seenByB).not.toBeNull();
    expect(JSON.stringify(seenByB)).not.toContain("코엑스");
    expect(seenByB?.customFields).toEqual({});
  });

  it("정의에 없는 키는 UnknownCustomFieldKeyError · 행 없음", async () => {
    const a = await makeViewer();
    const input = await baseInput(a, { customFields: { cf_nothere0: "x" } });
    const error = await rejection(createProject(a, input));
    expect(error).toBeInstanceOf(UnknownCustomFieldKeyError);
    expect(await db.select().from(projects).where(eq(projects.name, input.name))).toHaveLength(0);
  });

  it("project.value가 꺼진 계급의 DTO에는 customFields가 없고 노출 키 조회를 부르지 않는다(eng A-12)", async () => {
    const a = await makeViewer();
    const off = await makeViewer([]);
    await seedCustomFieldDefinition("project", { label: "장소", type: "text" }, { visibleRoleIds: [roleOf(a), roleOf(off)] });
    const created = await createProject(a, await baseInput(a));

    const offSpy = vi.fn(visibleCustomFieldKeys);
    const seenByOff = await findProject(off, created.id, { visibleCustomFieldKeys: offSpy });
    expect(seenByOff).not.toBeNull();
    expect(seenByOff && "customFields" in seenByOff).toBe(false);
    expect(offSpy).not.toHaveBeenCalled();

    const onSpy = vi.fn(visibleCustomFieldKeys);
    await findProject(a, created.id, { visibleCustomFieldKeys: onSpy });
    expect(onSpy).toHaveBeenCalledTimes(1);
  });

  it("기간 오류와 필수 추가 칸 빈칸이 한 번의 ProjectInputRejectedError에 같이 온다(eng A-6)", async () => {
    const a = await makeViewer();
    const required = await seedCustomFieldDefinition("project", { label: "필수 칸", type: "text", required: true }, { visibleRoleIds: [roleOf(a)] });

    const error = await rejection(createProject(a, await baseInput(a, { startDate: "2026-12-01", endDate: "2026-11-01" })));

    expect(error).toBeInstanceOf(ProjectInputRejectedError);
    const fields = (error as ProjectInputRejectedError).errors.map((entry) => entry.field);
    expect(fields.some((field) => field === "startDate" || field === "endDate")).toBe(true);
    expect((error as ProjectInputRejectedError).errors).toContainEqual({ field: `cf_${required.key}`, reason: REQUIRED_VALUE_EMPTY_MESSAGE });
  });
});

describe("등록 필수 · 보관 · 숨은 칸 · 선택지 · 날짜 · 숫자(D-7503 · D-7507 · eng P3-5 · A-16)", () => {
  async function rejectedErrors(viewer: Viewer, customFields: Record<string, unknown>) {
    const error = await rejection(createProject(viewer, await baseInput(viewer, { customFields })));
    expect(error).toBeInstanceOf(ProjectInputRejectedError);
    return (error as ProjectInputRejectedError).errors;
  }

  it("보이는 필수 칸이 비면 칸 오류 · 선택형은 선택지 문구", async () => {
    const a = await makeViewer();
    const text = await seedCustomFieldDefinition("project", { label: "필수 글", type: "text", required: true, sortOrder: 1 }, { visibleRoleIds: [roleOf(a)] });
    const pick = await seedCustomFieldDefinition(
      "project",
      { label: "필수 고르기", type: "select", options: ["가", "나"], required: true, sortOrder: 2 },
      { visibleRoleIds: [roleOf(a)] },
    );
    expect(await rejectedErrors(a, {})).toEqual([
      { field: `cf_${text.key}`, reason: REQUIRED_VALUE_EMPTY_MESSAGE },
      { field: `cf_${pick.key}`, reason: REQUIRED_SELECT_EMPTY_MESSAGE },
    ]);
  });

  it("보관된 필수 칸 · 이 사람에게 안 보이는 필수 칸은 등록을 막지 않는다", async () => {
    const a = await makeViewer();
    const b = await makeViewer();
    const archived = await seedCustomFieldDefinition("project", { label: "보관 필수", type: "text", required: true }, { visibleRoleIds: [roleOf(a), roleOf(b)] });
    await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(and(eq(fieldDefinitions.entity, "project"), eq(fieldDefinitions.key, archived.key)));
    await seedCustomFieldDefinition("project", { label: "A만 필수", type: "text", required: true }, { visibleRoleIds: [roleOf(a)] });

    const created = await createProject(b, await baseInput(b));
    expect(created.id).toBeTruthy();
  });

  it("보관 선택지로 등록하면 그 칸 오류 「보관된 선택지 · 다른 선택지 고르기」", async () => {
    const a = await makeViewer();
    const pick = await seedCustomFieldDefinition("project", { label: "구분", type: "select", options: ["새"] }, { visibleRoleIds: [roleOf(a)] });
    await db.update(fieldDefinitions).set({ archivedOptions: ["옛"] }).where(and(eq(fieldDefinitions.entity, "project"), eq(fieldDefinitions.key, pick.key)));
    expect(await rejectedErrors(a, { [pick.key]: "옛" })).toEqual([{ field: `cf_${pick.key}`, reason: ARCHIVED_OPTION_MESSAGE }]);
  });

  it("실존하지 않는 날짜는 「날짜 아님 · 2026-11-04처럼」", async () => {
    const a = await makeViewer();
    const day = await seedCustomFieldDefinition("project", { label: "행사일", type: "date" }, { visibleRoleIds: [roleOf(a)] });
    expect(await rejectedErrors(a, { [day.key]: "2026-02-31" })).toEqual([{ field: `cf_${day.key}`, reason: CUSTOM_DATE_INVALID_MESSAGE }]);
  });

  it("필수 숫자 칸의 빈 글자 · 공백만은 필수 오류, 선택 숫자 칸 공백만은 값 없이 저장", async () => {
    const a = await makeViewer();
    const must = await seedCustomFieldDefinition("project", { label: "인원", type: "number", required: true, sortOrder: 1 }, { visibleRoleIds: [roleOf(a)] });
    const may = await seedCustomFieldDefinition("project", { label: "예비 인원", type: "number", sortOrder: 2 }, { visibleRoleIds: [roleOf(a)] });

    expect(await rejectedErrors(a, { [must.key]: "" })).toEqual([{ field: `cf_${must.key}`, reason: REQUIRED_VALUE_EMPTY_MESSAGE }]);
    expect(await rejectedErrors(a, { [must.key]: "  " })).toEqual([{ field: `cf_${must.key}`, reason: REQUIRED_VALUE_EMPTY_MESSAGE }]);

    const created = await createProject(a, await baseInput(a, { customFields: { [must.key]: "12", [may.key]: "  " } }));
    expect(await storedCustomFields(created.id)).toEqual({ [must.key]: 12 });
  });

  it("복사 등록은 출처의 추가 칸 값을 채우지 않는다(D-7523)", async () => {
    const a = await makeViewer();
    const place = await seedCustomFieldDefinition("project", { label: "장소", type: "text" }, { visibleRoleIds: [roleOf(a)] });
    const source = await createProject(a, await baseInput(a, { customFields: { [place.key]: "출처 장소" } }));

    const copy = await createProject(a, await baseInput(a, { copyFromProjectId: source.id }));
    expect(await storedCustomFields(copy.id)).toEqual({});
  });
});
