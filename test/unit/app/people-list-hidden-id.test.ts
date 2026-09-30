import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonDto } from "@/domain/people";
import listEmptyStyles from "@/ui/list-empty/ListEmpty.module.css";
import peopleStyles from "@/app/(app)/admin/people/people.module.css";

// 04.4 UI-REVIEW W1: person.value가 꺼진 계급의 DTO에는 id·archivedAt 키가 없는데(PERSON_DTO_SPEC) 목록 행 key·「상세」
// 링크·삭제 버튼이 person.id에 기대 key null · /admin/people/undefined · id 없는 삭제 버튼이 그려졌다.
let people: Partial<PersonDto>[] = [];
// 「사람 등록」 표시 조건(DR-6) — admin.people · write만 이 값을 따르고 나머지 권한은 항상 true.
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

function stripTags(markup: string): string {
  return markup.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// thead의 열 머리글 글자와 class를 순서대로.
function headerCells(html: string): { text: string; className: string }[] {
  const thead = html.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
  return [...thead.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)].map((match) => ({
    text: stripTags(match[2] ?? ""),
    className: match[1]?.match(/class="([^"]*)"/)?.[1] ?? "",
  }));
}

// 첫 접힌 줄 칸: 속성과 sr-only 라벨을 뺀 보이는 글자.
function firstFoldedCell(html: string): { attrs: string; visible: string } {
  const row = html.match(/<tr class="[^"]*collapsedRow[^"]*">([\s\S]*?)<\/tr>/)?.[1] ?? "";
  const cell = row.match(/<td\b([^>]*)>([\s\S]*?)<\/td>/);
  return { attrs: cell?.[1] ?? "", visible: stripTags((cell?.[2] ?? "").replace(/<span class="sr-only">[\s\S]*?<\/span>/g, "")) };
}

// DR-4 사용자 결정 2026-09-30: 사람 · 계급 · 팀 정보가 모두 꺼진 계급(새 계급 기본값)은 DTO 키가 하나도 없다.
describe("사람 목록 — 보이는 열이 없다(전부 가림)", () => {
  beforeEach(() => {
    people = [{}, {}];
    writeAllowed = false;
  });

  it("표 없이 잠김 한 줄 하나만 그리고 링크 · 버튼 · 「등록된 사람이 없습니다」가 없다", async () => {
    const { html } = await render();
    expect(html).not.toContain("<table");
    const lines = [...html.matchAll(/<p class="([^"]*)">([\s\S]*?)<\/p>/g)];
    expect(lines).toHaveLength(1);
    const [, className, inner] = lines[0] ?? [];
    expect(className).toContain(listEmptyStyles.row);
    expect(className).toContain(listEmptyStyles.empty);
    expect(stripTags(inner ?? "")).toBe("정보 노출표 · 사람 정보 잠김");
    expect(inner).not.toContain("<a");
    expect(inner).not.toContain("<button");
    expect(html).not.toContain("등록된 사람이 없습니다");
  });
});

describe("사람 목록 — 이름 · 이메일이 가려진 계급(계급 · 팀만 보임)", () => {
  beforeEach(() => {
    people = hiddenIdPeople;
    writeAllowed = false;
  });

  it("열 머리글은 「계급」 「현재 소속」 둘뿐이고 계급이 P1이다", async () => {
    const { html } = await render();
    const headers = headerCells(html);
    expect(headers.map((header) => header.text)).toEqual(["계급", "현재 소속"]);
    expect(headers[0]?.className).not.toContain(peopleStyles.prioP2);
    expect(headers[1]?.className).toContain(peopleStyles.prioP2);
  });

  it("첫 보이는 칸(계급)이 행 머리글이고 접힌 줄은 colspan 2이며 「·」로 시작하지 않는다", async () => {
    const { html } = await render();
    expect(html).toMatch(/<th scope="row" id="people-row-0-name">기획 PM<\/th>/);
    expect(html).toMatch(/<th scope="row" id="people-row-1-name">기획 PM<\/th>/);
    expect(html).not.toContain("이름");
    expect(html).not.toContain("이메일");
    const folded = firstFoldedCell(html);
    expect(folded.attrs).toContain('colSpan="2"');
    expect(folded.attrs).toContain('headers="people-row-0-name"');
    expect(folded.visible).toBe("—");
  });
});

describe("사람 목록 — 팀만 가려진 계급(사람 · 계급 보임)", () => {
  it("머리글 5개 · colspan 5 · 접힌 줄이 「 · 」로 끝나지 않는다", async () => {
    people = [
      { id: "u-1", name: "가나", email: "a@x.kr", roleId: "role-pm", roleName: "기획 PM", archivedAt: null, firstLoginAt: new Date(), passwordIsTemporary: false },
    ];
    const { html } = await render();
    expect(headerCells(html).map((header) => header.text)).toEqual(["이름", "이메일", "계급", "상태", "동작"]);
    const folded = firstFoldedCell(html);
    expect(folded.attrs).toContain('colSpan="5"');
    expect(folded.visible).toBe("a@x.kr · 기획 PM");
  });
});

describe("사람 목록 — 모두 보이는 계급(회귀)", () => {
  it("6열 · 이름 행 머리글 · colspan 6 · 접힌 줄 「이메일 · 계급 · 소속」", async () => {
    people = visibleIdPeople;
    const { html } = await render();
    expect(headerCells(html).map((header) => header.text)).toEqual(["이름", "이메일", "계급", "현재 소속", "상태", "동작"]);
    expect(html).toMatch(/<th scope="row" id="people-row-0-name">가나<\/th>/);
    const folded = firstFoldedCell(html);
    expect(folded.attrs).toContain('colSpan="6"');
    expect(folded.visible).toBe("a@x.kr · 기획 PM · —");
    expect(html).toContain('<span class="sr-only">이메일 </span>');
  });
});

describe("사람 목록 — 「사람 등록」은 admin.people 쓰기 권한이 있을 때만 (DR-6)", () => {
  beforeEach(() => {
    people = visibleIdPeople;
  });

  it("쓰기 권한이 없으면 링크도 ?new=1 폼도 없다", async () => {
    writeAllowed = false;
    expect((await render()).html).not.toContain("/admin/people?new=1");
    expect((await render({ new: "1" })).html).not.toContain("data-person-form");
  });

  it("쓰기 권한이 있으면 링크가 있고 ?new=1에서 폼이 그려진다", async () => {
    writeAllowed = true;
    expect((await render()).html).toContain('href="/admin/people?new=1#person-form"');
    expect((await render({ new: "1" })).html).toContain("data-person-form");
  });
});
