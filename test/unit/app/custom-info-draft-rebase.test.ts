import { describe, expect, it } from "vitest";
import { rebaseCustomInfoDraft } from "@/app/(app)/projects/[id]/custom-info-fields";
import type { ProjectFieldDefinitionDto } from "@/domain/projects";

// 07.5-02 리뷰 S1 — 다시 그림이 새 version을 내려보내면 추가 칸 초안은 기본 4칸(Codex P1 · PR #378)과 같이
// 옛 기준값과 다른 칸만 남긴다. 건드렸다 되돌린 칸(초안 = 옛 값)이 남으면 새 기준값과 달라져 동료 저장을 조용히 덮는다.

function def(key: string, type: ProjectFieldDefinitionDto["type"] = "text"): ProjectFieldDefinitionDto {
  return { id: `id-${key}`, key, label: key, type, options: null, required: false, sortOrder: 1 };
}

const defs = [def("venue"), def("memo"), def("eventDate", "date")];

describe("rebaseCustomInfoDraft", () => {
  it("drops a touched-then-reverted field (draft equals the old base)", () => {
    const oldBase = { venue: "코엑스", memo: "A" };
    expect(rebaseCustomInfoDraft(defs, oldBase, { venue: "코엑스" })).toEqual({});
  });

  it("keeps a field the user genuinely changed from the old base", () => {
    const oldBase = { venue: "코엑스", memo: "A" };
    expect(rebaseCustomInfoDraft(defs, oldBase, { venue: "코엑스", memo: "B" })).toEqual({ memo: "B" });
  });

  it("compares dates as input text (stored timestamp vs YYYY-MM-DD draft)", () => {
    const oldBase = { eventDate: "2026-11-20T00:00:00.000Z" };
    expect(rebaseCustomInfoDraft(defs, oldBase, { eventDate: "2026-11-20" })).toEqual({});
    expect(rebaseCustomInfoDraft(defs, oldBase, { eventDate: "2026-11-21" })).toEqual({ eventDate: "2026-11-21" });
  });
});
