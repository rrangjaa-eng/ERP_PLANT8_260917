// 화면 사용성 원칙(.claude/rules/frontend.md)과 사용자 디자인 결정(.claude/skills/design-gate/CHECKLIST.md §1) 중
// 잴 수 있는 것만 판정한다. 값은 design-principles.spec.ts가 실제 화면에서 재서 넘긴다(사용자 결정 2026-09-28:
// 처음에는 경고만, Phase 4 머지 뒤 DESIGN_PRINCIPLES_STRICT=1로 막는 모드).
// 04.6-06(R11): 막는 모드 판정 `isStrict` · DOM 수집 `collectPrinciplesSnapshot` · 선택자 상수가 여기 있다. Playwright를 import하지 않는다 —
// 단위 테스트가 이 파일을 읽는다. 러너를 쓰는 도우미는 principles-check.ts(`checkPrinciples`).

export type ScreenSnapshot = {
  primaryButtons: number;                  // 보이는 1차 버튼 수
  background: [number, number, number];    // 페이지 바탕 RGB
  subtitle: string | null;                 // 화면 제목 아래 부제
  prose: string[];                         // main 안의 보이는 문단(오류·경고 역할 제외)
  rowActionStyles: string[][];             // 표 행마다 행동(링크·버튼)의 "글자 크기|밑줄" 모양
};

export type Warning = { rule: string; detail: string };

const SUBTITLE_PROSE_MIN = 8;   // 숫자 없는 8자 이상 부제 = 설명형(「진행 중인 프로젝트 원장」). 식별 부제는 번호가 있다(「26001 · 상세 견적 1차」)
const PROSE_MAX = 40;        // 40자 이상 + 띄어쓰기 3번 이상 = 문장(이메일·코드 같은 긴 값은 제외)
const WARM_GAP = 3;        // 빨강이 파랑보다 이만큼 이상 높으면 웜톤

export function evaluatePrinciples(s: ScreenSnapshot): Warning[] {
  const warnings: Warning[] = [];
  if (s.primaryButtons > 1) warnings.push({ rule: "주 버튼 하나", detail: `보이는 1차 버튼 ${s.primaryButtons}개` });
  const [r, , b] = s.background;
  if (r - b >= WARM_GAP) warnings.push({ rule: "웜톤 바탕 금지", detail: `바탕 rgb(${s.background.join(", ")})` });
  if (s.subtitle && !/\d/.test(s.subtitle) && [...s.subtitle].length >= SUBTITLE_PROSE_MIN) warnings.push({ rule: "안내 문구 최소", detail: `설명형 부제 「${s.subtitle}」` });
  for (const p of s.prose) {
    if ([...p].length >= PROSE_MAX && (p.match(/\s/g) ?? []).length >= 3) warnings.push({ rule: "안내 문구 최소", detail: `긴 설명 「${p.slice(0, 30)}…」` });
  }
  const mixed = s.rowActionStyles.filter((row) => new Set(row).size > 1);
  if (mixed.length) warnings.push({ rule: "같은 행동은 같은 모양", detail: `행 ${mixed.length}개: ${[...new Set(mixed[0])].join(" / ")}` });
  return warnings;
}

// 막는 모드가 기본이고 `DESIGN_PRINCIPLES_STRICT=0`일 때만 경고 모드다(ROADMAP SC 5의 `=1`과 같은 효과).
export function isStrict(v: string | undefined): boolean {
  return v !== "0";
}

// 옛 CSS 모듈 클래스 선택자 — 아직 `data-ui` 훅이 없는 화면을 위한 합집합 대체. 04.6-29가 전 화면 이관 뒤 이 상수들을 정리한다.
export const LEGACY_PRIMARY_SELECTOR = '[class*="Button-module__"][class*="__primary"]';
export const LEGACY_SUBTITLE_SELECTOR = '[class*="PageHeader-module__"][class*="__subtitle"]';
// 1차 버튼 = 훅 ∪ 옛 선택자 — 한 번의 querySelectorAll이라 같은 요소를 두 번 세지 않는다.
export const PRIMARY_BUTTON_SELECTOR = `[data-ui="primary-button"], ${LEGACY_PRIMARY_SELECTOR}`;

export type PrincipleSelectors = { primary: string; subtitle: string };
export const PRINCIPLE_SELECTORS: PrincipleSelectors = {
  primary: PRIMARY_BUTTON_SELECTOR,
  subtitle: LEGACY_SUBTITLE_SELECTOR,
};

// 브라우저 안에서 도는 수집 함수 — `page.evaluate(collectPrinciplesSnapshot, PRINCIPLE_SELECTORS)`로 넘긴다. 직렬화되므로 바깥 변수를 쓰지 않는다.
export function collectPrinciplesSnapshot(selectors: PrincipleSelectors): ScreenSnapshot {
  // offsetParent는 position: fixed 요소(옆 패널 버튼 등)에서 null이라 쓰지 않는다.
  // [inert] 조상 안의 요소와, 모달 dialog가 열려 있을 때 그 밖의 요소는 보이지 않는 것으로 친다(뒤는 사용자가 닿을 수 없다).
  const modals = Array.from(document.querySelectorAll("dialog:modal"));
  const visible = (el: Element) =>
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden" &&
    !el.closest("[inert]") &&
    (modals.length === 0 || modals.some((m) => m.contains(el)));
  const main = document.querySelector("main") ?? document.body;
  const rgb = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  let bg = rgb(getComputedStyle(document.body).backgroundColor);
  if (bg.length === 4 && bg[3] === 0) bg = rgb(getComputedStyle(document.documentElement).backgroundColor);
  if (bg.length < 3 || (bg.length === 4 && bg[3] === 0)) bg = [255, 255, 255];
  const subtitle = main.querySelector(selectors.subtitle);
  const prose = Array.from(main.querySelectorAll("p"))
    .filter((p) => visible(p) && !p.closest('[role="alert"], [role="status"]'))
    .map((p) => (p.textContent ?? "").trim())
    .filter(Boolean);
  const rowActionStyles = Array.from(main.querySelectorAll("td"))
    .map((td) =>
      Array.from(td.querySelectorAll("a, button")).filter(visible).map((el) => {
        const cs = getComputedStyle(el);
        const deco = cs.textDecorationLine !== "none" ? "underline" : parseFloat(cs.borderBottomWidth) > 0 ? "border" : "none";
        return `${cs.fontSize}|${deco}`;
      }),
    )
    .filter((row) => row.length >= 2);
  return {
    primaryButtons: Array.from(main.querySelectorAll(selectors.primary)).filter(visible).length,
    background: [bg[0], bg[1], bg[2]] as [number, number, number],
    subtitle: subtitle && visible(subtitle) ? (subtitle.textContent ?? "").trim() : null,
    prose,
    rowActionStyles,
  };
}
