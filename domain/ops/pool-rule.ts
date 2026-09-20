import { UserFacingError } from "@/lib/actions/user-facing-error";
// 16A 커넥션 규칙: max-instances × pool ≤ max_connections − 5. 경계값(정확히
// max_connections − 5)은 허용, 1 넘으면 거부. 정수 산술만 쓰고 비정수·비숫자
// 입력은 거부한다(반올림·부동소수 없음, Pitfall 3/A2 — 실측 max_connections를
// 검사에 쓴다. 이 모듈은 그 값을 받기만 하고 직접 조회하지 않는다).

export class PoolRuleInputError extends UserFacingError {}

export type PoolRuleInput = {
  maxInstances: number;
  poolMax: number;
  maxConnections: number;
};

export type PoolRuleResult =
  | { ok: true; used: number; limit: number; headroom: number }
  | { ok: false; used: number; limit: number; reason: string };

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PoolRuleInputError(`${name}은 양의 정수여야 합니다`);
  }
}

export function checkPoolRule(input: PoolRuleInput): PoolRuleResult {
  assertPositiveInteger(input.maxInstances, "maxInstances");
  assertPositiveInteger(input.poolMax, "poolMax");
  assertPositiveInteger(input.maxConnections, "maxConnections");

  const used = input.maxInstances * input.poolMax;
  const limit = input.maxConnections - 5;

  if (used <= limit) {
    return { ok: true, used, limit, headroom: limit - used };
  }

  return {
    ok: false,
    used,
    limit,
    reason: `${used} > ${limit} (max_instances ${input.maxInstances} × pool ${input.poolMax} > max_connections ${input.maxConnections} − 5)`,
  };
}

const INTEGER_STRING = /^-?\d+$/;

function parseIntegerEnvValue(value: string | number | undefined, name: string): number {
  if (value === undefined) {
    throw new PoolRuleInputError(`${name}이 설정되지 않았습니다`);
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new PoolRuleInputError(`${name}은 정수여야 합니다`);
    }
    return value;
  }
  if (!INTEGER_STRING.test(value)) {
    throw new PoolRuleInputError(`${name}은 정수 문자열이어야 합니다`);
  }
  return Number.parseInt(value, 10);
}

export function parsePoolEnv(env: {
  MAX_INSTANCES?: string | number;
  DB_POOL_MAX?: string | number;
}): { maxInstances: number; poolMax: number } {
  return {
    maxInstances: parseIntegerEnvValue(env.MAX_INSTANCES, "MAX_INSTANCES"),
    poolMax: parseIntegerEnvValue(env.DB_POOL_MAX, "DB_POOL_MAX"),
  };
}
