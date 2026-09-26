import { describe, expect, it } from "vitest";
import { resolveDefaultOptionId } from "@/app/(app)/projects/copy-defaults";

// /review team-scope-create-review.md P3(1) — 다른 팀 프로젝트를 복사하면
// copySource.teamId/pmUserId가 팀 범위로 좁힌 옵션에 없어 `??` 폴백이 그
// 값을 그대로 통과시켜 select가 "—"로 떨어진다. 옵션에 있을 때만 쓰고
// 아니면 폴백(단일 팀 미리 고르기 등)으로 떨어진다.
describe("resolveDefaultOptionId", () => {
  const options = [{ id: "a" }, { id: "b" }];

  it("후보 값이 옵션에 있으면 그 값을 쓴다", () => {
    expect(resolveDefaultOptionId("b", options)).toBe("b");
  });

  it("후보 값이 옵션에 없으면(다른 팀 출처) 폴백을 쓴다", () => {
    expect(resolveDefaultOptionId("other-team-id", options, "a")).toBe("a");
  });

  it("후보 값이 없고 폴백도 없으면 undefined", () => {
    expect(resolveDefaultOptionId(undefined, options)).toBeUndefined();
  });
});
