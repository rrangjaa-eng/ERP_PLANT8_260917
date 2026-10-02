import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOGIN_REQUIRED_MESSAGE } from "@/lib/actions/user-facing-error";
import { PERMISSION_DENIED_CAUSE, formReason } from "@/lib/actions/form-reason";

// 04.5-08(U1-A): 폼 전체 서버 오류 한 줄 규칙 — 재시도로 풀리지 않는 원인은 1차를 막고 「새로 불러오기」로 보낸다.
describe("formReason", () => {
  it("권한 없음 원문은 다시 시도 없이 새로 불러오기로 막는다", () => {
    expect(formReason("추가", PERMISSION_DENIED_CAUSE)).toEqual({
      text: "추가할 수 없음 — 권한 없음 · ",
      next: "refresh",
      blocked: true,
    });
  });

  it("원인 상수는 「권한 없음」이다", () => {
    expect(PERMISSION_DENIED_CAUSE).toBe("권한 없음");
  });

  it("로그인 필요 원문은 재시도로 풀리지 않는 원인이다(04.3 LOGIN_REQUIRED_MESSAGE)", () => {
    const reason = formReason("추가", LOGIN_REQUIRED_MESSAGE);
    expect(reason.blocked).toBe(true);
    expect(reason.next).toBe("refresh");
    expect(reason.text).not.toContain("다시 시도");
    expect(reason.text.startsWith("추가할 수 없음 — ")).toBe(true);
  });

  it("원문에 이미 「 · 」가 있으면 다시 시도를 덧붙이지 않고 1차는 켜 둔다", () => {
    expect(formReason("추가", "처리 중 오류 · 잠시 후 다시 시도")).toEqual({
      text: "추가할 수 없음 — 처리 중 오류 · 잠시 후 다시 시도",
      next: "retry",
      blocked: false,
    });
  });

  it("표에 없고 「 · 」도 없는 원문은 다시 시도를 덧붙인다", () => {
    expect(formReason("추가", "알 수 없는 실패")).toEqual({
      text: "추가할 수 없음 — 알 수 없는 실패 · 다시 시도",
      next: "retry",
      blocked: false,
    });
  });

  it("클라이언트가 import하므로 import 문이 0개다", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/actions/form-reason.ts"), "utf8");
    expect(source.split("\n").filter((line) => /^import\s/.test(line))).toEqual([]);
  });
});
