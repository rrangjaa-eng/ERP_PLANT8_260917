import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 코드 리뷰(260922-i3k) WR-01·WR-02 회귀 방지 — app/(app)/admin/admin-index.module.css
// 는 SYSTEM.md §6-10이 명시한 두 계약을 지켜야 한다: 그룹 머리글 토큰은 §7-3
// 그룹 머리글 행과 같은 결(`--fs-sm --muted` 600, WR-02), 그룹 머리글과 항목
// 링크는 같은 좌측 기준선에 있어야 한다(§6-10 도해, WR-01) — .main이 이미
// --pad-page를 주므로 .link는 좌우 padding을 갖지 않는다. 컴포넌트 렌더 없이
// 소스 문자열 단언으로 고정한다(admin-table-caption.test.ts와 같은 방식).

function readAdminIndexCss(): string {
  return readFileSync(resolve(process.cwd(), "app", "(app)", "admin", "admin-index.module.css"), "utf8");
}

/** 정확히 `.selector { ... }` 형태의 규칙 본문만 뽑는다 — `.link:hover` 같은
 * 수정자 붙은 규칙은 선택자 뒤에 공백이 아닌 문자(:)가 와서 걸리지 않는다. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.]/g, "\\.");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`규칙을 찾을 수 없다: ${selector}`);
  return match[1] ?? "";
}

describe("app/(app)/admin/admin-index.module.css — §6-10/§7-3 그룹 머리글 토큰 (WR-02)", () => {
  const css = readAdminIndexCss();
  const groupLabel = rule(css, ".groupLabel");

  it("font-size가 --fs-sm이다(§7-3 그룹 머리글 행과 같은 결)", () => {
    expect(groupLabel).toMatch(/font-size:\s*var\(--fs-sm\)/);
  });

  it("color가 --muted다(§7-3 그룹 머리글 행과 같은 결)", () => {
    expect(groupLabel).toMatch(/color:\s*var\(--muted\)/);
  });

  it("font-weight가 600(--fw-medium)이다", () => {
    expect(groupLabel).toMatch(/font-weight:\s*var\(--fw-medium\)/);
  });
});

describe("app/(app)/admin/admin-index.module.css — 그룹 머리글과 항목이 같은 좌측 기준선에 있다 (§6-10 도해, WR-01)", () => {
  const css = readAdminIndexCss();

  it(".link의 좌우 padding이 0이다 — .main이 이미 --pad-page를 주므로 .groupLabel(좌우 0)과 어긋나지 않는다", () => {
    const link = rule(css, ".link");
    expect(link).toMatch(/padding:\s*0;/);
  });
});
