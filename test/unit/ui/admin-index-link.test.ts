import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 코드 리뷰(260922-i3k) WR-03 회귀 방지 — /admin 인덱스의 10개 링크는 순수한
// 라우트 이동이다(쿼리 토글이 아니다). 이 저장소의 다른 admin 페이지들
// (people/page.tsx:97, vendors/page.tsx:98,155, corp-cards/page.tsx:133,187)은
// 라우트 이동에 next/link의 <Link>를 쓴다 — 생 <a href>는 전체 문서 로드를
// 일으켜 클릭마다 app/(app)/layout.tsx의 MENUS × can() 재계산을 반복시킨다.

function readAdminIndexPage(): string {
  return readFileSync(resolve(process.cwd(), "app", "(app)", "admin", "page.tsx"), "utf8");
}

describe("app/(app)/admin/page.tsx — 항목 링크는 next/link의 <Link>다 (WR-03)", () => {
  const source = readAdminIndexPage();

  it("next/link의 Link를 import한다", () => {
    expect(source).toMatch(/import\s+Link\s+from\s+"next\/link";/);
  });

  it("항목 링크가 <Link href={item.href} ...>다 — 생 <a href={item.href}이 아니다", () => {
    expect(source).toMatch(/<Link\s+href=\{item\.href\}/);
    expect(source).not.toMatch(/<a\s+href=\{item\.href\}/);
  });
});
