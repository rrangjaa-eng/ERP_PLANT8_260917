import { describe, expect, it } from "vitest";
import { resolveSettingsGroup } from "@/app/(app)/admin/settings/group-param";

describe("resolveSettingsGroup", () => {
  const groups = ["로그인 잠금", "행동 로그", "세율"];

  it("목록에 있는 묶음 이름이면 그대로 돌려준다", () => {
    expect(resolveSettingsGroup(groups, "세율")).toBe("세율");
  });

  it("값이 없으면 첫 묶음이다", () => {
    expect(resolveSettingsGroup(groups, undefined)).toBe("로그인 잠금");
  });

  it("목록에 없는 이름이면 첫 묶음이다", () => {
    expect(resolveSettingsGroup(groups, "없는 묶음")).toBe("로그인 잠금");
  });

  it("같은 이름이 여러 번 오면(배열) 첫 값으로 판정한다", () => {
    expect(resolveSettingsGroup(groups, ["행동 로그", "세율"])).toBe("행동 로그");
    expect(resolveSettingsGroup(groups, ["없음", "세율"])).toBe("로그인 잠금");
  });
});
