import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 이 파일의 존재 이유: 두 워크플로(ci.yml · deploy.yml)의 경로 필터가 docs/**를
// 제외한다(02-02가 정확한 필터 형태를 확정한다). docs/design/SYSTEM.md만 바뀐
// 커밋은 그 필터에 걸려 CI가 돌지 않는다 — 이 테스트 파일이 같은 커밋에 포함되어
// 이 변경 묶음이 "docs 전용"이 아니게 만든다. 그래서 디자인 문서의 계약은 이
// 테스트와 함께 커밋되어야 실제로 검사된다.

function readDesignDoc(name: string): string {
  return readFileSync(resolve(process.cwd(), "docs", "design", name), "utf8");
}

const SYSTEM = readDesignDoc("SYSTEM.md");
const TOKENS = readDesignDoc("tokens.css");
const DECISIONS = readDesignDoc("DECISIONS.md");

function section(doc: string, startHeading: string, endHeading: string): string {
  const start = doc.indexOf(startHeading);
  const end = doc.indexOf(endHeading);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`구간을 찾을 수 없다: '${startHeading}' ~ '${endHeading}'`);
  }
  return doc.slice(start, end);
}

const FIVE_STATES = ["LOADING", "EMPTY", "ERROR", "SUCCESS", "PARTIAL"];

describe("docs/design/SYSTEM.md — 신설 절 5개 (§6-7·§6-8·§6-9·§7-11·§7-12)", () => {
  it.each(["### 6-7", "### 6-8", "### 6-9", "### 7-11", "### 7-12", "### 7-13", "### 7-14"])(
    "머리글 '%s'를 포함한다",
    (heading) => {
      expect(SYSTEM).toContain(heading);
    },
  );

  it.each(["시스템 상태", "세션 만료", "권한 없음", "배너", "알림함", "체크박스", "중간 상태"])(
    "핵심 계약 낱말 '%s'를 포함한다",
    (word) => {
      expect(SYSTEM).toContain(word);
    },
  );

  const sectionBounds: Array<[string, string, string]> = [
    ["6-7 로그인 화면", "### 6-7", "### 6-8"],
    ["6-8 시스템 상태 화면", "### 6-8", "### 6-9"],
    ["6-9 오류 페이지", "### 6-9", "## 7. 컴포넌트 규칙"],
    ["7-11 배너", "### 7-11", "### 7-12"],
    ["7-12 알림함·배지", "### 7-12", "### 7-13"],
    ["7-13 체크박스 매트릭스", "### 7-13", "### 7-14"],
    ["7-14 이력 목록", "### 7-14", "## 8. 카피 규칙"],
  ];

  it.each(sectionBounds)("'%s' 절이 다섯 상태를 전부 명시한다", (_name, start, end) => {
    const sec = section(SYSTEM, start, end);
    for (const state of FIVE_STATES) {
      expect(sec).toContain(state);
    }
  });
});

describe("docs/design/SYSTEM.md — §6-0 보강 (구간 단위 검증)", () => {
  const shell = section(SYSTEM, "### 6-0", "### 6-1");

  it("로그아웃 진입점이 「더보기」 시트 말고도 있다(2회 이상)", () => {
    expect((shell.match(/로그아웃/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("내 정보·내 계정 언급 합이 2회 이상이다", () => {
    const myInfo = (shell.match(/내 정보/g) ?? []).length;
    const myAccount = (shell.match(/내 계정/g) ?? []).length;
    expect(myInfo + myAccount).toBeGreaterThanOrEqual(2);
  });

  it("소속 표기 문장이 있다", () => {
    expect(shell).toContain("소속");
  });

  it("관리자용 시스템 상태 진입점 문장이 있다", () => {
    expect(shell).toContain("시스템 상태");
  });

  it.each(["대표", "본부 책임자", "팀장", "기획 PM", "시스템 관리자"])(
    "폰 하단 탭 역할 표에 계급 '%s' 행이 있다",
    (role) => {
      expect(shell).toContain(role);
    },
  );

  it("폰 하단 탭 역할 표가 계급 5종 각각 탭 4개(계급 열 포함 5칸 이상)를 담는다", () => {
    const lines = shell
      .split("\n")
      .filter((l) => l.trim().startsWith("|") && !l.includes("---") && l.includes("더보기"));
    expect(lines.length).toBe(5);
    for (const line of lines) {
      const cells = line.split("|").filter((c) => c.trim() !== "");
      // | 계급 | 탭1 | 탭2 | 탭3 | 탭4 | = 5칸
      expect(cells.length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("docs/design/SYSTEM.md — §7-7 두 번째 표 신설 6행", () => {
  const table = section(SYSTEM, "**컴포넌트별로 사용자가 보는 것**", "### 7-8");

  it.each(["버튼", "시트", "공통 셸", "토스트", "상태 태그", "배너"])(
    "행 '%s'가 있고 다섯 칸을 모두 채운다",
    (rowLabel) => {
      const lines = table
        .split("\n")
        .filter((l) => l.trim().startsWith("|") && !l.includes("---") && l.includes(rowLabel));
      expect(lines.length).toBeGreaterThan(0);
      const cells = (lines[0] ?? "").split("|").filter((c) => c.trim() !== "");
      // | 컴포넌트 | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL | = 6칸
      expect(cells.length).toBeGreaterThanOrEqual(6);
    },
  );
});

describe("docs/design/tokens.css — SYSTEM.md가 참조하는 커스텀 속성이 전부 실재한다", () => {
  it("참조된 토큰 중 tokens.css에 정의되지 않은 것이 없다", () => {
    const defined = new Set(
      Array.from(TOKENS.matchAll(/--[a-z][a-z0-9-]*(?=\s*:)/gi)).map((m) => m[0]),
    );
    const referenced = new Set(
      Array.from(SYSTEM.matchAll(/--[a-z][a-z0-9-]*/gi))
        .map((m) => m[0])
        // `--g-*` · `--seg-*` 같은 와일드카드 표기는 뒤가 하이픈으로 끝나 실제
        // 프로퍼티 이름이 아니다 — 실재 토큰은 항상 영숫자로 끝난다.
        .filter((t) => !t.endsWith("-")),
    );
    const missing = Array.from(referenced).filter((token) => !defined.has(token));
    expect(missing).toEqual([]);
  });
});

describe("docs/design/DECISIONS.md — 2026-09-19 기록", () => {
  it("2026-09-19 날짜 머리글이 있다", () => {
    expect(DECISIONS).toMatch(/^## 2026-09-19 —/m);
  });

  it("기록이 6건이다(이탈 4건 + D-20 범위 기록 1건 + kbd 토큰 신설 1건)", () => {
    const count = (DECISIONS.match(/^## 2026-09-19 —/gm) ?? []).length;
    expect(count).toBe(6);
  });
});
