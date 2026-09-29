import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 묶음 ④ /review R13 — 앱 전용 클립보드 형식(MIME)은 한 곳(ui/table/use-clipboard-paste.ts APP_CLIPBOARD_FORMAT)에만 적는다.
// 복사하는 쪽(Table.tsx)이 문자열을 따로 적으면 읽는 쪽과 어긋나도 알 수 없다.
describe("ui/table/Table.tsx — 복사 MIME은 APP_CLIPBOARD_FORMAT 상수", () => {
  const source = readFileSync(resolve(process.cwd(), "ui", "table", "Table.tsx"), "utf8");

  it("MIME 문자열을 코드에 직접 쓰지 않는다", () => {
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("/*") && !line.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toContain('"application/x-plant8-quote-lines+json"');
  });

  it("setData에 APP_CLIPBOARD_FORMAT을 넘긴다", () => {
    expect(source).toMatch(/setData\(APP_CLIPBOARD_FORMAT,/);
  });
});
