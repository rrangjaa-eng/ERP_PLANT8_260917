import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ConfirmDialog,
  secondaryLabelFor,
  initialFocusTarget,
  splitRefreshTail,
  type ConfirmDialogProps,
} from "../../../ui/confirm-dialog/ConfirmDialog";
import styles from "../../../ui/confirm-dialog/ConfirmDialog.module.css";

// SYSTEM.md §7-17(⑮, DR-12 · DR-20) — 공용 확인 모달·시트. jsdom 없이
// (environment: "node") react-dom/server의 renderToStaticMarkup으로
// 정적 HTML을 만들어 슬롯·파생 라벨·목록형을 문자열로 단언한다. 포커스
// 이동·Esc·showModal은 useEffect 안이라 여기서 검증하지 않는다(E2E 몫).

// 「새로 고침」 다음 한 수가 useRouter를 부른다 — 앱 라우터 없이 정적 렌더하려고 막는다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

function render(props: Partial<ConfirmDialogProps> & Pick<ConfirmDialogProps, "title">) {
  const base = { open: true, onClose: () => {} };
  return renderToStaticMarkup(createElement(ConfirmDialog, { ...base, ...props } as ConfirmDialogProps));
}

describe("secondaryLabelFor — 2차 라벨 자동 파생(⑮, DR-12)", () => {
  it.each([
    ["견적 줄 삭제", "취소"],
    ["견적 줄 취소", "닫기"],
    ["승인 표시 취소", "닫기"],
    ["입력 버리기", "취소"],
  ])("secondaryLabelFor(%s) → %s", (primaryLabel, expected) => {
    expect(secondaryLabelFor(primaryLabel)).toBe(expected);
  });
});

describe("initialFocusTarget — 첫 포커스 대상 표(⑮)", () => {
  it("확인 근거 칸이 있으면 evidence다", () => {
    expect(initialFocusTarget({ hasEvidence: true, hasPrimary: true })).toBe("evidence");
  });

  it("근거 칸이 없고 1차가 있으면(막혔어도) primary다", () => {
    expect(initialFocusTarget({ hasEvidence: false, hasPrimary: true, primaryBlocked: true })).toBe("primary");
  });

  it("목록형(1차 없음)이면 firstOption이다", () => {
    expect(initialFocusTarget({ optionCount: 3 })).toBe("firstOption");
  });
});

