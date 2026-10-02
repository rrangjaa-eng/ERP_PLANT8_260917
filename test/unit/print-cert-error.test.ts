import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.3-11 — 인쇄 라우트의 서버 렌더 실패 오류 경계(codex r2 C8). 셸 밖 라우트라 app/(app)/error.tsx가 닿지
// 않는다. 이 저장소에는 컴포넌트 렌더 테스트 환경이 없어 소스를 읽어 단언한다(admin-index-css.test.ts 선례).
// 문구: 오류 문장은 사용자 결정 A(2026-09-29 · 04.3-07 문구 대응표) — 명사형 「원인 · 다음 행동」.

const ERROR_FILE = resolve(process.cwd(), "app", "print", "certs", "[id]", "error.tsx");
const NOT_READY = "인쇄물이 아직 준비되지 않았습니다 · 화면이 다 뜬 뒤 다시 인쇄해 주세요";

function source(): string {
  return readFileSync(ERROR_FILE, "utf8");
}

describe("인쇄 라우트 오류 경계 error.tsx", () => {
  it("파일이 있고 첫 문장이 use client다", () => {
    expect(existsSync(ERROR_FILE)).toBe(true);
    expect(source().trimStart().startsWith('"use client"')).toBe(true);
  });

  it("실패 줄과 2차 「다시 시도」가 있고 그 버튼이 retry를 부른다", () => {
    const text = source();
    expect(text).toContain("인쇄물 만들기 실패");
    expect(text).toMatch(/<Button[^>]*variant="secondary"[^>]*onClick=\{retry\}[^>]*>\s*다시 시도\s*<\/Button>/);
  });

  it("인쇄 미디어 한 줄(준비 전)이 있다", () => {
    expect(source()).toContain(NOT_READY);
  });

  it("data-ready가 없다 — 오류 상태에서 본문이 인쇄되지 않는다", () => {
    expect(source()).not.toContain("data-ready");
  });

  it("예외 내용을 화면에 싣지 않는다(T-02-18)", () => {
    expect(source()).not.toMatch(/error\.(message|stack|digest)/);
  });
});
