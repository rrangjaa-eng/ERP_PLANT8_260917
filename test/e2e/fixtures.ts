import { randomUUID } from "node:crypto";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";

export async function createFixtureUser(options: {
  isAdmin: boolean;
}): Promise<{ email: string; password: string }> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: options.isAdmin ? "E2E Admin" : "E2E Employee",
    isAdmin: options.isAdmin,
  });
  return { email, password: tempPassword };
}
