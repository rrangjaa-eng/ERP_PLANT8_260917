import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// M-3(03-REVIEW.md) — HistoryList의 "새 이력 추가" 입력 id가
// "history-list-add-value" / "history-list-effective-from"로 하드코딩되어
// 있었다. app/(app)/admin/settings/page.tsx는 이력형 설정 키마다(현재 6개)
// HistorizedFieldEditor → HistoryList를 하나씩 렌더하므로, 서로 다른 두 키의
// "새 이력 추가" 폼을 동시에 열면 두 <input>이 같은 id를 갖는다.
// <label htmlFor>는 문서상 첫 번째로 일치하는 id에 바인딩되므로, 두 번째
// 폼의 "적용 시작일" 라벨을 클릭하면 첫 번째 폼의 입력창이 포커스를 받는다
// (axe duplicate-id 위반이기도 하다).
//
// 이 저장소에는 React 렌더 테스트 러너가 없으므로(@testing-library/react
// 미설치, 새 의존성은 승인 사항 — CLAUDE.md) next-turn-action.test.ts와
// 같은 방식으로 소스 텍스트를 읽어 하드코딩된 id 리터럴이 없는지, idPrefix
// prop을 실제로 쓰는지 검사한다. 라벨-포커스 행동 자체는
// test/e2e/settings.spec.ts의 e2e로 증명한다.
const HISTORY_LIST = readFileSync(resolve(process.cwd(), "ui/history-list/HistoryList.tsx"), "utf8");

describe("M-3: HistoryList의 입력 id가 호출부마다 고유하다", () => {
  it("effectiveFrom 입력 id에 하드코딩된 리터럴을 쓰지 않는다", () => {
    expect(HISTORY_LIST).not.toContain('id="history-list-effective-from"');
  });

  it("값 입력 id에 하드코딩된 리터럴을 쓰지 않는다", () => {
    expect(HISTORY_LIST).not.toContain('id="history-list-add-value"');
  });

  it("HistoryListProps가 idPrefix를 (옵셔널 폴백 없이) 필수로 받는다", () => {
    expect(HISTORY_LIST).toMatch(/idPrefix:\s*string;/);
  });

  it("effectiveFrom 입력 id가 idPrefix로부터 만들어진다", () => {
    expect(HISTORY_LIST).toMatch(/id=\{`\$\{idPrefix\}-effective-from`\}/);
  });

  it("값 입력 id가 idPrefix로부터 만들어진다", () => {
    expect(HISTORY_LIST).toMatch(/id=\{`\$\{idPrefix\}-add-value`\}/);
  });
});
