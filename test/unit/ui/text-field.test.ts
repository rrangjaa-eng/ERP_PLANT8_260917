import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextField } from "../../../ui/input/TextField";
import styles from "../../../ui/input/TextField.module.css";

// 04.3-02 UI-SPEC 개정 ⑦(a) — 외부 수령자 화면 전용 크기 변형.
describe("TextField — size external(04.3-02 ⑦(a))", () => {
  it("size를 주지 않으면 기존 모양 그대로다(external 클래스 없음)", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "x", label: "이름" }));
    expect(html).not.toContain(styles.external);
  });

  it("size='external'이면 external 클래스가 붙는다", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "x", label: "이름", size: "external" }));
    expect(html).toContain(styles.external);
  });
});
