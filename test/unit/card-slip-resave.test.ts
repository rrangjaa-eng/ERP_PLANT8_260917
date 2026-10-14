import { describe, expect, it } from "vitest";
import { resaveLink, slipSnapshot } from "@/app/(app)/cards/slip-resave";

describe("첫 저장 뒤 파일 올리기 실패 — 다시 저장 판정", () => {
  const payload = { amount: 88_000, memo: null };

  it("사용한 사람만 바뀌어도 스냅샷이 달라진다", () => {
    expect(slipSnapshot(payload, "u1")).not.toBe(slipSnapshot(payload, "u2"));
    expect(slipSnapshot(payload, "u1")).toBe(slipSnapshot(payload, "u1"));
  });

  it("견적 외 비용 — 같은 프로젝트면 첫 저장이 만든 줄 id로, 프로젝트를 바꿨으면 그대로 보낸다", () => {
    const saved = { lineId: "line-1", projectId: "p1" };
    const same = { kind: "out_of_quote" as const, projectId: "p1", itemName: "항목" };
    const moved = { kind: "out_of_quote" as const, projectId: "p2", itemName: "항목" };
    expect(resaveLink(same, saved)).toEqual({ kind: "line", lineId: "line-1" });
    expect(resaveLink(moved, saved)).toEqual(moved);
  });

  it("견적 외 비용이 아니면 그대로", () => {
    expect(resaveLink({ kind: "team" }, { lineId: null, projectId: null })).toEqual({ kind: "team" });
    expect(resaveLink(null, { lineId: null, projectId: null })).toBeNull();
  });
});
