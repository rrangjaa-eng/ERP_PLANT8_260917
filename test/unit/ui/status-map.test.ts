import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListEmpty } from "../../../ui/list-empty/ListEmpty";
import { STATUS_KIND, statusKind, type StatusKind, type StatusWord } from "../../../ui/status-tag/status-map";
import { StatusTag } from "../../../ui/status-tag/StatusTag";

// 04.6-05 Task 2 — 상태 배지 색은 status-map.ts 한 표가 정한다(SC 9 · T-04.6-23). UI-SPEC 「공용 컴포넌트 계약」 상태 배지 표 +
// 지금 호출부가 kind와 함께 쓰는 낱말 + 확인증 낱말 여섯(Round 2 Q8 — #88 SYSTEM §7-5 의미 목록).

const UI_SPEC_TABLE: Record<StatusKind, string[]> = {
  danger: ["막힘", "증빙 없음", "반려"],
  warning: ["오늘", "마감 임박", "마감 중", "정산"],
  accent: ["내 차례", "결재 중", "편집 중", "진행", "현재", "내 결재"],
  success: ["승인", "연결", "저장됨", "완료"],
  muted: ["대기", "미착수", "임시", "미수주", "취소", "회수", "첫 로그인 전", "임시 비밀번호 사용 중"],
};

// 지금 호출부(app/ · ui/)가 StatusTag kind와 함께 그리는 낱말과 그 kind — 실행 때 `grep -rn "<StatusTag" app ui`와 각 지역 맵으로 센 목록.
const CURRENT_CALL_SITES: Record<StatusKind, string[]> = {
  danger: ["막힘", "반려", "담당 없음"],
  warning: ["오늘", "정산"],
  accent: ["결재", "내 결재", "결재 중", "현재", "진행", "지출결의 중"],
  success: ["승인", "완료", "확정", "적용 중", "본인 승인"],
  muted: [
    "대기", "임시", "회수", "수주중", "미수주", "보관됨", "숨김", "비활성", "후보", "예정", "확인 불가", "미설정",
    "첫 로그인 전", "임시 비밀번호 사용 중", "작성 중", "무효",
  ],
};

// Q8 — #88 확인증 낱말 여섯.
const CERT_WORDS: [string, StatusKind][] = [
  ["접수 중", "accent"],
  ["제출됨", "success"],
  ["신청됨", "muted"],
  ["접수 전", "muted"],
  ["닫힘", "muted"],
  ["대조 제외", "muted"],
];

// 06 SP-2 — Phase 6 낱말 아홉(06-01이 한꺼번에 더한다). 표에 실제로 있어야 하므로 `in STATUS_KIND`도 함께 단언한다
// (statusKind는 표 밖 낱말에 accent를 돌려주므로 accent 낱말은 색만으로는 표 유무를 가르지 못한다).
const PHASE6_WORDS: [string, StatusKind][] = [
  ["구매 요청 중", "accent"],
  ["확인 전", "accent"],
  ["지급 완료", "success"],
  ["카드 사용", "success"],
  ["확인됨", "success"],
  ["구매 완료", "success"],
  ["발행됨", "success"],
  ["선결제", "warning"],
  ["면제", "muted"],
  // 06-28 S23 — 반려 · 회수 지출결의 종결(처음 쓰는 플랜이 더한다 — REVIEWS C2).
  ["종결", "muted"],
];

