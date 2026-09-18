import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");
const dockerignore = readFileSync(resolve(process.cwd(), ".dockerignore"), "utf8");

describe("Dockerfile", () => {
  it("FROM node:24-slim을 2회 이상 쓴다(멀티스테이지)", () => {
    const matches = dockerfile.match(/FROM node:24-slim/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("스테이지 이름 deps·build·runtime을 갖는다", () => {
    expect(dockerfile).toMatch(/AS deps\b/);
    expect(dockerfile).toMatch(/AS build\b/);
    expect(dockerfile).toMatch(/AS runtime\b/);
  });

  it("pnpm install --frozen-lockfile --ignore-scripts로 설치한다", () => {
    expect(dockerfile).toContain("pnpm install --frozen-lockfile --ignore-scripts");
  });

  it("pnpm build && pnpm build:cli를 함께 실행한다", () => {
    expect(dockerfile).toContain("pnpm build && pnpm build:cli");
  });

  it("standalone·dist/cli·db/migrations를 런타임 스테이지로 복사한다", () => {
    expect(dockerfile).toContain("COPY --from=build /app/.next/standalone");
    expect(dockerfile).toContain("COPY --from=build /app/dist/cli");
    expect(dockerfile).toContain("COPY --from=build /app/db/migrations");
  });

  it("비루트 USER로 실행하고 3000 포트로 server.js를 실행한다", () => {
    expect(dockerfile).toMatch(/^USER\s+\S+/m);
    expect(dockerfile).not.toMatch(/^USER\s+root\b/m);
    expect(dockerfile).toContain("EXPOSE 3000");
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
  });

  it("corepack을 쓰지 않는다", () => {
    expect(dockerfile.toLowerCase()).not.toContain("corepack");
  });

  it("인프라 플래그(--no-assign-ip)를 포함하지 않는다 — 이미지는 인프라를 모른다", () => {
    expect(dockerfile).not.toContain("--no-assign-ip");
  });
});

describe(".dockerignore", () => {
  const required = ["node_modules", ".next", ".env", ".git", "test", ".planning", "gha-creds-*.json"];
  for (const entry of required) {
    it(`${entry}를 포함한다`, () => {
      expect(dockerignore).toContain(entry);
    });
  }
});
