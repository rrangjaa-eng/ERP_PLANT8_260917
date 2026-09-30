import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonDto } from "@/domain/people";

// 행동 로그 「사람」 필터: person.value가 꺼진 계급의 DTO에는 id · 이름 키가 없다(PERSON_DTO_SPEC) — 가린 키는 투영 결과에 없다.
// 행위자 이름은 DETAIL_INFO_ITEM이 따로 가려서, 행에는 이름이 보이는데 고를 사람 id는 없는 계급이 있을 수 있다.
let people: Partial<PersonDto>[] = [];

vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer", roleId: "role-x" } }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
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
  return renderToStaticMarkup(createElement("div", null, await ActionLogPage({ searchParams: Promise.resolve({}) })));
}

describe("행동 로그 「사람」 필터", () => {
  beforeEach(() => {
    people = [];
  });

  it("id · 이름 키가 없는 사람뿐이면 「사람」 칸이 없고 다른 필터 칸은 그대로다", async () => {
    people = [{ roleName: "기획 PM" }, { roleName: "기획 PM" }];
    const html = await render();
    expect(html).not.toContain('id="actorId"');
    expect(html).not.toContain("<label for=\"actorId\">");
    for (const label of ["시작일", "종료일", "행동 종류", "문서 번호", "정리 포함"]) {
      expect(html).toContain(label);
    }
  });

  it("id가 있는 사람은 「전체」 option 하나와 사람 option으로 나오고 빈 value는 「전체」뿐이다", async () => {
    people = [
      { id: "u-1", name: "가나" },
      { id: "u-2", name: "다라" },
    ];
    const html = await render();
    const select = html.match(/<select id="actorId"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(select).toContain('<option value="u-1">가나</option>');
    expect(select).toContain('<option value="u-2">다라</option>');
    expect([...select.matchAll(/<option value=""/g)]).toHaveLength(1);
    expect([...select.matchAll(/<option /g)]).toHaveLength(3);
  });

  it("둘 중 하나만 id가 있으면 그 사람 option 하나만 생긴다", async () => {
    people = [{ roleName: "기획 PM" }, { id: "u-2", name: "다라" }];
    const html = await render();
    const select = html.match(/<select id="actorId"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(select).toContain('<option value="u-2">다라</option>');
    expect([...select.matchAll(/<option /g)]).toHaveLength(2);
  });
});
