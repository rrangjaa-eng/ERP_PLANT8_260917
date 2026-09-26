import { describe, expect, it } from "vitest";
import { unsavedEditsReason } from "@/app/(app)/projects/[id]/unsaved-edits";

// 04-21(DR-6 · B-03 · ENG-D9) — 미저장 편집 막힘 문구 한 함수. 상태 전환 트리거와 그룹 B의
// 새 차수·고객 승인 모달이 같은 글자를 쓴다(UI-SPEC rev 5 Copywriting 「막힘 — 미저장 편집」).
describe("unsavedEditsReason", () => {
  it("편집이 없으면 null", () => {
    expect(unsavedEditsReason(0)).toBeNull();
  });

  it.each([
    [1, "저장 안 한 편집 1칸 · 먼저 일괄 저장"],
    [3, "저장 안 한 편집 3칸 · 먼저 일괄 저장"],
  ])("%i칸이면 %s", (count, expected) => {
    expect(unsavedEditsReason(count)).toBe(expected);
  });
});
