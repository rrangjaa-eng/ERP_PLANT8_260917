import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";

// PR #368 리뷰 P2-1 ⑤: `leave.value`를 숨긴 계급은 사람별 연차 잔여 DTO에 숫자 칸 키가 없다(leak-scan이 투영을 고정) —
// 화면은 그 빈 칸을 `—`로 그린다(이름 · 팀은 그대로). 숫자 글자(`n일`)는 0.
vi.mock("@/lib/viewer", () => ({ requireSession: () => Promise.resolve({ viewer: { id: "viewer" } }) }));
vi.mock("@/domain/permissions/can", () => ({ can: () => Promise.resolve(true) }));
vi.mock("next/navigation", () => ({ notFound: () => undefined, useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/domain/leave/access", () => ({ peopleLeaveScopeOf: () => Promise.resolve({ kind: "company" }) }));
vi.mock("@/domain/leave", () => ({
  listMyLeave: () => Promise.resolve([]),
  myLeaveYearRange: () => Promise.resolve(null),
}));
vi.mock("@/domain/leave/balance-service", () => ({
  getMyLeaveBalance: () => Promise.resolve({}),
  listPeopleLeaveBalances: () => Promise.resolve({ rows: [{ userId: "u1", name: "가숨김", resigned: false, teamName: "기획1팀" }], count: 1 }),
}));

const { default: LeaveListPage } = await import("@/app/(app)/leave/(list)/page");

describe("/leave?view=all — leave.value 숨김", () => {
  it("숫자 칸 다섯(부여 · 사용 · 결재 중 · 남음 · 월차 남음)이 `—` · `n일` 글자 0", async () => {
    // 「전체」 본문은 async 서버 컴포넌트라 정적 렌더(renderToStaticMarkup)가 못 기다린다 — prerender가 끝까지 푼다.
    const { prelude } = await prerender(await LeaveListPage({ searchParams: Promise.resolve({ view: "all" }) }));
    const html = await new Response(prelude).text();
    const row = html.slice(html.indexOf("가숨김"));
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((match) => match[1]?.replace(/<[^>]+>/g, "") ?? "");
    expect(cells.slice(0, 1).join("")).toContain("기획1팀");
    expect(cells.slice(1, 6)).toEqual(["—", "—", "—", "—", "—"]);
    expect(html).not.toMatch(/\d+(\.\d+)?일/);
  });

  it("숫자 칸 다섯은 Num 칸(span.num) 안에 그려진다 (SYSTEM 숫자 열은 Num만)", async () => {
    const { prelude } = await prerender(await LeaveListPage({ searchParams: Promise.resolve({ view: "all" }) }));
    const html = await new Response(prelude).text();
    const row = html.slice(html.indexOf("가숨김"));
    const raw = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((match) => match[1] ?? "");
    for (const cell of raw.slice(1, 6)) expect(cell).toMatch(/^<span class="[^"]*num[^"]*">—<\/span>$/);
  });
});
