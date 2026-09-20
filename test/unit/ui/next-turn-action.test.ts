import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// WR-04(02-REVIEW.md) — 「내 차례」의 다음 한 수가 아무 데도 가지 않는다.
// NextTurnItem.action은 { label; href }인데 컴포넌트가 href를 버리고
// <Button type="button">만 그렸다. onClick도 없어 블록의 핵심 행동이 죽은 버튼이다.
// "더 보기 N건"도 마찬가지였다.
//
// Phase 2에서 안 터진 이유는 홈이 항상 buildNextTurnView([])를 넘겨 블록이
// 렌더되지 않기 때문이다(D-24). 단위 테스트는 순수 함수만 덮었고 렌더는 안 덮었다.
// Phase 4가 첫 실제 항목을 넣는 순간 드러났을 결함이다.
//
// 이 검사가 소스 텍스트를 보는 이유: 이 저장소에 React 렌더 테스트 러너가 없고
// (@testing-library/react 미설치) 새 의존성은 승인 사항이다(CLAUDE.md). 블록이
// 실제 데이터로 렌더되는 Phase 4에서 E2E로 바꿔 단다.
const NEXT_TURN = readFileSync(resolve(process.cwd(), "ui/next-turn/NextTurn.tsx"), "utf8");

describe("WR-04: 「내 차례」의 다음 한 수가 실제로 이동한다", () => {
  it("항목의 action.href를 쓴다 — 버리지 않는다", () => {
    expect(NEXT_TURN).toContain("item.action.href");
  });

  it("다음 한 수가 <a>다 — §10: 페이지 이동은 <a>, 행동은 <button>", () => {
    expect(NEXT_TURN).toMatch(/<a\s+href=\{item\.action\.href\}/);
  });

  it("동작 없는 <Button type=\"button\">을 행동 자리에 두지 않는다", () => {
    expect(NEXT_TURN).not.toMatch(/<Button\s+type="button"\s+variant="tertiary">/);
  });

  it("「더 보기」도 갈 곳이 있을 때만 링크로 렌더된다", () => {
    expect(NEXT_TURN).toContain("moreHref");
    expect(NEXT_TURN).toMatch(/<a\s+href=\{moreHref\}/);
  });
});
