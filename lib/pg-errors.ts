// node-postgres(pg) DatabaseError는 unique 위반 시 code="23505" + constraint에
// 제약 이름을 담는다(pg-protocol/dist/parser.js 실측: message.code = fields.C,
// message.constraint = fields.n). drizzle-orm의 pg-core 세션은 모든 쿼리 오류를
// DrizzleQueryError로 감싸고 원본은 .cause에 넣는다(drizzle-orm/errors.cjs 실측) —
// 그래서 여기서 오류 자체와 .cause 둘 다 본다. domain 계층이 "이 특정 unique
// 제약 위반인가"를 판단해 UserFacingError로 바꿔치기할 때 쓴다(defect 1 —
// 중복 법인카드 등록 시 원시 SQL이 새던 사례의 구체적 수정).
type PgErrorShape = { code?: unknown; constraint?: unknown };

function asPgErrorShape(value: unknown): PgErrorShape | null {
  return value !== null && typeof value === "object" ? value : null;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof Error)) return false;

  const candidates = [asPgErrorShape(error), asPgErrorShape(error.cause)];
  return candidates.some((candidate) => candidate?.code === "23505" && candidate?.constraint === constraint);
}
