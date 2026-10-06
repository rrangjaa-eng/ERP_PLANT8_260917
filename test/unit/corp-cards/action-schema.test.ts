import { describe, expect, it, vi } from "vitest";
// 액션은 server-only · 세션 · 보관 도메인을 끌고 온다 — 여기서는 도메인에 닿기 전 스키마 거부만 보므로 그 의존은 비운다.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve({ viewer: { kind: "user", userId: "u" }, user: { id: "u" } }),
}));
vi.mock("@/domain/archive", () => ({ archive: () => Promise.resolve(undefined) }));

import { createCorpCardAction, updateCorpCardOwnerAction } from "@/app/(app)/admin/corp-cards/actions";

// 06-30 검토 P3-4 — 액션 계층 표는 domain의 cardOwnerKind를 부른다(사본 없음). 도메인에 닿기 전에 거부되므로 DB 없이 돈다.
const BASE = { issuer: "카드사", numberLast4: "1234", label: "별칭" };
const ID = "card-1";

describe("카드 액션 스키마 — kind enum · 소유 칸 조합 (06-30)", () => {
  it.each<[string, Record<string, unknown>]>([
    ["kind 누락", {}],
    ["미지 kind 값", { kind: "corporate" }],
  ])("소유자 변경: %s → kind 칸 거부", async (_name, extra) => {
    const result = await updateCorpCardOwnerAction({ id: ID, ...extra } as never);
    expect(result?.validationErrors?.kind?._errors?.length).toBeGreaterThan(0);
  });

  it.each<[string, Record<string, unknown>]>([
    ["kind 누락", {}],
    ["미지 kind 값", { kind: "corporate" }],
  ])("등록: %s → kind 칸 거부", async (_name, extra) => {
    const result = await createCorpCardAction({ ...BASE, ...extra } as never);
    expect(result?.validationErrors?.kind?._errors?.length).toBeGreaterThan(0);
  });

  it("소유자 변경 공용 + 소지자 → 도메인 표의 공용 위조 문구", async () => {
    const result = await updateCorpCardOwnerAction({ id: ID, kind: "shared", holderUserId: "u1" });
    expect(result?.validationErrors?.holderUserId?._errors?.[0]).toBe("소유 칸 조합 오류 · 공용에 맞는 칸만");
  });

  it("소유자 변경 개인 + 소지자 없음 → 소유자 변경 폼의 기존 문구", async () => {
    const result = await updateCorpCardOwnerAction({ id: ID, kind: "personal" });
    expect(result?.validationErrors?.holderUserId?._errors?.[0]).toBe("소지자·팀 중 하나 필요 · 하나만 선택");
  });

  it("등록 개인 + 소지자 없음 → 소지자 필요 · 소지자 선택", async () => {
    const result = await createCorpCardAction({ ...BASE, kind: "personal" });
    expect(result?.validationErrors?.holderUserId?._errors?.[0]).toBe("소지자 필요 · 소지자 선택");
  });

  it("등록 팀 + 팀 없음 → 팀 필요 · 팀 선택", async () => {
    const result = await createCorpCardAction({ ...BASE, kind: "team" });
    expect(result?.validationErrors?.holderUserId?._errors?.[0]).toBe("팀 필요 · 팀 선택");
  });
});
