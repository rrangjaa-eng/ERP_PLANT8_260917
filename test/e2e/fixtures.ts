import { randomUUID } from "node:crypto";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// D-36(03-02): 계급 식별자가 필수 필드다 — 선택 인자가 아니다(호출자가 계급을
// 의식하지 않고 픽스처를 만드는 상태를 없앤다). 표시 이름은 시스템 관리자
// 계급만 「E2E Admin」이고 나머지는 전부 「E2E Employee」다 — E2E 스펙이
// 이미 이 두 문자열로 사용자 메뉴 트리거 등을 찾는다(기존 계약 유지).
export async function createFixtureUser(options: { roleId: string }): Promise<{ email: string; password: string }> {
  const email = `e2e-${randomUUID()}@example.test`;
  const name = options.roleId === SYSADMIN_ROLE_ID ? "E2E Admin" : "E2E Employee";
  const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name,
    roleId: options.roleId,
  });
  return { email, password: tempPassword };
}
