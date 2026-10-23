import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 07-21(U16 · UI-SPEC SC-09 · SC-13): 계급 · 조직 라우트의 LOADING · ERROR 경계. 화면 데이터 로더를 실패시키는 시험 전용 경로가 없어
// (projects error E2E도 없음) 소스를 읽어 단언한다(print-cert-error.test.ts 선례).

const ROOT = resolve(process.cwd(), "app", "(app)", "admin", "people");

describe.each(["roles", "org"])("%s 라우트 경계", (route) => {
  const errorFile = resolve(ROOT, route, "error.tsx");
  const loadingFile = resolve(ROOT, route, "loading.tsx");

  it("error.tsx — use client · 실패 줄 · `다시 시도`가 retry를 부른다 · 예외 내용을 싣지 않는다", () => {
    expect(existsSync(errorFile)).toBe(true);
    const text = readFileSync(errorFile, "utf8");
    expect(text.trimStart().startsWith('"use client"')).toBe(true);
    expect(text).toContain('message="불러오지 못했습니다 · 다시 시도"');
    expect(text).toContain('action={{ label: "다시 시도", onClick: retry }}');
    expect(text).toContain('tone="error"');
    expect(text).not.toMatch(/error\.(message|stack|digest)/);
  });

  // 계급 · 조직 화면은 loading.tsx를 두지 않는다 — 스트리밍 경계가 생기면 첫 렌더(JS 끔)가 뼈대뿐이라 D-1 계약(w5-review-fixes ·
  // mobile-w5-review-fixes: PC 입력 · 폰 읽기 글자가 첫 렌더부터)이 깨지고, 본문이 load 뒤에도 숨은 Suspense 틀에 잠시 남아
  // 첫 렌더를 바로 재는 폰 조직 시험(mobile-org 「이름 입력 폭」)이 흔들린다(07-21 t2-e2e-3).
  it("loading.tsx 없음(D-1 첫 렌더)", () => {
    expect(existsSync(loadingFile)).toBe(false);
  });
});
