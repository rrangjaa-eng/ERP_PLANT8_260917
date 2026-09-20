import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// WR-05(02-REVIEW.md) — 자동 소멸 타이머가 부모 리렌더마다 재시작된다.
// 효과의 의존성 배열에 onDismiss가 들어 있어서, 호출부가 인라인 클로저
// (onDismiss={() => setToast(null)})를 넘기면 — 거의 항상 그렇다 — 렌더마다
// 정체성이 바뀌어 타이머가 매번 clear·재설정된다. 4초보다 자주 리렌더되는 부모
// (폼 입력, useAction 상태 변화, 폴링 훅) 아래에서는 토스트가 영원히 남아
// §7-6 "4초 뒤 사라짐"을 어긴다.
//
// 이 검사가 소스 텍스트를 보는 이유: 이 저장소에 React 렌더 테스트 러너가 없고
// (@testing-library/react 미설치) 새 의존성은 승인 사항이다(CLAUDE.md). 동작
// 수준 검증은 러너가 들어오는 시점에 붙인다 — 그때까지 이 회귀만 고정한다.
const TOAST = readFileSync(resolve(process.cwd(), "ui/toast/Toast.tsx"), "utf8");

function autoDismissEffectDeps(): string {
  const match = TOAST.match(/useEffect\([\s\S]*?\}, \[([^\]]*)\]\);/);
  if (!match) throw new Error("Toast.tsx의 자동 소멸 useEffect를 찾지 못했다");
  return match[1] ?? "";
}

describe("WR-05: 토스트 자동 소멸 타이머", () => {
  it("효과 의존성에 onDismiss가 없다 — 있으면 부모 리렌더마다 타이머가 재시작된다", () => {
    expect(autoDismissEffectDeps()).not.toContain("onDismiss");
  });

  it("tone은 여전히 의존성이다 — error로 바뀌면 타이머를 걷어야 한다", () => {
    expect(autoDismissEffectDeps()).toContain("tone");
  });

  it("최신 onDismiss를 ref로 읽는다 — 정체성이 바뀌어도 타이머는 유지된다", () => {
    expect(TOAST).toMatch(/onDismissRef/);
  });

  it("오류 토스트는 role=alert다 — 닫을 때까지 남는 실패를 polite로 읽으면 놓친다", () => {
    expect(TOAST).toMatch(/role=\{tone === "error" \? "alert" : "status"\}/);
  });
});