describe("ConfirmDialog — 정적 렌더(슬롯 · 파생 라벨 · 막힌 1차 · 목록형)", () => {
  it("제목 요소 id를 dialog aria-labelledby가 가리키고 부제가 렌더된다", () => {
    const html = render({
      title: "견적 줄 삭제",
      subtitle: "PT 제작 · 1,200,000원",
      primary: { label: "견적 줄 삭제", onConfirm: () => {} },
    });

    const labelledBy = html.match(/aria-labelledby="([^"]+)"/);
    expect(labelledBy).not.toBeNull();
    expect(html).toContain(`id="${labelledBy![1]!}"`);
    expect(html).toContain("PT 제작 · 1,200,000원");
  });

  it.each([[[], 0], [["보관함으로 옮겨짐 · 복원은 관리자"], 1], [["a", "b", "c"], 3]] as const)(
    "결과 줄이 준 개수(%j → %i)만큼 렌더된다",
    (lines, count) => {
      const html = render({
        title: "견적 줄 삭제",
        resultLines: [...lines],
        primary: { label: "견적 줄 삭제", onConfirm: () => {} },
      });
      const needle = new RegExp(`class="${styles.resultLine}"`, "g");
      const matches = html.match(needle) ?? [];
      expect(matches.length).toBe(count);
    },
  );

  it("확인 근거 칸(evidenceField)이 준 경우에만 렌더된다", () => {
    const withEvidence = render({
      title: "고객 승인 표시",
      evidenceField: createElement("input", { type: "date", "aria-label": "승인일" }),
      primary: { label: "승인 표시", onConfirm: () => {} },
    });
    expect(withEvidence).toContain('aria-label="승인일"');

    const withoutEvidence = render({
      title: "고객 승인 표시",
      primary: { label: "승인 표시", onConfirm: () => {} },
    });
    expect(withoutEvidence).not.toContain('aria-label="승인일"');
  });

  it("1차 kbd 기본값이 Ctrl+Enter이고, 2차 라벨이 1차에서 자동 파생된다", () => {
    const html = render({
      title: "견적 줄 삭제",
      primary: { label: "견적 줄 삭제", onConfirm: () => {} },
    });
    expect(html).toContain("Ctrl+Enter");
    // secondaryLabelFor("견적 줄 삭제") === "취소"
    expect(html).toMatch(/>취소<\/span>/);
  });

  it("사용자 결정(2026-09-29 A) — 행동 줄 DOM · Tab 순서는 2차(취소) → 1차(PC · 폰 모두 2차 왼쪽 · 1차 오른쪽)", () => {
    const html = render({
      title: "반려",
      primary: { label: "반려", onConfirm: () => {} },
    });
    const actions = html.slice(html.indexOf(`class="${styles.actions}"`));
    const secondaryAt = actions.indexOf(`class="${styles.secondaryWrap}"`);
    const primaryAt = actions.indexOf(`class="${styles.primaryWrap}"`);
    expect(secondaryAt).toBeGreaterThan(-1);
    expect(primaryAt).toBeGreaterThan(secondaryAt);
  });

  it("막힌 1차(disabledReason)는 aria-disabled고 이유 글자가 보인다", () => {
    const html = render({
      title: "고객 승인 표시",
      primary: { label: "승인 표시", onConfirm: () => {}, disabledReason: "승인일 없음 · 날짜 없음 · 날짜 고르기" },
    });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("승인일 없음 · 날짜 없음 · 날짜 고르기");
  });

  it("blockedBy(04-24 — 근거 칸 오류 id)면 1차는 aria-disabled이고 그 id를 가리키며, 1차 왼쪽 이유 자리는 비어 있다", () => {
    const html = render({
      title: "고객 승인 표시",
      evidenceField: createElement("p", { id: "approval-date-error" }, "날짜 형식 오류 · 2026-09-18처럼"),
      primary: { label: "고객 승인 표시", onConfirm: () => {}, blockedBy: "approval-date-error" },
    });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-describedby="approval-date-error"');
    expect(html.match(/날짜 형식 오류/g)).toHaveLength(1);
    expect(html).not.toContain(`class="${styles.reason}"`);
  });

  // 04.3-17 — 다시 누를 수 있는 실패 줄(DECISIONS 2026-09-30 §7-17 실패 줄): 1차 왼쪽 막힘 자리에 role="alert", 1차는 막지 않는다.
  it("primary.failure만 있으면 1차 왼쪽 이유 자리에 role=alert 줄이 서고 1차는 aria-disabled가 아니다", () => {
    const html = render({
      title: "링크 닫기",
      primary: { label: "링크 닫기", onConfirm: () => {}, failure: "닫지 못했습니다 · 다시 시도" },
    });
    expect(html).toContain(`<span class="${styles.reason}" role="alert">닫지 못했습니다 · 다시 시도</span>`);
    expect(html).not.toContain('aria-disabled="true"');
    const actions = html.slice(html.indexOf(`class="${styles.actions}"`));
    expect(actions.indexOf("닫지 못했습니다")).toBeLessThan(actions.indexOf(`class="${styles.primaryWrap}"`));
  });

  // 04.3-17 독립 검토 X1 · DOM 감사 C-H1 · C-M1 — 실패 줄은 막힘 묶음(.blocker) 안이다: 폰은 버튼 윗줄 전체 폭(1차 = 2차 × 2 유지),
  // 다음 한 수(nextStep)와 함께 와도 둘 다 선다.
  it("failure 줄은 .blocker 묶음 안에 role=alert로 선다(폰 버튼 윗줄 전체 폭)", () => {
    const html = render({
      title: "링크 닫기",
      primary: { label: "링크 닫기", onConfirm: () => {}, failure: "링크 닫기 실패 · 다시 시도" },
    });
    expect(html).toContain(
      `<span class="${styles.blocker}"><span class="${styles.reason}" role="alert">링크 닫기 실패 · 다시 시도</span></span>`,
    );
  });

  it("failure + nextStep이면 실패 줄 → 다음 한 수 순서로 둘 다 서고 1차는 막지 않는다", () => {
    const html = render({
      title: "대조 제외",
      primary: {
        label: "대조 제외",
        onConfirm: () => {},
        failure: "대조 제외 실패 · 다시 시도",
        nextStep: createElement("button", { type: "button" }, "다시 불러오기"),
      },
    });
    expect(html).toContain(
      `<span class="${styles.blocker}"><span class="${styles.reason}" role="alert">대조 제외 실패 · 다시 시도</span><span class="${styles.nextStep}"><button type="button">다시 불러오기</button></span></span>`,
    );
    expect(html).not.toContain('aria-disabled="true"');
  });

  it("disabledReason이 있으면 그것만 그리고 failure는 그리지 않는다", () => {
    const html = render({
      title: "링크 닫기",
      primary: { label: "링크 닫기", onConfirm: () => {}, disabledReason: "권한 없음", failure: "닫지 못했습니다 · 다시 시도" },
    });
    expect(html).toContain("권한 없음");
    expect(html).not.toContain("닫지 못했습니다");
    expect(html).not.toContain('role="alert"');
  });

  it("목록형(options)은 1차가 없고 행마다 라벨 + 설명이 있다", () => {
    const html = render({
      title: "상태 바꾸기",
      options: [
        { label: "진행", description: "기간이 시작됨", onSelect: () => {} },
        { label: "미수주", description: "번호가 결번됨", onSelect: () => {} },
      ],
    });
    expect(html).toContain("진행");
    expect(html).toContain("기간이 시작됨");
    expect(html).toContain("미수주");
    expect(html).toContain("번호가 결번됨");
    expect(html).not.toContain("Ctrl+Enter");
  });

  it("목록형(options)도 2차 `취소 Esc`가 있다 — UI-SPEC rev 5 Copywriting 「상태 고르기 목록」(04-21)", () => {
    const html = render({
      title: "상태 바꾸기",
      secondaryLabel: "취소",
      options: [{ label: "진행", onSelect: () => {} }],
    });
    expect(html).toMatch(/<button[^>]*><span>취소<\/span><kbd[^>]*>Esc<\/kbd><\/button>/);
  });

  it("폰 머리의 닫기 x에 aria-label=\"닫기\"가 있다", () => {
    const html = render({
      title: "견적 줄 삭제",
      primary: { label: "견적 줄 삭제", onConfirm: () => {} },
    });
    expect(html).toContain('aria-label="닫기"');
  });
});

