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

// quick 261001-85g(UX-01) — 확인 모달의 ERROR 자리. §7-7 「시트/모달(§7-8)」 행과 §7-17이 같은 글자로 말한다(구현: ConfirmDialog
// disabledReason = 행동 줄 왼쪽 막힘 자리, blockedBy = 근거 칸 아래 Form.Error를 가리키고 왼쪽에 다시 쓰지 않음).
// 2026-10-01 — 「그대로」가 아니다: 끝의 ` · 새로 고침` 꼬리는 글자 대신 3차 버튼이 된다(ConfirmDialog가 강제).
const CONFIRM_SERVER_REJECT = "서버 거부 문자열은 막힘 자리(행동 줄 왼쪽 — 2차 · 1차 앞)에 붙고 다이얼로그는 닫히지 않는다";
const CONFIRM_REFRESH_TAIL = "끝이 ` · 새로 고침`이면 그 꼬리는 글자로 쓰지 않고 다음 한 수 3차 `새로 고침`";
const CONFIRM_EVIDENCE_ERROR = "근거 칸 입력 오류(날짜 칸의 빈 값 · 형식)만 칸 아래 `Form.Error` 한 줄";

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
    ["7-14 이력 목록", "### 7-14", "### 7-15"],
    ["7-15 폼", "### 7-15", "### 7-16"],
    ["7-16 페이지 줄", "### 7-16", "### 7-17"],
    ["7-17 확인 모달", "### 7-17", "## 8. 카피 규칙"],
  ];

  it.each(sectionBounds)("'%s' 절이 다섯 상태를 전부 명시한다", (_name, start, end) => {
    const sec = section(SYSTEM, start, end);
    for (const state of FIVE_STATES) {
      expect(sec).toContain(state);
    }
  });
});

describe("docs/design/SYSTEM.md — 확인 모달 ERROR 자리 (§7-7 ↔ §7-17, UX-01)", () => {
  const headers = ["컴포넌트", "LOADING", "EMPTY", "ERROR", "SUCCESS", "PARTIAL"];
  const row = section(SYSTEM, "### 7-7", "### 7-8")
    .split("\n")
    .find((line) => line.startsWith("| 시트/모달(§7-8) |"));
  const errorCell = row?.split("|").slice(1, -1)[headers.indexOf("ERROR")] ?? "";
  const confirmModal = section(SYSTEM, "### 7-17", "## 8. 카피 규칙");

  it.each([
    ["서버 거부 자리", CONFIRM_SERVER_REJECT],
    ["「새로 고침」 꼬리", CONFIRM_REFRESH_TAIL],
    ["근거 칸 입력 오류 자리", CONFIRM_EVIDENCE_ERROR],
  ])("§7-7 시트/모달 ERROR 칸과 §7-17이 %s를 같은 글자로 말한다", (_name, phrase) => {
    expect(errorCell).toContain(phrase);
    expect(confirmModal).toContain(phrase);
  });
});

