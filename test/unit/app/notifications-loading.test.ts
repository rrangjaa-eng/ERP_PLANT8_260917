import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotificationsLoading from "@/app/(app)/notifications/loading";

// 07-19 C-P2-7 — 알림함 loading 뼈대의 「시각」 머리글이 로드 뒤 표(inbox-list.tsx `headerClassName`)와 같은 폭 클래스(`.time`)를 받는다.
describe("알림함 loading 뼈대", () => {
  it("「시각」 머리글만 time 클래스를 가진다", () => {
    const markup = renderToStaticMarkup(createElement(NotificationsLoading));
    const headers = [...markup.matchAll(/<th[^>]*class="([^"]*)"[^>]*>([^<]*)<\/th>/g)].map((match) => ({ className: match[1] ?? "", text: match[2] ?? "" }));
    expect(headers.map((header) => header.text)).toEqual(["내용", "시각"]);
    expect(headers[0]?.className).not.toMatch(/time/);
    expect(headers[1]?.className).toMatch(/time/);
  });
});