describe("status-map — 낱말 → 색 한 표", () => {
  for (const [kind, words] of Object.entries(UI_SPEC_TABLE) as [StatusKind, string[]][]) {
    for (const word of words) {
      it(`UI-SPEC 표: ${word} → ${kind}`, () => {
        expect(statusKind(word as StatusWord)).toBe(kind);
      });
    }
  }

  for (const [kind, words] of Object.entries(CURRENT_CALL_SITES) as [StatusKind, string[]][]) {
    for (const word of words) {
      it(`지금 호출부: ${word} → ${kind}(지금 kind와 같다)`, () => {
        expect(statusKind(word as StatusWord)).toBe(kind);
      });
    }
  }

  for (const [word, kind] of CERT_WORDS) {
    it(`확인증(Q8): ${word} → ${kind}`, () => {
      expect(statusKind(word as StatusWord)).toBe(kind);
    });
  }

  for (const [word, kind] of PHASE6_WORDS) {
    it(`Phase 6(SP-2): ${word} → ${kind}`, () => {
      expect(word in STATUS_KIND, `${word}이 표에 있다`).toBe(true);
      expect(statusKind(word as StatusWord)).toBe(kind);
    });
  }

  // 06.2 SP-62-2 — 참여자 표의 글자 태그 둘(호출부는 06.2-12가 만든다 — CURRENT_CALL_SITES는 그때 더한다).
  describe("06.2 SP-62-2", () => {
    for (const word of ["퇴직", "담당 PM"] as const) {
      it(`${word} → muted(표에 있다)`, () => {
        expect(word in STATUS_KIND, `${word}이 표에 있다`).toBe(true);
        expect(statusKind(word)).toBe("muted");
      });
    }
  });

  it("Phase 6 기존 낱말은 같은 색으로 다시 쓴다(신청됨 · 증빙 없음 · 지출결의 중)", () => {
    expect(statusKind("신청됨")).toBe("muted");
    expect(statusKind("증빙 없음")).toBe("danger");
    expect(statusKind("지출결의 중")).toBe("accent");
  });

  it("`{단계} 결재 중`은 단계 이름과 무관하게 accent다", () => {
    expect(statusKind("1차 결재 중")).toBe("accent");
    expect(statusKind("팀장 결재 중")).toBe("accent");
  });

  it("표의 모든 값은 다섯 색 중 하나다", () => {
    const colors = new Set(["danger", "warning", "accent", "success", "muted"]);
    for (const [word, kind] of Object.entries(STATUS_KIND)) expect(colors.has(kind), word).toBe(true);
  });

  it("같은 낱말이 두 색을 갖지 않는다(표는 낱말마다 한 줄)", () => {
    const everyWord = [...Object.values(UI_SPEC_TABLE), ...Object.values(CURRENT_CALL_SITES), CERT_WORDS.map(([word]) => word)].flat();
    for (const word of everyWord) expect(word in STATUS_KIND, word).toBe(true);
  });

  it("표 밖 낱말은 타입 오류다", () => {
    // @ts-expect-error — 표에 없는 낱말
    void statusKind("처음 보는 낱말");
    // @ts-expect-error — 맨 낱말 `요청`은 표에 없다(구매 요청 중 · 신청됨을 쓴다)
    void statusKind("요청 중");
    // @ts-expect-error — status 낱말이 표 밖이면 StatusTag도 막는다
    void createElement(StatusTag, { status: "처음 보는 낱말" });
    void createElement(StatusTag, { status: "막힘" });
  });
});

describe("StatusTag — status 낱말을 받는다", () => {
  const render = (props: Record<string, unknown>): string => renderToStaticMarkup(createElement(StatusTag, props as never));

  it("status 낱말이 글자이고 색 클래스는 표에서 온다", () => {
    expect(render({ status: "막힘" })).toMatch(/<span class="[^"]*_danger_[^"]*"[^>]*>막힘<\/span>/);
    expect(render({ status: "승인", variant: "text" })).toMatch(/_success_[^"]*[^>]*>승인</);
    expect(render({ status: "접수 중" })).toMatch(/_accent_/);
    expect(render({ status: "닫힘" })).toMatch(/_muted_/);
  });

  it("kind prop은 없다 — 호출부가 색을 고를 수 없다(타입 오류 · SC 9)", () => {
    // @ts-expect-error — kind는 더 이상 받지 않는다(색은 status 낱말이 정한다)
    void createElement(StatusTag, { kind: "warning", status: "오늘" });
    const source = readFileSync(join(process.cwd(), "ui/status-tag/StatusTag.tsx"), "utf8");
    expect(source).not.toContain("@deprecated");
    expect(source).not.toMatch(/\bkind\??:/);
  });
});

describe("ListEmpty — 한 줄 + 넘겨받은 첫 행동 하나(2차 버튼 모양)", () => {
  const render = (props: Record<string, unknown>): string => renderToStaticMarkup(createElement(ListEmpty, props as never));

  it("data-ui=empty-state 한 줄 글과 링크 하나", () => {
    const markup = render({ message: "등록된 거래처가 없습니다", action: { label: "거래처 등록", href: "/admin/vendors?new=1" } });
    expect(markup).toContain('data-ui="empty-state"');
    expect(markup).toContain("등록된 거래처가 없습니다");
    expect(markup.match(/<a /g)).toHaveLength(1);
    expect(markup).toMatch(/<a [^>]*href="\/admin\/vendors\?new=1"[^>]*>거래처 등록<\/a>/);
  });

  it("행동은 2차 버튼 모양(ui/button의 btn · secondary 클래스)이다", () => {
    const markup = render({ message: "없습니다", action: { label: "보기", href: "/x" } });
    expect(markup).toMatch(/<a [^>]*class="[^"]*_btn_[^"]*"/);
    expect(markup).toMatch(/<a [^>]*class="[^"]*_secondary_[^"]*"/);
  });

  it("onClick 행동은 button이다", () => {
    const markup = render({ message: "불러오기 실패", tone: "error", action: { label: "다시 시도", onClick: () => undefined } });
    expect(markup).toMatch(/<button type="button"[^>]*class="[^"]*_secondary_[^"]*"[^>]*>다시 시도<\/button>/);
  });

  it("행동이 없는 화면은 글 한 줄만(명시 생략)", () => {
    const markup = render({ message: "보관함이 비어 있습니다" });
    expect(markup).toContain('data-ui="empty-state"');
    expect(markup).not.toMatch(/<a |<button/);
  });
});