// 2026-10-01(SYSTEM.md §7-17 ERROR · DECISIONS.md 같은 날) — 막힘 이유 끝의 ` · 새로 고침`은 글자가 아니라 다음 한 수 3차 버튼이다.
// 컴포넌트가 강제한다(호출처 status-change · revision-dialogs · decision-dialogs가 같은 모양).
describe("ConfirmDialog — 「· 새로 고침」 꼬리 → 3차 「새로 고침」", () => {
  it.each([
    ["상태가 미수주로 바뀜 · 새로 고침", { reason: "상태가 미수주로 바뀜", refresh: true }],
    ["다른 사람이 먼저 새 차수를 만듦 · 새로 고침", { reason: "다른 사람이 먼저 새 차수를 만듦", refresh: true }],
    ["사유 없음 · 사유 적기", { reason: "사유 없음 · 사유 적기", refresh: false }],
    [undefined, { reason: undefined, refresh: false }],
  ])("splitRefreshTail(%s)", (input, expected) => {
    expect(splitRefreshTail(input)).toEqual(expected);
  });

  it("꼬리가 있으면 이유 글자에서 떼고 다음 한 수 자리에 「새로 고침」 버튼을 둔다", () => {
    const html = render({
      title: "진행으로 바꾸기",
      primary: { label: "진행으로 바꾸기", onConfirm: () => {}, disabledReason: "상태가 미수주로 바뀜 · 새로 고침" },
    });
    expect(html).toContain("상태가 미수주로 바뀜");
    expect(html).not.toContain("· 새로 고침");
    expect(html).toMatch(new RegExp(`class="${styles.nextStep}"><span[^>]*><button[^>]*><span>새로 고침</span>`));
    expect(html).toContain('aria-disabled="true"');
  });

  it("꼬리가 있으면 호출처가 준 다음 한 수 대신 「새로 고침」이 서고, 꼬리가 없으면 호출처 것이 그대로다", () => {
    const withStep = (disabledReason: string) =>
      render({
        title: "진행으로 바꾸기",
        primary: {
          label: "진행으로 바꾸기",
          onConfirm: () => {},
          disabledReason,
          nextStep: createElement("button", { type: "button" }, "기간 적기"),
        },
      });
    const tailed = withStep("상태가 진행으로 바뀜 · 새로 고침");
    expect(tailed).not.toContain("· 새로 고침");
    expect(tailed).toContain("<span>새로 고침</span>");
    expect(tailed).not.toContain("기간 적기");
    const plain = withStep("시작일 없음 · 기간 적기");
    expect(plain).toContain("시작일 없음 · 기간 적기");
    expect(plain).toContain(">기간 적기</button>");
    expect(plain).not.toContain("<span>새로 고침</span>");
  });
});
