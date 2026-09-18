import { describe, expect, it } from "vitest";
import { checkPoolRule, parsePoolEnv, PoolRuleInputError } from "@/domain/ops/pool-rule";

describe("checkPoolRule", () => {
  it("여유 있으면 ok, used/limit/headroom을 반환한다", () => {
    const result = checkPoolRule({ maxInstances: 3, poolMax: 5, maxConnections: 25 });
    expect(result).toEqual({ ok: true, used: 15, limit: 20, headroom: 5 });
  });

  it("경계: used === limit이면 허용한다(20 <= 20)", () => {
    const result = checkPoolRule({ maxInstances: 4, poolMax: 5, maxConnections: 25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.used).toBe(20);
      expect(result.limit).toBe(20);
      expect(result.headroom).toBe(0);
    }
  });

  it("경계: used가 limit보다 1 크면 거부한다(25 > 20)", () => {
    const result = checkPoolRule({ maxInstances: 5, poolMax: 5, maxConnections: 25 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.used).toBe(25);
      expect(result.limit).toBe(20);
      expect(result.reason).toContain("25 > 20");
    }
  });

  it("used === limit 다른 조합도 허용한다(1*20=20 <= 20)", () => {
    const result = checkPoolRule({ maxInstances: 1, poolMax: 20, maxConnections: 25 });
    expect(result.ok).toBe(true);
  });

  it("경계: 20 > 19면 거부한다(4*5=20, maxConnections 24)", () => {
    const result = checkPoolRule({ maxInstances: 4, poolMax: 5, maxConnections: 24 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.used).toBe(20);
      expect(result.limit).toBe(19);
    }
  });

  it("15 <= 19면 허용한다(3*5=15, maxConnections 24)", () => {
    const result = checkPoolRule({ maxInstances: 3, poolMax: 5, maxConnections: 24 });
    expect(result.ok).toBe(true);
  });

  it("비정수 maxInstances는 PoolRuleInputError를 던진다", () => {
    expect(() => checkPoolRule({ maxInstances: 3.5, poolMax: 5, maxConnections: 25 })).toThrow(
      PoolRuleInputError,
    );
  });

  it("maxConnections가 0이면 PoolRuleInputError를 던진다", () => {
    expect(() => checkPoolRule({ maxInstances: 1, poolMax: 1, maxConnections: 0 })).toThrow(
      PoolRuleInputError,
    );
  });
});

describe("parsePoolEnv", () => {
  it("정수 문자열을 파싱한다", () => {
    expect(parsePoolEnv({ MAX_INSTANCES: "3", DB_POOL_MAX: "5" })).toEqual({
      maxInstances: 3,
      poolMax: 5,
    });
  });

  it("비정수 문자열('3.5')은 PoolRuleInputError를 던진다", () => {
    expect(() => parsePoolEnv({ MAX_INSTANCES: "3.5", DB_POOL_MAX: "5" })).toThrow(
      PoolRuleInputError,
    );
  });

  it("숫자가 아닌 문자열('abc')은 PoolRuleInputError를 던진다", () => {
    expect(() => parsePoolEnv({ MAX_INSTANCES: "abc", DB_POOL_MAX: "5" })).toThrow(
      PoolRuleInputError,
    );
  });

  it("빈 문자열('')은 PoolRuleInputError를 던진다", () => {
    expect(() => parsePoolEnv({ MAX_INSTANCES: "", DB_POOL_MAX: "5" })).toThrow(
      PoolRuleInputError,
    );
  });

  it("MAX_INSTANCES 미설정이면 PoolRuleInputError를 던진다(호출자가 스킵 여부 결정)", () => {
    expect(() => parsePoolEnv({ DB_POOL_MAX: "5" })).toThrow(PoolRuleInputError);
  });
});
