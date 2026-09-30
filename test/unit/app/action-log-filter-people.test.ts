import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonDto } from "@/domain/people";

// 04.4 후속 항목 1: person.value가 꺼진 계급의 사람 DTO에는 id · 이름이 없는데(PERSON_DTO_SPEC) 행동 로그 「사람」 필터가
// 그대로 option을 만들어 key undefined 중복 · 빈 value option이 그려졌다. 행위자 이름은 DETAIL_INFO_ITEM이 따로 가려서
// 행에 이름은 보이는데 고를 id는 없는 계급이 있을 수 있다 — 고를 사람이 0명이면 「사람」 칸째 숨긴다.
let people: Partial<PersonDto>[] = [];

vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer", roleId: "role-x" } }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));
vi.mock("@/domain/permissions/can", () => ({ can: () => Promise.resolve(true) }));
vi.mock("@/domain/action-log", () => ({
  queryActionLog: () => Promise.resolve([]),
  parseActionLogDateBoundary: () => undefined,
}));
vi.mock("@/domain/action-log/record", () => ({ CORE_ACTION_TYPES: [], ACTION_TYPE_LABELS: {} }));
vi.mock("@/domain/people", () => ({ listPeople: () => Promise.resolve(people) }));
vi.mock("@/app/(app)/admin/action-log/actions", () => ({ exportActionLogAction: {}, pruneActionLogAction: {} }));
vi.mock("next-safe-action/hooks", () => ({ useAction: () => ({ execute: () => undefined, isExecuting: false, result: {} }) }));

const { default: ActionLogPage } = await import("@/app/(app)/admin/action-log/page");

async function render(): Promise<string> {
  const tree = await ActionLogPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(createElement("div", null, tree));
}

function emptyValueOptions(html: string): number {
  return (html.match(/<option value=""/g) ?? []).length;
}

describe("행동 로그 「사람」 필터 — id 없는 사람", () => {
  beforeEach(() => {
    people = [];
  });

  it("id · 이름 키가 없는 사람뿐이면 「사람」 칸이 없고 다른 필터 칸은 그대로 있다", async () => {
    // PERSON_DTO_SPEC이 person.value로 가린 키는 투영 결과에 없다.
    people = [{ roleName: "기획 PM" }, { roleName: "기획 PM" }];
    const html = await render();
    expect(html).not.toContain('id="actorId"');
    expect(html).not.toContain(">사람</label>");
    for (const id of ["from", "to", "actionType", "documentId", "includePruned"]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it("id가 있는 사람은 「전체」 하나와 사람 option을 만들고 빈 value option은 「전체」뿐이다", async () => {
    people = [
      { id: "u-1", name: "가나" },
      { id: "u-2", name: "다라" },
    ];
    const html = await render();
    expect(html).toContain('id="actorId"');
    expect(html).toContain(">사람</label>");
    expect(html).toContain('<option value="u-1">가나</option>');
    expect(html).toContain('<option value="u-2">다라</option>');
    const actorSelect = html.match(/<select id="actorId"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(emptyValueOptions(actorSelect)).toBe(1);
  });

  it("둘 중 하나만 id가 있으면 그 사람 option 하나만 생긴다", async () => {
    people = [{ id: "u-1", name: "가나" }, { roleName: "기획 PM" }];
    const html = await render();
    const actorSelect = html.match(/<select id="actorId"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect((actorSelect.match(/<option /g) ?? []).length).toBe(2);
    expect(actorSelect).toContain('<option value="u-1">가나</option>');
  });
});
