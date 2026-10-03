import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.3-11 독립 DOM 감사 반영 — 인쇄 라우트 CSS · 오류 줄의 소스 단언(이 저장소에는 컴포넌트 렌더 환경이 없다).

const DIR = resolve(process.cwd(), "app", "print", "certs", "[id]");
const css = readFileSync(resolve(DIR, "print-cert.module.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.]/g, "\\.");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`규칙을 찾을 수 없다: ${selector}`);
  return match[1] ?? "";
}

describe("인쇄 라우트 LOADING 진행 바 지연 표시(L1 — SYSTEM §7-7 300ms)", () => {
  it(".progress는 처음 보이지 않고 300ms 뒤 한 번만 나타난다", () => {
    const progress = rule(".progress");
    expect(progress).toMatch(/opacity:\s*0\b/);
    expect(progress).toMatch(/animation-delay:\s*300ms/);
  });
});

describe("숫자 nowrap(L4 — SYSTEM §2-4)", () => {
  it(".num은 tabular-nums와 white-space: nowrap이다", () => {
    const num = rule(".num");
    expect(num).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(num).toMatch(/white-space:\s*nowrap/);
  });
});

describe("ERROR 두 화면은 기존 실패 줄이 제목 요소다(L2 — 새 글자 없음)", () => {
  it.each(["error.tsx", "print-sheet.tsx"])("%s의 실패 줄은 h1 안에 있다", (file) => {
    const source = readFileSync(resolve(DIR, file), "utf8");
    expect(source).toMatch(/<h1[^>]*>\s*인쇄물 만들기 실패 ·\s*<\/h1>/);
  });
});

describe("인쇄 라우트 404 변종(L3 — UI-SPEC 296 「§6-9 404 문구를 인쇄 라우트 바탕에」)", () => {
  it("app/print/certs/not-found.tsx가 인쇄 라우트 바탕 main 위에 404 문구를 세운다", () => {
    const source = readFileSync(resolve(DIR, "..", "not-found.tsx"), "utf8");
    expect(source).toContain("페이지 찾을 수 없음");
    expect(source).toMatch(/<main className=\{styles\.root\}>/);
  });

  it("문서 제목은 성공 화면(인쇄 시트)만 정한다 — page.tsx가 제목을 내보내지 않는다", () => {
    const page = readFileSync(resolve(DIR, "page.tsx"), "utf8");
    expect(page).not.toMatch(/export const metadata|generateMetadata/);
    // 제목은 서버 메타데이터가 낸다(c81f4877 — 클라이언트 document.title은 하이드레이션이 덮어써 간헐로 졌다). 성공 화면(printable === true)만 정한다.
    const layout = readFileSync(resolve(DIR, "layout.tsx"), "utf8");
    expect(layout).toMatch(/\(await judgePrintable\(id\)\) === true \? \{ title: "확인증 인쇄" \} : \{\}/);
  });
});
