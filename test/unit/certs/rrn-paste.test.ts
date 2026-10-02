import { describe, expect, it } from "vitest";
import { shouldAdvance, splitRrnPaste } from "@/app/c/[token]/rrn-paste";

// 04.3-06 Task 2 ① — 주민등록번호 두 칸의 붙여넣기 나누기 · 자동 이동 판정(순수).

describe("splitRrnPaste", () => {
  it("13자리 → 앞 6 · 뒤 7", () => {
    expect(splitRrnPaste("9304122123458")).toEqual({ front: "930412", back: "2123458" });
  });

  it("하이픈이 있어도 같다", () => {
    expect(splitRrnPaste("930412-2123458")).toEqual({ front: "930412", back: "2123458" });
  });

  it("짧으면 앞 칸에 숫자만", () => {
    expect(splitRrnPaste("93041")).toEqual({ front: "93041", back: null });
  });

  it("숫자 아닌 글자는 버리고 앞 칸 6자리까지", () => {
    expect(splitRrnPaste("abc930412")).toEqual({ front: "930412", back: null });
    expect(splitRrnPaste("93041212345")).toEqual({ front: "930412", back: null });
  });
});

describe("shouldAdvance", () => {
  it("끝에서 쳐 넣어 6자리가 차면 true", () => {
    expect(shouldAdvance({ inputType: "insertText", caretAtEnd: true, length: 6 })).toBe(true);
  });

  it("지우기면 false", () => {
    expect(shouldAdvance({ inputType: "deleteContentBackward", caretAtEnd: true, length: 6 })).toBe(false);
  });

  it("캐럿이 중간이면 false", () => {
    expect(shouldAdvance({ inputType: "insertText", caretAtEnd: false, length: 6 })).toBe(false);
  });

  it("길이 5면 false", () => {
    expect(shouldAdvance({ inputType: "insertText", caretAtEnd: true, length: 5 })).toBe(false);
  });
});
