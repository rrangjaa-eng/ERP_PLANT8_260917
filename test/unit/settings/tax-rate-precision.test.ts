import { describe, expect, it } from "vitest";
import {
  TAX_COMPANY_BORNE_RATE,
  TAX_VAT_RATE,
  TAX_WITHHOLDING_BUSINESS_INCOME_RATE,
  TAX_WITHHOLDING_OTHER_INCOME_RATE,
} from "@/domain/settings/keys";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";

// domain/money의 round()가 value / unit을 소수 여섯째 자리로 정규화한다 — 세율이
// 소수 넷째 자리까지라는 전제다. 더 긴 세율(예: 0.9999996 × 1원 truncate)은 정규화가
// 결과를 바꾸므로 저장 단계에서 막는다.
const RATE_KEYS = [
  TAX_VAT_RATE,
  TAX_WITHHOLDING_OTHER_INCOME_RATE,
  TAX_WITHHOLDING_BUSINESS_INCOME_RATE,
  TAX_COMPANY_BORNE_RATE,
];

describe.each(RATE_KEYS.map((def) => [def.key, def] as const))("세율 정밀도: %s", (_key, def) => {
  it.each([0, 0.1, 0.088, 0.033, 0.22, 0.0001])("허용: %s", (value) => {
    expect(def.schema.safeParse(value).success).toBe(true);
  });

  it.each([0.9999996, 0.12345])("거부: %s", (value) => {
    const result = def.schema.safeParse(value);
    if (result.success) throw new Error(`거부돼야 할 ${value}가 통과했다`);
    expect(koreanZodErrorMessage(result.error)).toBe("소수 넷째 자리까지만 가능 · 값 확인");
  });
});

describe("세율 정밀도: 1(100%)", () => {
  it.each([TAX_VAT_RATE, TAX_WITHHOLDING_OTHER_INCOME_RATE, TAX_WITHHOLDING_BUSINESS_INCOME_RATE])(
    "$key는 1을 허용한다",
    (def) => {
      expect(def.schema.safeParse(1).success).toBe(true);
    },
  );
});
