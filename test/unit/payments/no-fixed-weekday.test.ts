import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 07-01 Task 3(D-715 · B-P3-3): 요일 셈은 domain/payments/pay-schedule.ts 한 곳에서만 — 260907의 「목요일 고정 알림」 버그(요일 상수가 여러 곳에
// 흩어져 지급 요일 설정을 따르지 않음) 재발 금지. 허용 목록은 파일 · 함수 이름으로 고정한다(줄 번호 아님): pay-schedule.ts 전체 +
// targets.ts `payWeekLabel`(지급 완료 목록의 주 시작 월요일 셈) 한 줄. 다른 파일이 걸리면 그 코드를 pay-schedule 호출로 바꾼다.
// domain/next-turn: 홈 「내 차례」 지급 묶음의 「이번 주」도 지급 주다(D-715) — 07-06 검토 F(sundayOf).
const ROOT = process.cwd();
const SCANNED = ["domain/payments", "domain/rules", "domain/notify", "domain/next-turn"];
const WEEKDAY_CALL = /getU?T?C?Day\(|isodow/;
const PAY_SCHEDULE = "domain/payments/pay-schedule.ts";
const TARGETS = "domain/payments/targets.ts";

function tsFiles(dir: string): string[] {
  const absolute = resolve(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) return tsFiles(relative(ROOT, path));
    return name.endsWith(".ts") ? [relative(ROOT, path)] : [];
  });
}

type Hit = { file: string; line: number; text: string };

function hits(): Hit[] {
  return SCANNED.flatMap(tsFiles).flatMap((file) =>
    readFileSync(resolve(ROOT, file), "utf8")
      .split("\n")
      .flatMap((text, index) => (WEEKDAY_CALL.test(text) ? [{ file, line: index + 1, text }] : [])),
  );
}

// targets.ts에서 `function payWeekLabel(` 본문(다음 맨 앞 `}`까지)의 줄 범위.
function payWeekLabelRange(): { from: number; to: number } {
  const lines = readFileSync(resolve(ROOT, TARGETS), "utf8").split("\n");
  const from = lines.findIndex((text) => text.startsWith("function payWeekLabel("));
  expect(from, "targets.ts에 payWeekLabel 함수가 있어야 한다").toBeGreaterThan(-1);
  const to = lines.findIndex((text, index) => index > from && text.startsWith("}"));
  return { from: from + 1, to: to + 1 };
}

describe("요일 셈은 pay-schedule.ts 한 곳 (D-715 · K7)", () => {
  it("domain/payments · rules · notify · next-turn에서 getDay( · getUTCDay( · isodow는 pay-schedule.ts와 payWeekLabel 한 줄뿐", () => {
    const range = payWeekLabelRange();
    const found = hits();
    const outside = found.filter((hit) => hit.file !== PAY_SCHEDULE && !(hit.file === TARGETS && hit.line >= range.from && hit.line <= range.to));
    expect(outside).toEqual([]);
    expect(found.filter((hit) => hit.file === TARGETS)).toHaveLength(1);
    expect(found.some((hit) => hit.file === PAY_SCHEDULE)).toBe(true);
  });

  it("정규식이 흔한 꼴을 잡는다(`!==` · `+ 6` · `% 7` 비교 · isodow SQL)", () => {
    for (const text of ["if (d.getDay() !== 4) return", "(at.getUTCDay() + 6) % 7", "extract(isodow from now())", "x.getUTCDay()===5"]) expect(WEEKDAY_CALL.test(text)).toBe(true);
    expect(WEEKDAY_CALL.test("payWeekdayChar(date)")).toBe(false);
  });
});
