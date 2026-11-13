// domain/custom-fields/build-schema.ts — 필드 정의(field_definitions)에서
// zod 검증 스키마를 조립한다(03-RESEARCH.md Code Examples 4 실측 그대로).
// ROADMAP: 서버 액션이 저장 전에 이 스키마로 검증해 미등록 키·타입 불일치를
// 거부한다. `.strict()`를 명시하지 않으면 zod object()의 기본 동작은
// 등록되지 않은 키를 조용히 걸러낼 뿐 거부하지 않는다(이번 세션 node -e로
// 확인) — 그래서 명시적으로 strict 모드를 켠다.
import { z } from "zod";

export type FieldDefType = "text" | "number" | "date" | "select";

export type FieldDef = {
  key: string;
  type: FieldDefType;
  options?: string[];
  /** field_definitions.required 컬럼 기본값이 false다 — required가 명시적으로
   * true인 필드만 필수로 만들고, 그 외(false·undefined)는 전부 선택으로 감싼다. */
  required?: boolean;
};

// 07.5-01 D-7521 · A18: 날짜 칸 오류 글자 — 내부 화면 명사형(DECISIONS 2026-09-26). 03의 표 셀과 같은 글자.
export const CUSTOM_DATE_INVALID_MESSAGE = "날짜 아님 · 2026-11-04처럼";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// 실존하는 YYYY-MM-DD만 — 정규식 뒤 UTC로 되짚어 2026-02-31 같은 넘침 날짜(관대 파싱은 3월 3일로 읽는다)를 막는다.
export function isStrictIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// 날짜 칸 — 문자열은 엄격 ISO만(통과하면 지금처럼 Date로), Date 값은 날짜 글자로 바꿔 같은 판정을 거친다.
const strictDate = z.preprocess(
  (value) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : value),
  z
    .string()
    .refine(isStrictIsoDate, { message: CUSTOM_DATE_INVALID_MESSAGE })
    .transform((value) => new Date(value)),
);

function baseSchemaFor(def: FieldDef): z.ZodType {
  switch (def.type) {
    case "text":
      return z.string();
    case "number":
      return z.coerce.number();
    case "date":
      return strictDate;
    case "select":
      return z.enum((def.options ?? []) as [string, ...string[]]);
  }
}

export function buildCustomFieldsSchema(defs: FieldDef[]): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const def of defs) {
    const base = baseSchemaFor(def);
    shape[def.key] = def.required === true ? base : base.optional();
  }
  return z.object(shape).strict();
}
