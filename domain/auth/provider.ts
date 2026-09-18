import { env } from "@/lib/env";

export const AUTH_PROVIDERS = ["email", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export function getAuthProvider(): AuthProvider {
  return env.AUTH_PROVIDER;
}
