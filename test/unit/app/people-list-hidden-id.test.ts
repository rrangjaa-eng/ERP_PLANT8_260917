import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonDto } from "@/domain/people";

// 04.4 UI-REVIEW W1: person.value가 꺼진 계급의 DTO에는 id·archivedAt 키가 없는데(PERSON_DTO_SPEC) 목록 행 key·「상세」
// 링크·삭제 버튼이 person.id에 기대 key null · /admin/people/undefined · id 없는 삭제 버튼이 그려졌다.
let people: Partial<PersonDto>[] = [];

vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer", roleId: "role-x" } }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
  useRouter: () => ({ push: () => undefined }),
}));
vi.mock("@/domain/permissions/can", () => ({ can: () => Promise.resolve(true) }));
vi.mock("@/domain/people", () => ({ listPeople: () => Promise.resolve(people) }));
vi.mock("@/domain/permissions/roles", () => ({ listRoles: () => Promise.resolve([{ id: "role-pm", name: "기획 PM" }]) }));
vi.mock("@/domain/org", () => ({ listOrgUnits: () => Promise.resolve([]), listTeams: () => Promise.resolve([]) }));
vi.mock("@/app/(app)/admin/people/person-form", async () => {
  const { createElement: h } = await import("react");
  return {
    PersonForm: () => null,
    PersonDeleteButton: ({ userId }: { userId: string }) =>
      h("button", { type: "button", "data-user-id": String(userId) }, "삭제"),
  };
});

const { default: PeoplePage } = await import("@/app/(app)/admin/people/page");

// PERSON_DTO_SPEC이 person.value로 가린 키는 투영 결과에 없다(test/integration/people-login-status.test.ts:64가 DB로 증명).
const hiddenIdPeople: Partial<PersonDto>[] = [
  { roleName: "기획 PM", currentTeamId: null, currentTeamName: null },
  { roleName: "기획 PM", currentTeamId: null, currentTeamName: null },
];
const visibleIdPeople: Partial<PersonDto>[] = [
  { id: "u-1", name: "가나", email: "a@x.kr", roleId: "role-pm", roleName: "기획 PM", archivedAt: null, currentTeamId: null, currentTeamName: null, firstLoginAt: new Date(), passwordIsTemporary: false },
  { id: "u-2", name: "다라", email: "b@x.kr", roleId: "role-pm", roleName: "기획 PM", archivedAt: null, currentTeamId: null, currentTeamName: null, firstLoginAt: new Date(), passwordIsTemporary: false },
];

function findTbody(node: ReactNode): ReactElement<{ children?: ReactNode }> | null {
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === "tbody") return element;
  for (const child of Children.toArray(element.props.children)) {
    const found = findTbody(child);
    if (found) return found;
  }
  return null;
}

async function render() {
  const tree = await PeoplePage({ searchParams: Promise.resolve({}) });
  const tbody = findTbody(tree);
  if (!tbody) throw new Error("tbody 없음");
  const rowElements = Array.isArray(tbody.props.children) ? (tbody.props.children as ReactElement[]) : [];
  return { keys: rowElements.map((row) => row.key), html: renderToStaticMarkup(createElement("div", null, tree)) };
}

describe("사람 목록 — person.id가 없는 행", () => {
  beforeEach(() => {
    people = [];
  });

  it("id 키가 없으면 행 key는 정의되고 서로 다르며 상세 링크·삭제 버튼을 그리지 않는다", async () => {
    people = hiddenIdPeople;
    const { keys, html } = await render();
    expect(keys).toHaveLength(2);
    expect(keys.every((key) => key !== null)).toBe(true);
    expect(new Set(keys).size).toBe(2);
    expect(html).not.toContain("/admin/people/undefined");
    expect(html.match(/<tbody[\s\S]*<\/tbody>/)?.[0]).not.toMatch(/href="\/admin\/people\//);
    expect(html).not.toContain("data-user-id");
    expect(html).toContain('id="people-row-0-name"');
    expect(html).toContain('id="people-row-1-name"');
    expect(html).toContain('headers="people-row-0-name"');
  });

  it("id가 있으면 key는 id이고 상세 링크·삭제 버튼은 그 id를 싣는다", async () => {
    people = visibleIdPeople;
    const { keys, html } = await render();
    expect(keys).toEqual(["u-1", "u-2"]);
    expect(html).toContain('href="/admin/people/u-1"');
    expect(html).toContain('href="/admin/people/u-2"');
    expect(html).toContain('data-user-id="u-1"');
    expect(html).toContain('data-user-id="u-2"');
  });
});
