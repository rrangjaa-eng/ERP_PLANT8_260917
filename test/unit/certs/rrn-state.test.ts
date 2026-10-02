import { describe, expect, it } from "vitest";
import { RRN_AUTO_HIDE_MS } from "@/app/(app)/certs/submissions/[id]/rrn-state";

// 04.3-14 사용자 결정 ③ — I4에 드러난 평문 주민등록번호는 입력이 3분 없으면 가려진다(설정과 무관한 고정값).
describe("평문 자동 가림 시간", () => {
  it("3분(180000ms)이다", () => {
    expect(RRN_AUTO_HIDE_MS).toBe(180_000);
  });
});
