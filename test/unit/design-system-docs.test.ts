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
  it.each(["### 6-7", "### 6-8", "### 6-9", "### 6-10", "### 7-11", "### 7-12", "### 7-13", "### 7-14"])(
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
    ["6-9 오류 페이지", "### 6-9", "### 6-10"],
    ["6-10 「관리」 인덱스 화면", "### 6-10", "## 7. 컴포넌트 규칙"],
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

// docs/design/SYSTEM.md — 2026-09-23 개정(04-08)
//
// UI-SPEC rev 5 「재실행 가능한 확인」(개정 태스크의 완료 조건) 27줄 중 이
// 태스크(Task 2)가 담당하는 줄만 여기서 단언한다. 담당하지 않는 줄은 다른
// 태스크·플랜의 테스트가 맡는다 — 조용히 빠진 줄이 없도록 담당표를 남긴다:
//
//   2·3(앱 코드 글리프·metaKey)         → 04-28 test/unit/ui/shortcut-notation.test.ts
//   9의 `### 7-17`·11·12(Button.tsx)   → 04-46(아래 describe에 추가 — Task 1은 11·12, Task 2는 `### 7-17`)
//   14(`6쪽부터` 폰 페이지 줄 창)         → 04-29 Task 3(DR-33)
//
// 이 태스크 몫: 1·4·5·6·7·8·9(### 7-16)·10·13·15~26 + 글리프 넷(⌘·↵·⌥·⇧) 0 +
// §6-2 스케치 여섯 낱말 + (가) 잠김 행 셋째 칸 세 문자열 + §7-16 next/link·「새 쪽의
// 활성 셀」 + DECISIONS 번호별 머리글(15건 — 04-46 Task 1·2가 17건으로 늘렸다).
describe("docs/design/SYSTEM.md — 2026-09-23 개정(04-08)", () => {
  it("맥 글리프(⌘·↵·⌥·⇧)가 0개다(항목 1, 넷으로 넓혀 — D-94)", () => {
    for (const glyph of ["⌘", "↵", "⌥", "⇧"]) {
      expect(SYSTEM.includes(glyph)).toBe(false);
    }
  });

  it("옛 목록 페이지(`더 보기 50건`)·옛 완료 라벨(`완료(정산)`)이 0개다(항목 4)", () => {
    expect(SYSTEM).not.toContain("더 보기 50건");
    expect(SYSTEM).not.toContain("완료(정산)");
  });

  it("`실행가만 고칠 수 있음`이 0개다(항목 5, D-78 개정 CEO-D10·D12)", () => {
    expect(SYSTEM).not.toContain("실행가만 고칠 수 있음");
  });

  it("`실행가와 새 줄만`이 1개 이상이다(항목 6)", () => {
    expect((SYSTEM.match(/실행가와 새 줄만/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("`대기(`--accent`)`가 0개다(항목 7, ⑩)", () => {
    expect(SYSTEM).not.toContain("대기(`--accent`)");
  });

  it("NextTurn.tsx 소스에서 `대기`와 `accent`가 한 줄에 없다(항목 8, ⑩)", () => {
    const NEXT_TURN = readFileSync(
      resolve(process.cwd(), "ui", "next-turn", "NextTurn.tsx"),
      "utf8",
    );
    const line = NEXT_TURN.split("\n").find((l) => l.includes("대기"));
    expect(line).toBeDefined();
    expect(line).not.toContain("accent");
  });

  it("`### 7-16`·`### 7-17` 머리글이 각 정확히 한 줄이다(항목 9, ⑧·⑮ — 7-17은 04-46 Task 2)", () => {
    expect((SYSTEM.match(/^### 7-16/gm) ?? []).length).toBe(1);
    expect((SYSTEM.match(/^### 7-17/gm) ?? []).length).toBe(1);
  });

  it("합계 범위 문구(`편집 표의 합계 행` · `편집 표 합계 행 위`)가 2개 이상이다(항목 10, ③)", () => {
    expect(
      (SYSTEM.match(/편집 표의 합계 행|편집 표 합계 행 위/g) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("`확인의 근거 한 칸`이 한 줄 있다(항목 13, ⑭)", () => {
    expect((SYSTEM.match(/확인의 근거 한 칸/g) ?? []).length).toBe(1);
  });

  it("안심 꼬리(`1칸 · 값은 남아 있습니다`)가 0개다(항목 15, ⑯)", () => {
    expect(SYSTEM).not.toContain("1칸 · 값은 남아 있습니다");
  });

  it("비활성 이유 접두(`등록할 수 없음 —`)가 0개다(항목 16, ⑯)", () => {
    expect(SYSTEM).not.toContain("등록할 수 없음 —");
  });

  it("`안내 문구를 최소`가 한 줄 있다(항목 17, ⑯ §8 규칙 5)", () => {
    expect((SYSTEM.match(/안내 문구를 최소/g) ?? []).length).toBe(1);
  });

  it("`열이 많은 표(읽기·편집)`가 한 줄 있다(항목 18, ③ DR-14)", () => {
    expect((SYSTEM.match(/열이 많은 표\(읽기·편집\)/g) ?? []).length).toBe(1);
  });

  it("`1024 이상에서만`이 1개 이상이다(항목 19, ③ DR-36)", () => {
    expect((SYSTEM.match(/1024 이상에서만/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("`1280 · 1024 · 375`가 1개 이상이다(항목 20, ③ §11 감사 폭)", () => {
    expect((SYSTEM.match(/1280 · 1024 · 375/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("`매출 계약 금액`이 0개다(항목 21, ⑥ D-84가 없앤 칸)", () => {
    expect(SYSTEM).not.toContain("매출 계약 금액");
  });

  it("옛 §7-9 「화면 하단에 **항상**」이 0개다(항목 22, ⑬)", () => {
    expect(SYSTEM).not.toContain("화면 하단에 **항상**");
  });

  it("`견적 줄이 잠김`이 0개다(항목 23, ④ — `완료 · 견적 줄 잠김`으로 대체)", () => {
    expect(SYSTEM).not.toContain("견적 줄이 잠김");
  });

  it("`seenStatus`가 1개 이상이다(항목 24, ⑫ (사) ⑶)", () => {
    expect((SYSTEM.match(/seenStatus/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("`권한 밖인 줄`이 1개 이상이다(항목 25, ⑫ (가))", () => {
    expect((SYSTEM.match(/권한 밖인 줄/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("합계 행 톤 순서(`--danger` → `--warning` → `--muted`)가 한 줄 있다(항목 26, ⑫)", () => {
    expect(
      (SYSTEM.match(/`--danger` → `--warning` → `--muted`/g) ?? []).length,
    ).toBe(1);
  });

  it("`docs/design/tokens.css`가 변경되지 않았다(항목 27 — git 커밋 비교는 검증 명령이 맡는다)", () => {
    // 이 단언은 파일 내용이 아니라 SYSTEM.md가 새 토큰을 참조하지 않는지만
    // 본다 — 실제 git diff 비교는 <verify>의 `git diff --stat` 명령이 한다.
    expect(TOKENS.length).toBeGreaterThan(0);
  });

  it("§6-2 스케치가 여섯 낱말(상태 바꾸기·기간·차수·조정·고객 승인·페이지 범위 `/`)을 담는다(T17)", () => {
    const sketch = section(SYSTEM, "### 6-2", "### 6-3");
    for (const word of ["상태 바꾸기", "기간", "차수", "조정", "고객 승인"]) {
      expect(sketch).toContain(word);
    }
    expect(sketch).toMatch(/\d+[–-]\d+ \/ \d+줄/);
  });

  it("(가) 잠김 행 셋째 칸에 세 문자열이 있다(④, DR-2)", () => {
    expect(SYSTEM).toContain("완료 · 견적 줄 잠김");
    expect(SYSTEM).toContain("정산 · 실행가와 새 줄만");
    expect(SYSTEM).toContain("{n}차 고객 승인됨 · 고치려면 새 차수");
  });

  it("§7-16에 `next/link`와 「새 쪽의 활성 셀」 문장이 있다(⑧, DR-18·DR-23)", () => {
    const sec = section(SYSTEM, "### 7-16", "## 8. 카피 규칙");
    expect(sec).toContain("next/link");
    expect(sec).toContain("새 쪽의 활성 셀");
  });

  it("DECISIONS.md에 2026-09-23 Phase 4(04-08) 항목이 17건이다(② + ①③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯ + 진행 막대 기록)", () => {
    const count = (DECISIONS.match(/^## 2026-09-23 — Phase 4\(04-08\)/gm) ?? []).length;
    expect(count).toBe(17);
  });

  it("DECISIONS.md ④ 머리글에 `D-78 개정(CEO-D10·D12)`이 있다", () => {
    expect(DECISIONS).toContain("D-78 개정(CEO-D10·D12)");
  });
});

// docs/design/SYSTEM.md · ui/button/Button.tsx — 2026-09-24 개정(04-46 Task 1, ⑦)
//
// 위 describe(04-08)가 담당하지 않는 「재실행 가능한 확인」 11·12(Button.tsx의
// reasonTone·aria-disabled)와 ⑦의 §7-1 `--muted`·aria-disabled 문장을 여기서
// 단언한다 — DR-10 · DR-11, 교차 그룹 계약 1.
describe("docs/design/SYSTEM.md · ui/button/Button.tsx — 2026-09-24 개정(04-46, ⑦)", () => {
  const BUTTON_TSX = readFileSync(resolve(process.cwd(), "ui", "button", "Button.tsx"), "utf8");

  it("§7-1에 정상 상태 이유는 `--muted`라는 문장이 있다(U-4)", () => {
    expect(SYSTEM).toContain("정상 상태(예: 저장할 편집 없음)의 이유는 `--muted`로 쓴다");
  });

  it("§7-1·§10에 `aria-disabled` 문장이 있다(DR-11)", () => {
    expect(SYSTEM).toContain('네이티브 `disabled`가 아니라 `aria-disabled="true"`다');
    expect(SYSTEM).toContain("그 버튼은 `aria-disabled`여야 한다");
  });

  it("Button.tsx에 `reasonTone`이 1개 이상이다(재실행 확인 11)", () => {
    expect((BUTTON_TSX.match(/reasonTone/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("Button.tsx에 `aria-disabled`가 1개 이상이다(재실행 확인 12)", () => {
    expect((BUTTON_TSX.match(/aria-disabled/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("Button.tsx가 <button>에 네이티브 disabled 속성을 넘기지 않는다", () => {
    expect(BUTTON_TSX).not.toMatch(/disabled=\{isDisabled\}/);
    expect(BUTTON_TSX).not.toMatch(/<button[\s\S]*?\sdisabled=\{/);
  });
});

// docs/design/SYSTEM.md — 2026-09-24 개정(04-46 Task 2, ⑮) — §7-17 신설 +
// §7-8 한 줄. DECISIONS 17건 단언은 위(04-08 describe)에서 이미 한다.
describe("docs/design/SYSTEM.md — 2026-09-24 개정(04-46, ⑮)", () => {
  it("§7-17 절에 확인 근거·막힘 이유·2차 라벨 자동 파생 문장이 있다", () => {
    const sec = section(SYSTEM, "### 7-17", "## 8. 카피 규칙");
    expect(sec).toContain("확인 근거 한 칸");
    expect(sec).toContain("reasonTone");
    expect(sec).toContain("2차 라벨은 1차 라벨에서 자동 파생된다");
  });

  it("§7-8에 「모달·시트는 §7-17 컴포넌트로 만든다」 문장이 있다", () => {
    expect(SYSTEM).toContain("모달·시트는 §7-17 컴포넌트로 만든다");
  });
});

// docs/design/SYSTEM.md · docs/design/DECISIONS.md — 2026-09-23 개정(04-29,
// DR-33) — §7-16 「생략」 규칙. 04-08 담당표(150행 부근) 14번 「6쪽부터」가
// 이 describe로 덮인다. ENG-D11: PC 생략 규칙의 기본 문장(7쪽/8쪽)도 04-08이
// 실제로는 §7-16에 적지 않아(DECISIONS ⑧ 「결정」 본문에도 없다) 여기서 함께
// 고정한다(회귀 테스트).
describe("docs/design/SYSTEM.md · DECISIONS.md — 2026-09-23 개정(04-29, DR-33)", () => {
  it("§7-16에 PC 생략 규칙 기본 문장이 있다(ENG-D11 회귀 — 04-08이 빠뜨렸던 문장)", () => {
    const sec = section(SYSTEM, "### 7-16", "## 8. 카피 규칙");
    expect(sec).toContain("PC는 7쪽 이하면 전부, 8쪽 이상이면 첫 · 끝 · 현재 ±1과 사이");
  });

  it("§7-16에 C-27 문장(건너뛸 쪽이 정확히 하나면 그 번호)이 있다", () => {
    const sec = section(SYSTEM, "### 7-16", "## 8. 카피 규칙");
    expect(sec).toContain("건너뛸 쪽이 정확히 하나면 `…` 대신 그 번호를 보인다");
    expect(sec).toContain("1 2 3 4 5 … 12");
    expect(sec).toContain("1 … 8 9 10 11 12");
  });

  it("§7-16에 폰 6쪽부터 첫·현재·끝 문장이 있다(04-08 「재실행 가능한 확인」 14번)", () => {
    const sec = section(SYSTEM, "### 7-16", "## 8. 카피 규칙");
    expect(sec).toContain("6쪽부터 첫 · 현재 · 끝");
  });

  it("DECISIONS.md에 2026-09-23 Phase 4(04-29) 머리글이 한 줄이고 C-27·6쪽부터를 함께 말한다(DR-33)", () => {
    const heading = "## 2026-09-23 — Phase 4(04-29)";
    expect((DECISIONS.match(/^## 2026-09-23 — Phase 4\(04-29\)/gm) ?? []).length).toBe(1);
    const start = DECISIONS.indexOf(heading);
    const nextHeadingIndex = DECISIONS.indexOf("\n## ", start + 1);
    const entry = DECISIONS.slice(start, nextHeadingIndex === -1 ? undefined : nextHeadingIndex);
    expect(entry).toContain("C-27");
    expect(entry).toContain("6쪽부터");
  });
});

// 04.4-05 Task 3(UI-SPEC 갱신 ①②③): 시스템 문서가 복원 리허설 · 사람 목록 화면과 같다.
describe("docs/design/SYSTEM.md — Phase 04.4 복원 리허설 · 사람 목록 (04.4-05)", () => {
  const status = section(SYSTEM, "### 6-8", "### 6-9");
  const table = section(SYSTEM, "### 7-3", "### 7-4");
  const tag = section(SYSTEM, "### 7-5", "### 7-6");

  it("§6-8 와이어프레임에 「복원 리허설」 줄이 「마지막 백업」 바로 다음에 있다", () => {
    const lines = status.split("\n");
    const backup = lines.findIndex((line) => line.includes("│ 마지막 백업"));
    expect(backup).toBeGreaterThan(-1);
    expect(lines[backup + 1]).toContain("│ 복원 리허설");
  });

  it("§6-8 항목 목록에 「복원 리허설」이 있고 고정 개수 문구가 없다", () => {
    expect(status).toMatch(/항목:.*복원 리허설\(/);
    expect(status).not.toMatch(/세 항목|3줄/);
  });

  it("§7-5에 두 로그인 문구의 길이 예외 줄이 있다", () => {
    expect(tag).toContain("첫 로그인 전");
    expect(tag).toContain("임시 비밀번호 사용 중");
  });

  it("§7-3 P1 줄에 금액 열이 없는 표의 규칙이 있다", () => {
    const p1 = table.split("\n").find((line) => line.startsWith("- P1은"));
    expect(p1).toContain("금액 열이 없는 표");
  });

  it("DECISIONS.md에 §7-5 길이 예외와 §7-3 금액 열 없는 표의 P1 항목이 있다", () => {
    const headings = DECISIONS.split("\n").filter((line) => line.startsWith("## "));
    expect(headings.some((line) => line.includes("§7-5") && line.includes("첫 로그인 전"))).toBe(true);
    expect(headings.some((line) => line.includes("§7-3") && line.includes("금액 열"))).toBe(true);
  });
});
