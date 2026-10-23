import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import NotificationRulesError from "@/app/(app)/admin/notification-rules/error";
import NotificationRulesLoading from "@/app/(app)/admin/notification-rules/loading";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 07-19 K18 — 규칙 화면의 로딩 · 조회 오류 경계. 정적 렌더에서는 눌림이 없어 ListEmpty가 받은 props를 가로채 retry 연결을 본다(실제 렌더는 그대로).
type EmptyProps = ComponentProps<typeof ListEmpty>;
const seen: EmptyProps[] = [];

vi.mock("@/ui/list-empty/ListEmpty", async (importActual) => {
  const actual = await importActual<typeof import("@/ui/list-empty/ListEmpty")>();
  return {
    ListEmpty: (props: EmptyProps) => {
      seen.push(props);
      return actual.ListEmpty(props);
    },
  };
});

describe("규칙 화면 오류 경계 error.tsx (K18)", () => {
  it("한 줄 `불러오기 실패 · 다시 시도`(명사형 — error-copy-noun-style) + 3차 `다시 시도` 버튼이고 눌림이 retry를 부른다", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const retry = vi.fn();
    const markup = renderToStaticMarkup(createElement(NotificationRulesError, { error: new Error("원문 오류"), retry }));
    expect(markup).toContain("불러오기 실패 · 다시 시도");
    expect(markup).toMatch(/<button[^>]*>다시 시도<\/button>/);
    expect(markup).toContain("알림 규칙");
    expect(markup).not.toContain("원문 오류");
    const props = seen.at(-1);
    expect(props?.tone).toBe("error");
    const action = props?.action;
    expect(action && "onClick" in action ? action.label : null).toBe("다시 시도");
    if (action && "onClick" in action) action.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("규칙 화면 로딩 뼈대 loading.tsx (K18)", () => {
  it("표 행 모양 뼈대 — 열 다섯 머리(규칙 · 일수 · 켬 · 받는 사람 · 이메일)와 행 셋", () => {
    const markup = renderToStaticMarkup(createElement(NotificationRulesLoading));
    expect(markup).toContain("알림 규칙");
    const headers = [...markup.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toEqual(["규칙", "일수", "켬", "받는 사람", "이메일"]);
    expect(markup.match(/<tr/g)?.length).toBe(4);
  });
});