// 2026-10-01(PR #121 독립 검토) — 확인 모달 문서를 구현에 맞춤. 정본 판단은 DECISIONS.md 같은 날 항목.
describe("docs/design/SYSTEM.md — 확인 모달 SUCCESS · ERROR · 근거 칸 이유 자리 (§7-7 · §7-8 · §7-17)", () => {
  const headers = ["컴포넌트", "LOADING", "EMPTY", "ERROR", "SUCCESS", "PARTIAL"];
  const row = section(SYSTEM, "### 7-7", "### 7-8")
    .split("\n")
    .find((line) => line.startsWith("| 시트/모달(§7-8) |"));
  const cell = (state: string) => row?.split("|").slice(1, -1)[headers.indexOf(state)] ?? "";
  const modalBullet = section(SYSTEM, "### 7-8", "### 7-9")
    .split("\n")
    .find((line) => line.startsWith("- 모달(PC):")) ?? "";
  const confirmModal = section(SYSTEM, "### 7-17", "## 8. 카피 규칙");
  const confirmSuccess = confirmModal.split("\n").find((line) => line.startsWith("| SUCCESS |")) ?? "";

  it("§7-7 SUCCESS — 결과 한 줄을 보이지 않고 바로 닫힌다(ConfirmDialog 호출처 전부)", () => {
    expect(cell("SUCCESS")).toContain("성공하면 바로 닫힌다");
    expect(cell("SUCCESS")).not.toContain("결과 한 줄을 보인 뒤 닫히고");
    expect(confirmSuccess).toContain("성공하면 바로 닫는다");
  });

  it("§7-7 SUCCESS — 토스트는 화면에 드러나지 않는 결과에만, 1차 라벨과 같은 단어", () => {
    expect(cell("SUCCESS")).toContain("토스트 `{1차 라벨} · {결과}`(반려 · 회수 · 새 차수 만들기 · 상태 바꾸기)");
    expect(cell("SUCCESS")).toContain("토스트 없음(승인일 줄 · 지운 줄 · 입력 버리기의 이동)");
  });

  it("§7-17 ERROR — 「새로 고침」은 화면을 다시 받고 닫으며, 거부가 붙은 동안 1차가 막힌다", () => {
    expect(confirmModal).not.toContain("그대로 붙고");
    expect(cell("ERROR")).not.toContain("그대로 붙고");
    expect(confirmModal).toContain("`새로 고침`은 화면 데이터를 다시 받아 새 화면이 그려진 뒤 다이얼로그를 닫는다(받는 동안 `새로 고침…`");
    // 꼬리가 있으면 그 이유의 다음 한 수는 언제나 「새로 고침」 — 호출처가 준 다음 한 수는 다른 이유의 짝이다.
    expect(confirmModal).not.toContain("직접 주면 그것이 먼저다");
    expect(confirmModal).toContain("호출한 화면이 준 다음 한 수보다 먼저다");
    expect(confirmModal).toContain("거부가 붙은 동안 1차는 막힌다(`Ctrl+Enter` 포함) — 근거 칸을 고치거나 다이얼로그를 닫았다 다시 열면 풀린다");
  });

  it("§7-8 모달 — 근거 칸 이유 자리는 칸 종류가 정한다(사유형 = 행동 줄 왼쪽 · 날짜형 = 칸 아래)", () => {
    expect(modalBullet).not.toContain("1차 버튼 비활성 + 왼쪽에 이유");
    expect(modalBullet).toContain("사유형(여러 줄 사유 칸)은 행동 줄 왼쪽(`사유 없음 · 사유 적기`, §7-1)");
    expect(modalBullet).toContain("날짜형은 칸 아래 `Form.Error` 한 줄(`날짜 없음 · 날짜 고르기` · `날짜 형식 오류 · 2026-09-18처럼`)이고 왼쪽에 다시 쓰지 않는다");
  });

  it("§7-17 · §7-8 — 폰은 막힘 이유 · 다음 한 수가 버튼 윗줄이고 버튼 줄은 2차 · 1차만(사용자 결정 2026-10-01)", () => {
    const phoneRow = "폰(<700)은 막힘 이유 · 다음 한 수가 버튼 윗줄 전체 폭이고, 버튼 줄은 2차 · 1차만 둔다(1차가 2차의 두 배 폭)";
    expect(confirmModal).toContain(phoneRow);
    const sheetActions = section(SYSTEM, "### 7-8", "### 7-9")
      .split("\n")
      .find((line) => line.startsWith("- 시트 행동 줄:")) ?? "";
    expect(sheetActions).toContain("막힘 이유 · 다음 한 수는 버튼 윗줄(§7-17)");
    const headings = DECISIONS.split("\n").filter((line) => line.startsWith("## "));
    expect(headings.some((line) => line.includes("폰 확인 시트") && line.includes("윗줄"))).toBe(true);
  });

  it("DECISIONS.md에 확인 모달 SUCCESS · 「새로 고침」 꼬리 · 근거 칸 이유 자리 항목이 있다", () => {
    const headings = DECISIONS.split("\n").filter((line) => line.startsWith("## "));
    expect(headings.some((line) => line.includes("확인 모달") && line.includes("새로 고침"))).toBe(true);
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
    const inbox = section(SYSTEM, "### 7-12.", "### 7-13.");
    expect(SYSTEM.replace(inbox, "")).not.toContain("더 보기 50건");
    expect(SYSTEM).not.toContain("완료(정산)");
  });

  it("§7-12 알림함의 `더 보기 50건`은 기록된 임시 예외다(04.2 병합, D-91 적용 범위)", () => {
    expect(section(SYSTEM, "### 7-12.", "### 7-13.")).toContain("기록된 임시 예외");
    expect(DECISIONS).toContain("알림함 「더 보기 50건」을 기록된 임시 예외로");
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

  it("status-map.ts 소스에서 `대기`와 `accent`가 한 줄에 없다(항목 8, ⑩ — NextTurn 태그 색은 04.6-05 이후 status-map 한 표)", () => {
    const STATUS_MAP = readFileSync(
      resolve(process.cwd(), "ui", "status-tag", "status-map.ts"),
      "utf8",
    );
    const line = STATUS_MAP.split("\n").find((l) => l.includes("대기:"));
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

// Phase 04.6-01 — 스킨 A 개정(DECISIONS 2026-10-02 · 사용자 답 `.planning/phases/04.6-a/04.6-ANSWERS.md`).
// 사용자 답 인용 값: UQ-1·2·3·6·7 = A · Q1 = A(옆 패널이 뒤를 막는다 — #88 D-d 대체).
describe("docs/design/SYSTEM.md · DECISIONS.md — 스킨 A 개정(04.6-01)", () => {
  const sideBySide = section(SYSTEM, "### 7-8", "### 7-9");
  const roleOnlyPanel = SYSTEM.split("\n").find((line) => line.startsWith("- **(04.6-01 — 04.3-10 ⑰ D-d를 이 계약이 대체한다")) ?? "";
  const screens = section(SYSTEM, "### 7-20", "## 8. 카피 규칙");
  const external = section(SYSTEM, "### 6-5", "### 6-6");
  const tokensTable = section(SYSTEM, "### 4-4", "## 5. 모션");

  it("§7-8 제목이 「팝업 · 모달 · 옆 패널 · 시트」이고 ⑰ 문단이 04.6 계약(뒤를 막는다)으로 바뀌었다(Q1 A)", () => {
    expect(SYSTEM).toContain("### 7-8. 팝업 · 모달 · 옆 패널 · 시트");
    expect(roleOnlyPanel).toContain("모든 옆 패널이 뒤를 막는다");
    expect(roleOnlyPanel).toContain("`--scrim-panel`");
    expect(roleOnlyPanel).toContain("`inert`");
    expect(roleOnlyPanel).toContain("여는 요소");
    expect(sideBySide).not.toContain("그 1차는 렌더하지 않는다");
  });

  it("DECISIONS에 #88 D-d를 대체하는 새 항목이 있고 사용자 답 파일을 인용한다(Q1 A)", () => {
    const entry = DECISIONS.split("\n## ").find((e) => e.includes("D-d 대체")) ?? "";
    expect(entry).toContain("04.6-ANSWERS.md");
    expect(entry).toContain("A 「막음(04.6 계약)」");
    // 기록 보존 — D-d 원 항목 본문은 그대로 있다.
    expect(DECISIONS).toContain("## 2026-10-01 — 옆 패널 부품 · 첫 적용 = 확인증 「QR 생성 신청」(D-d)");
  });

  it("§4-4 3차 버튼 밑줄 행이 hover 2px 역할 이름을 가리키고 DECISIONS에도 한 줄 있다(M1)", () => {
    const row = tokensTable.split("\n").find((line) => line.startsWith("| 3차 버튼 밑줄 |")) ?? "";
    expect(row).toContain("--underline-w-hover");
    expect(DECISIONS).toContain("`--underline-w-hover`");
  });

  it("§2-2 · §10 에 외부 수령자 15px 역할 이름 --text-prose 가 있다(Q7)", () => {
    expect((SYSTEM.match(/--text-prose/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(SYSTEM).toContain("산문·외부 수령자 화면은 15px 이상 — 역할 이름은 `--text-prose`");
  });

  it("§6-5 에 app/c/** 셸 없는 화면 근거 한 줄이 있다(R12 — 04.6-02 stylelint override의 근거)", () => {
    expect(external).toContain("`app/c/**`");
    expect(external).toContain("`--text-title` · `--text-subtitle`을 직접 쓸 수 있고");
    expect(external).toContain("`--recipient-w`");
  });

  it("§7-20 에 틀마다 1·2·3순위가 있고 빈 목록은 DR5 A 답으로만 적는다(D5)", () => {
    for (const frame of ["`ListScreen`", "`DetailScreen`", "`SidePanel` + `PanelForm`"]) {
      const line = screens.split("\n").find((l) => l.startsWith("- **" + frame));
      expect(line, frame).toBeDefined();
    }
    expect((screens.match(/\*\*행동 순위\*\*: 1차 = .*2차 = .*3차 = /g) ?? []).length).toBe(3);
    expect(screens).toContain("빈 목록이면 머리 1차를 숨기고 빈 화면 버튼 하나가 같은 등록 행동을 맡는다");
  });

  it("#88 이 넣은 SYSTEM 줄을 지우지 않았다(Q12 — ⑯ · ①-j · ①-k · 확인증 낱말)", () => {
    for (const keep of ["⑯", "①-j", "①-k", "신청됨", "접수 전", "접수 중", "닫힘", "제출됨", "대조 제외"]) {
      expect(SYSTEM, keep).toContain(keep);
    }
  });

  it("§6-3 옆 패널 배치가 성공 뒤·닫기 동작을 쓰지 않는다(04.6-04가 쓴다) — 폭·라벨 위·칸 전폭·행동 순서만", () => {
    const panel = section(SYSTEM, "### 6-3", "### 6-4");
    const bullet = panel.split("\n").find((line) => line.startsWith("- **옆 패널 배치**")) ?? "";
    expect(bullet).toContain("`--panel-w` 480");
    expect(bullet).toContain("라벨 위");
    expect(bullet).toContain("칸 전폭");
    expect(bullet).toContain("2차 「취소 Esc」 → 1차");
    expect(bullet).toContain("`aria-disabled`");
    expect(bullet).not.toContain("칸만 비우고");
    expect(bullet).not.toContain("입력 버리기");
  });

  // 04.6-04 — 사용자 답(UQ-8 B · R9 D · DR1 A · DR5 A)이 SYSTEM에 줄로 있다. 위 테스트가 지키는 「옆 패널 배치」 줄에는 넣지 않고 별도 줄이다.
  it("§6-3에 옆 패널 제출 뒤(UQ-8 B · R9 D) · 닫기(DR1 A · D12) 줄이 있다", () => {
    const panel = section(SYSTEM, "### 6-3", "### 6-4");
    const submit = panel.split("\n").find((line) => line.startsWith("- **옆 패널 제출 뒤**")) ?? "";
    expect(submit).toContain("칸을 비우고 첫 칸");
    expect(submit).toContain("role=\"status\"");
    expect(submit).toContain("수정은 닫힘");
    expect(submit).toContain("상세");
    expect(submit).toContain("?added=");
    expect(submit).toContain("D7");
    const close = panel.split("\n").find((line) => line.startsWith("- **옆 패널 닫기**")) ?? "";
    expect(close).toContain("입력 버리기");
    expect(close).toContain("`router.back()`");
    expect(close).toContain("`replace`");
    expect(close).toContain("requestClose");
  });

  it("§7-7 빈 화면에 빈 목록 등록 버튼 줄(DR5 A)이 있다 — 머리 1차 숨김 · 빈 화면 버튼 하나", () => {
    const states = section(SYSTEM, "### 7-7", "### 7-8");
    const line = states.split("\n").find((row) => row.includes("DR5 A")) ?? "";
    expect(line).toContain("머리");
    expect(line).toContain("1차");
    expect(line).toContain("빈 화면");
  });
});
