import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ConfirmDialog,
  secondaryLabelFor,
  initialFocusTarget,
  type ConfirmDialogProps,
} from "../../../ui/confirm-dialog/ConfirmDialog";
import styles from "../../../ui/confirm-dialog/ConfirmDialog.module.css";

// SYSTEM.md §7-17(⑮, DR-12 · DR-20) — 공용 확인 모달·시트. jsdom 없이
// (environment: "node") react-dom/server의 renderToStaticMarkup으로
// 정적 HTML을 만들어 슬롯·파생 라벨·목록형을 문자열로 단언한다. 포커스
// 이동·Esc·showModal은 useEffect 안이라 여기서 검증하지 않는다(E2E 몫).

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

  it("막힌 1차(disabledReason)는 aria-disabled고 이유 글자가 보인다", () => {
    const html = render({
      title: "고객 승인 표시",
      primary: { label: "승인 표시", onConfirm: () => {}, disabledReason: "승인일 없음 · 날짜를 골라 주세요" },
    });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("승인일 없음 · 날짜를 골라 주세요");
  });

  it("blockedBy(04-24 — 근거 칸 오류 id)면 1차는 aria-disabled이고 그 id를 가리키며, 1차 왼쪽 이유 자리는 비어 있다", () => {
    const html = render({
      title: "고객 승인 표시",
      evidenceField: createElement("p", { id: "approval-date-error" }, "날짜 형식이 아닙니다 · 2026-09-18처럼 적어 주세요"),
      primary: { label: "고객 승인 표시", onConfirm: () => {}, blockedBy: "approval-date-error" },
    });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-describedby="approval-date-error"');
    expect(html.match(/날짜 형식이 아닙니다/g)).toHaveLength(1);
    expect(html).not.toContain(`class="${styles.reason}"`);
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
