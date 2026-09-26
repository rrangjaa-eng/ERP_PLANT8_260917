"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { registerPerson, changePersonRole, archivePerson } from "@/domain/people";
import { assignTeam, cancelFutureAssignment, createOrgUnit, renameOrgUnit, createTeam, renameTeam } from "@/domain/org";
import { createRole, renameRole, setRoleWorkScope, ROLE_WORK_SCOPES } from "@/domain/permissions/roles";
import { archive } from "@/domain/archive";
import "./actions.registry";

// MAST-02·ADMN-08: 사람·계급·조직 세 화면의 액션을 한 파일에 모은다(계획
// 원문 — 세 화면이 admin.people 한 메뉴로 관리되는 한 묶음이다). domain만
// 부르고 리포지토리·db 계층을 직접 import하지 않는다. 등록은 ./actions.registry로
// 옮겼다(03-03, Rule 3 — server-only 의존 체인 때문에 누수 스캔이 이 파일을
// 직접 import할 수 없다).

export const registerPersonAction = authedActionClient
  .schema(
    z.object({
      name: z.string().min(1, "이름을 입력하세요."),
      email: z.string().email("이메일 형식이 아닙니다."),
      roleId: z.string().min(1, "계급을 선택하세요."),
      teamId: z.string().min(1).optional(),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "발령일 형식이 아닙니다.").optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await registerPerson(ctx.viewer, parsedInput);
    revalidatePath("/admin/people");
    // 사람 등록의 초기 비밀번호가 반환값에 실리는 것은 의도다(화면이 한 번
    // 보여준다) — next-safe-action의 직렬화를 거쳐 클라이언트로 가는 경로
    // 외에는 남지 않는다(recordAction 기록에는 없음, T-03-29).
    return result;
  });

export const changePersonRoleAction = authedActionClient
  .schema(z.object({ userId: z.string().min(1), roleId: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await changePersonRole(ctx.viewer, parsedInput.userId, parsedInput.roleId);
    revalidatePath("/admin/people");
    revalidatePath(`/admin/people/${parsedInput.userId}`);
  });

export const assignTeamAction = authedActionClient
  .schema(
    z.object({
      userId: z.string().min(1),
      teamId: z.string().min(1),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "발령일 형식이 아닙니다."),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await assignTeam(ctx.viewer, parsedInput);
    revalidatePath(`/admin/people/${parsedInput.userId}`);
  });

export const cancelAssignmentAction = authedActionClient
  .schema(z.object({ userId: z.string().min(1), effectiveFrom: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await cancelFutureAssignment(ctx.viewer, parsedInput);
    revalidatePath(`/admin/people/${parsedInput.userId}`);
  });

export const createRoleAction = authedActionClient
  .schema(z.object({ name: z.string().min(1, "이름을 입력하세요."), sortOrder: z.coerce.number().int().default(0) }))
  .action(async ({ parsedInput, ctx }) => {
    await createRole(ctx.viewer, parsedInput);
    revalidatePath("/admin/people/roles");
  });

export const renameRoleAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), name: z.string().min(1, "이름을 입력하세요.") }))
  .action(async ({ parsedInput, ctx }) => {
    await renameRole(ctx.viewer, parsedInput.id, parsedInput.name);
    revalidatePath("/admin/people/roles");
  });

export const setRoleWorkScopeAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), workScope: z.enum(ROLE_WORK_SCOPES) }))
  .action(async ({ parsedInput, ctx }) => {
    await setRoleWorkScope(ctx.viewer, parsedInput.id, parsedInput.workScope);
    revalidatePath("/admin/people/roles");
  });

export const archiveRoleAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "roles", parsedInput.id);
    revalidatePath("/admin/people/roles");
    revalidatePath("/admin/archive");
  });

export const createOrgUnitAction = authedActionClient
  .schema(z.object({ name: z.string().min(1, "이름을 입력하세요."), sortOrder: z.coerce.number().int().default(0) }))
  .action(async ({ parsedInput, ctx }) => {
    await createOrgUnit(ctx.viewer, parsedInput);
    revalidatePath("/admin/people/org");
  });

export const renameOrgUnitAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), name: z.string().min(1, "이름을 입력하세요.") }))
  .action(async ({ parsedInput, ctx }) => {
    await renameOrgUnit(ctx.viewer, parsedInput.id, parsedInput.name);
    revalidatePath("/admin/people/org");
  });

// 03-07: 「삭제」 셋 — 사람은 보관 + 세션 만료(domain/people.archivePerson),
// 본부·팀은 domain/archive의 보관 함수만 부른다. 계급은 이미 위
// archiveRoleAction이 있다.
export const archivePersonAction = authedActionClient
  .schema(z.object({ userId: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archivePerson(ctx.viewer, parsedInput.userId);
    revalidatePath("/admin/people");
    revalidatePath("/admin/archive");
  });

export const archiveOrgUnitAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "org_unit", parsedInput.id);
    revalidatePath("/admin/people/org");
    revalidatePath("/admin/archive");
  });

export const archiveTeamAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "team", parsedInput.id);
    revalidatePath("/admin/people/org");
    revalidatePath("/admin/archive");
  });

export const createTeamAction = authedActionClient
  .schema(
    z.object({
      orgUnitId: z.string().min(1, "본부를 선택하세요."),
      name: z.string().min(1, "이름을 입력하세요."),
      sortOrder: z.coerce.number().int().default(0),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await createTeam(ctx.viewer, parsedInput);
    revalidatePath("/admin/people/org");
  });

export const renameTeamAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), name: z.string().min(1, "이름을 입력하세요.") }))
  .action(async ({ parsedInput, ctx }) => {
    await renameTeam(ctx.viewer, parsedInput.id, parsedInput.name);
    revalidatePath("/admin/people/org");
  });
