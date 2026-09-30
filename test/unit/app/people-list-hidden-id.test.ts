import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonDto } from "@/domain/people";
import peopleStyles from "../../../app/(app)/admin/people/people.module.css";
import listEmptyStyles from "../../../ui/list-empty/ListEmpty.module.css";

// 04.4 UI-REVIEW W1: person.value가 꺼진 계급의 DTO에는 id·archivedAt 키가 없는데(PERSON_DTO_SPEC) 목록 행 key·「상세」
// 링크·삭제 버튼이 person.id에 기대 key null · /admin/people/undefined · id 없는 삭제 버튼이 그려졌다.
let people: Partial<PersonDto>[] = [];
// DR-6: 사람 등록 쓰기 권한 — admin.people · write일 때만 이 값을, 나머지 판정은 늘 true.
let writeAllowed = true;

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
vi.mock("@/domain/permissions/can", () => ({
  can: (_viewer: unknown, menu: string, action: string) =>
    Promise.resolve(menu === "admin.people" && action === "write" ? writeAllowed : true),
}));
vi.mock("@/domain/people", () => ({ listPeople: () => Promise.resolve(people) }));
vi.mock("@/domain/permissions/roles", () => ({ listRoles: () => Promise.resolve([{ id: "role-pm", name: "기획 PM" }]) }));
vi.mock("@/domain/org", () => ({ listOrgUnits: () => Promise.resolve([]), listTeams: () => Promise.resolve([]) }));
vi.mock("@/app/(app)/admin/people/person-form", async () => {
  const { createElement: h } = await import("react");
  return {
    PersonForm: () => h("form", { "data-person-form": "" }),
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

async function render(searchParams: { new?: string } = {}) {
  const tree = await PeoplePage({ searchParams: Promise.resolve(searchParams) });
  const tbody = findTbody(tree);
  if (!tbody) throw new Error("tbody 없음");
  const rowElements = Array.isArray(tbody.props.children) ? (tbody.props.children as ReactElement[]) : [];
  return { keys: rowElements.map((row) => row.key), html: renderToStaticMarkup(createElement("div", null, tree)) };
}

// 보이는 열 판정은 투영된 DTO 키 유무(PERSON_DTO_SPEC이 가린 키는 투영 결과에 없다).
const roleAndTeamVisiblePeople: Partial<PersonDto>[] = [
  { roleName: "기획 PM", currentTeamId: null, currentTeamName: null },
  { roleName: "기획 PM", currentTeamId: null, currentTeamName: null },
];
// person.value는 보이고 team.value만 가려진 DTO — currentTeam* 키가 없다.
const teamHiddenPeople: Partial<PersonDto>[] = [
  { id: "u-1", name: "가나", email: "a@x.kr", roleId: "role-pm", roleName: "기획 PM", archivedAt: null, firstLoginAt: new Date(), passwordIsTemporary: false },
  { id: "u-2", name: "다라", email: "b@x.kr", roleId: "role-pm", roleName: "기획 PM", archivedAt: null, firstLoginAt: new Date(), passwordIsTemporary: false },
];
// 사람 · 계급 · 팀 정보가 모두 꺼진 계급(새 계급 기본값) — 투영 결과가 빈 객체다.
const allHiddenPeople: Partial<PersonDto>[] = [{}, {}];

function headerLabels(html: string): string[] {
  const thead = html.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
  return [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => (match[1] ?? "").replace(/<[^>]+>/g, "").trim());
}

function headerClass(html: string, label: string): string {
  const thead = html.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
  const th = [...thead.matchAll(/<th([^>]*)>([\s\S]*?)<\/th>/g)].find((match) => (match[2] ?? "").replace(/<[^>]+>/g, "").trim() === label);
  return th?.[1]?.match(/class="([^"]*)"/)?.[1] ?? "";
}

function collapsedCells(html: string): { colSpan: string | undefined; headers: string | undefined; text: string }[] {
  return [...html.matchAll(/<tr class="[^"]*collapsedRow[^"]*">\s*<td([^>]*)>([\s\S]*?)<\/td>/g)].map((match) => ({
    colSpan: (match[1] ?? "").match(/colSpan="(\d+)"/i)?.[1],
    headers: (match[1] ?? "").match(/headers="([^"]*)"/)?.[1],
    text: (match[2] ?? "")
      .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  }));
}

describe("사람 목록 — 정보가 전부 가려진 계급 (DR-4, 사용자 결정 2026-09-30)", () => {
  beforeEach(() => {
    people = allHiddenPeople;
    writeAllowed = true;
  });

  it("표 없이 ListEmpty 잠김 한 줄만 그리고, 그 줄에 링크·버튼이 없으며 「등록된 사람이 없습니다」가 없다", async () => {
    const { html } = await render();
    expect(html).not.toContain("<table");
    const lines = [...html.matchAll(/<p class="([^"]*)">([\s\S]*?)<\/p>/g)].filter((match) => (match[1] ?? "").includes(String(listEmptyStyles.row)));
    const [line] = lines;
    const lineClass = line?.[1] ?? "";
    const lineBody = line?.[2] ?? "";
    expect(lines).toHaveLength(1);
    expect(lineClass).toContain(listEmptyStyles.empty);
    expect(lineBody.replace(/<[^>]+>/g, "")).toBe("정보 노출표 · 사람 정보 잠김");
    expect(lineBody).not.toContain("<a");
    expect(lineBody).not.toContain("<button");
    expect(html).not.toContain("등록된 사람이 없습니다");
  });
});

describe("사람 목록 — 이름·이메일·상태·동작이 가려진 계급 (DR-4)", () => {
  beforeEach(() => {
    people = roleAndTeamVisiblePeople;
    writeAllowed = true;
  });

  it("열 머리글은 계급·현재 소속뿐이고 계급이 행 머리글(P1)이다", async () => {
    const { html } = await render();
    expect(headerLabels(html)).toEqual(["계급", "현재 소속"]);
    expect(headerClass(html, "계급")).not.toContain(peopleStyles.prioP2);
    expect(headerClass(html, "현재 소속")).toContain(peopleStyles.prioP2);
    expect(html).toMatch(/<th scope="row" id="people-row-0-name">기획 PM<\/th>/);
    expect(html).toMatch(/<th scope="row" id="people-row-1-name">기획 PM<\/th>/);
  });

  it("접힌 줄은 colspan=2 · 행 머리글을 가리키고 「·」로 시작하지 않는다", async () => {
    const { html } = await render();
    const cells = collapsedCells(html);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toEqual({ colSpan: "2", headers: "people-row-0-name", text: "—" });
  });
});

describe("사람 목록 — 팀 정보만 가려진 계급 (DR-5)", () => {
  beforeEach(() => {
    people = teamHiddenPeople;
    writeAllowed = true;
  });

  it("머리글에 현재 소속이 없고 접힌 줄은 「 · 」로 끝나지 않는다", async () => {
    const { html } = await render();
    expect(headerLabels(html)).toEqual(["이름", "이메일", "계급", "상태", "동작"]);
    const cells = collapsedCells(html);
    expect(cells[0]).toEqual({ colSpan: "5", headers: "people-row-0-name", text: "a@x.kr · 기획 PM" });
  });
});

describe("사람 목록 — 모두 보이는 계급 회귀 (DR-4)", () => {
  beforeEach(() => {
    people = visibleIdPeople;
    writeAllowed = true;
  });

  it("6열 · 이름 행 머리글 · 접힌 줄 colspan=6 · 접힌 줄 글자는 전과 같다", async () => {
    const { html } = await render();
    expect(headerLabels(html)).toEqual(["이름", "이메일", "계급", "현재 소속", "상태", "동작"]);
    expect(html).toMatch(/<th scope="row" id="people-row-0-name">가나<\/th>/);
    const cells = collapsedCells(html);
    expect(cells[0]).toEqual({ colSpan: "6", headers: "people-row-0-name", text: "a@x.kr · 기획 PM · —" });
    expect(html).toContain('<span class="sr-only">이메일 </span>');
    expect(html).toContain('<span class="sr-only">현재 소속 </span>');
  });
});

describe("사람 목록 — 「사람 등록」 쓰기 권한 (DR-6)", () => {
  beforeEach(() => {
    people = visibleIdPeople;
  });

  it("쓰기 권한이 없으면 목록 머리글 링크가 없고 ?new=1이어도 등록 폼이 없다", async () => {
    writeAllowed = false;
    const list = await render();
    expect(list.html).not.toContain('href="/admin/people?new=1#person-form"');
    const withParam = await render({ new: "1" });
    expect(withParam.html).not.toContain("data-person-form");
  });

  it("쓰기 권한이 있으면 링크가 있고 ?new=1에서 등록 폼이 있다", async () => {
    writeAllowed = true;
    const list = await render();
    expect(list.html).toContain('href="/admin/people?new=1#person-form"');
    const withParam = await render({ new: "1" });
    expect(withParam.html).toContain("data-person-form");
  });
});

describe("사람 목록 — person.id가 없는 행", () => {
  beforeEach(() => {
    people = [];
    writeAllowed = true;
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
