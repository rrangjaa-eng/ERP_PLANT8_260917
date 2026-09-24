import { describe, expect, it } from "vitest";
import { recentFxRate, rememberFxRate } from "@/domain/money/currency";

// 버그: rememberFxRate가 검증 없이 아무 값이나 저장해서, fxRate 0을 저장하면
// FX_RECENT_RATE_USD 스키마(z.coerce.number().positive())를 어겨 recentFxRate가
// 파싱 실패로 던진다 — 프로젝트 상세 화면이 이 값을 기다리다 전부 깨진다.
describe("rememberFxRate 유효성 검사(fxRate 0 저장 방지)", () => {
  it("잘못된 값(0)을 저장해도 recentFxRate는 던지지 않고 기존 유효값을 유지한다", async () => {
    await rememberFxRate("USD", 1350);
    expect(await recentFxRate("USD")).toBe(1350);

    await rememberFxRate("USD", 0);

    await expect(recentFxRate("USD")).resolves.toBe(1350);
  });
});
