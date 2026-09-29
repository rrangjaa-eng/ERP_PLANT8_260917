// 화면 사용성 원칙(.claude/rules/frontend.md)과 사용자 디자인 결정(.claude/skills/design-gate/CHECKLIST.md §1) 중
// 잴 수 있는 것만 판정한다. 값은 design-principles.spec.ts가 실제 화면에서 재서 넘긴다(사용자 결정 2026-09-28:
// 처음에는 경고만, Phase 4 머지 뒤 DESIGN_PRINCIPLES_STRICT=1로 막는 모드).

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
