import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.5-04(UI-SPEC O21 · 디자인 리뷰 R5): 칸 정의의 보관 · 복원 권한은 domain/archive 한 곳에서 판정한다.
// 보관함 서버 액션("use server" → server-only)은 Vitest가 import하지 못해 소스로 지킨다 — 복원 액션이
// 자체 권한 판정이나 다른 쓰기 경로 없이 domain restore()만 부르면, (a) 통합 테스트의 domain 거부가
// 액션 경로에도 그대로 성립한다. 실제 액션 경유 거부는 E2E(field-definitions.spec.ts)가 증명한다.
function code(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

function actionBody(src: string, name: string): string {
  const start = src.indexOf(`export const ${name}`);
  if (start < 0) return "";
  const next = src.indexOf("export const ", start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

describe("보관함 복원 액션은 domain restore()만 부른다 (04.5-04 (b))", () => {
  const ARCHIVE_ACTIONS = code("app/(app)/admin/archive/actions.ts");
  const body = actionBody(ARCHIVE_ACTIONS, "restoreArchivedAction");

  it("복원 액션 본문을 찾았고 domain restore(를 부른다", () => {
    expect(body).not.toBe("");
    expect(body).toContain("await restore(ctx.viewer, parsedInput.entity, parsedInput.id)");
  });

  it("자체 권한 판정(can()) · 리포지토리 import가 없다", () => {
    expect(ARCHIVE_ACTIONS).not.toMatch(/\bcan\(/);
    expect(ARCHIVE_ACTIONS).not.toMatch(/from "@\/repositories\//);
  });
});
