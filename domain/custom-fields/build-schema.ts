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

function baseSchemaFor(def: FieldDef): z.ZodType {
  switch (def.type) {
    case "text":
      return z.string();
    case "number":
      return z.coerce.number();
    case "date":
      return z.coerce.date();
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
