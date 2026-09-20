import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

// WR-07(02-REVIEW.md) — 인증 검사를 레이아웃에만 두면 안 된다.
// node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350-1358이 명시한다:
// 레이아웃은 이동할 때 재렌더되지 않고, "레이아웃은 나머지 라우트가 렌더될지를
// 통제하지 않으며", 라우트 세그먼트는 그와 무관하게 RSC 페이로드에 들어간다.
// 따라서 검사는 페이지(또는 DAL)에 있어야 한다.
//
// 이 테스트는 지금 있는 9개 페이지가 아니라 (app) 그룹의 **모든** page.tsx를 훑는다 —
// Phase 4가 이 라우트에 원장 데이터를 올릴 때 새로 만드는 페이지도 자동으로 걸린다.
const APP_GROUP = resolve(process.cwd(), "app/(app)");

function appPages(): string[] {
  return globSync("**/page.tsx", { cwd: APP_GROUP }).sort();
}

// 검사는 두 가지 철자 중 하나면 된다 — 둘은 같은 보호다.
//   (a) requireSession()            — 미인증이면 lib/viewer.ts가 /login으로 보낸다
//   (b) getSession() + redirect("/login") — 같은 분기를 페이지가 직접 쓴 것
// (b)는 세션을 쓰면서 추가 분기(관리자 404 등)를 얹는 페이지가 택한 형태다.
function hasOwnSessionGuard(source: string): boolean {
  if (source.includes("requireSession")) return true;
  return source.includes("getSession") && /redirect\(\s*["'`]\/login["'`]\s*\)/.test(source);
}

describe("WR-07: (app) 그룹의 모든 페이지가 자체 인증 검사를 갖는다", () => {
  it("훑을 페이지를 실제로 찾는다(빈 목록이면 이 테스트가 공허해진다)", () => {
    expect(appPages().length).toBeGreaterThanOrEqual(9);
  });

  it.each(appPages())("%s가 자체 세션 검사를 갖는다", (page) => {
    const source = readFileSync(resolve(APP_GROUP, page), "utf8");
    expect(
      hasOwnSessionGuard(source),
      `${relative(process.cwd(), resolve(APP_GROUP, page))}에 자체 세션 검사가 없다 — ` +
        `requireSession() 또는 getSession() + redirect("/login") 중 하나가 있어야 한다`,
    ).toBe(true);
  });

  it("layout.tsx의 requireSession은 남아 있다 — Shell의 userName·역할 매핑에 필요하다", () => {
    const layout = readFileSync(resolve(APP_GROUP, "layout.tsx"), "utf8");
    expect(layout).toContain("requireSession");
  });
});
