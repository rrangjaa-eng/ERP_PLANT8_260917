import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount, resetPassword } from "@/domain/auth/accounts";
import { finalizePasswordChange } from "@/domain/auth/password";
import { listPeople, type PersonDto } from "@/domain/people";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { personLoginStatus } from "@/app/(app)/admin/people/person-status";

// D8-07 · ROADMAP 04.4 기준 4·5: 사람 목록 DTO의 두 필드(firstLoginAt · passwordIsTemporary)와
// 그 판정이 발급 → 로그인 → 비밀번호 변경 → 재발급을 따라 바뀌고, person.value를 못 보는 계급에게는 필드가 없다.

let ipCounter = 0;
function nextTestIp(): string {
  ipCounter += 1;
  return `203.0.113.${10 + ipCounter}`;
}

async function signIn(email: string, password: string): Promise<void> {
  const res = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
    asResponse: true,
  });
  expect(res.status).toBe(200);
}

async function personOf(viewer: Viewer, userId: string): Promise<PersonDto> {
  const person = (await listPeople(viewer)).find((p) => p.id === userId);
  expect(person).toBeDefined();
  return person!;
}

async function newAccount(): Promise<{ userId: string; email: string; tempPassword: string }> {
  const email = `login-status-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "로그인 상태" });
  return { userId, email, tempPassword };
}

describe("사람 목록 로그인 상태(D8-07, 실제 Postgres)", () => {
  it("발급 직후에는 firstLoginAt이 null, passwordIsTemporary가 true다", async () => {
    const { userId } = await newAccount();
    const person = await personOf(SYSTEM_VIEWER, userId);
    expect(person.firstLoginAt).toBeNull();
    expect(person.passwordIsTemporary).toBe(true);
  });

  it("로그인에 성공하면 firstLoginAt이 로그인 직전·직후 사이로 채워지고 임시 표시는 그대로다", async () => {
    const { userId, email, tempPassword } = await newAccount();
    const before = Date.now();
    await signIn(email, tempPassword);
    const after = Date.now();

    const person = await personOf(SYSTEM_VIEWER, userId);
    expect(person.firstLoginAt).toBeInstanceOf(Date);
    expect(person.firstLoginAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(person.firstLoginAt!.getTime()).toBeLessThanOrEqual(after + 1000);
    expect(person.passwordIsTemporary).toBe(true);
  });

  it("person.value를 못 보는 계급에게는 두 키가 DTO에 없다", async () => {
    await newAccount();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `값 가림 계급-${randomUUID()}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "person.value", visible: false });
    const viewer: Viewer = { id: `viewer-${randomUUID()}`, roleId: role.id };

    const people = await listPeople(viewer);
    expect(people.length).toBeGreaterThan(0);
    for (const dto of people) {
      expect("firstLoginAt" in dto).toBe(false);
      expect("passwordIsTemporary" in dto).toBe(false);
    }
    for (const dto of people) {
      expect(personLoginStatus(dto)).toEqual({ kind: "badges", badges: [] });
    }
  });

  it("발급 → 로그인 → 비밀번호 변경 → 재발급 흐름에서 배지가 규칙대로 바뀐다", async () => {
    const { userId, email, tempPassword } = await newAccount();
    const badges = async () => personLoginStatus(await personOf(SYSTEM_VIEWER, userId));

    expect(await badges()).toEqual({ kind: "badges", badges: ["첫 로그인 전", "임시 비밀번호 사용 중"] });

    await signIn(email, tempPassword);
    expect(await badges()).toEqual({ kind: "badges", badges: ["임시 비밀번호 사용 중"] });

    await finalizePasswordChange(SYSTEM_VIEWER, userId);
    expect(await badges()).toEqual({ kind: "badges", badges: [] });

    await resetPassword(SYSTEM_VIEWER, email);
    expect(await badges()).toEqual({ kind: "badges", badges: ["임시 비밀번호 사용 중"] });
  });
});
