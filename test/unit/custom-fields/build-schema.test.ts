import { describe, expect, it } from "vitest";
import { buildCustomFieldsSchema } from "@/domain/custom-fields/build-schema";

// ROADMAP: 커스텀 필드는 서버 액션이 저장 전에 필드 정의에서 zod 스키마를
// 조립해 검증한다(미등록 키·타입 불일치 거부). 03-RESEARCH.md Code Examples 4
// 실측 그대로 네 타입(text/number/date/select)을 매핑한다.
describe("buildCustomFieldsSchema", () => {
  const defs = [
    { key: "note", type: "text" as const },
    { key: "budget", type: "number" as const },
    { key: "dueDate", type: "date" as const },
    { key: "priority", type: "select" as const, options: ["low", "high"] },
    { key: "optionalNote", type: "text" as const, required: false },
  ];

  it("네 타입을 각각 문자열·강제변환 수치·강제변환 날짜·열거로 조립한다", () => {
    const schema = buildCustomFieldsSchema(defs);
    const result = schema.safeParse({
      note: "메모",
      budget: "1000",
      dueDate: "2026-01-01",
      priority: "high",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.note).toBe("메모");
      expect(data.budget).toBe(1000);
      expect(data.dueDate).toBeInstanceOf(Date);
      expect(data.priority).toBe("high");
    }
  });

  it("등록되지 않은 키를 거부한다", () => {
    const schema = buildCustomFieldsSchema(defs);
    const result = schema.safeParse({
      note: "메모",
      budget: 1000,
      dueDate: "2026-01-01",
      priority: "high",
      unregisteredKey: "값",
    });
    expect(result.success).toBe(false);
  });

  it("타입이 맞지 않는 값을 거부한다 — select에 등록되지 않은 선택지", () => {
    const schema = buildCustomFieldsSchema(defs);
    const result = schema.safeParse({
      note: "메모",
      budget: 1000,
      dueDate: "2026-01-01",
      priority: "medium",
    });
    expect(result.success).toBe(false);
  });

  it("타입이 맞지 않는 값을 거부한다 — number에 강제 변환할 수 없는 문자열", () => {
    const schema = buildCustomFieldsSchema(defs);
    const result = schema.safeParse({
      note: "메모",
      budget: "숫자아님",
      dueDate: "2026-01-01",
      priority: "high",
    });
    expect(result.success).toBe(false);
  });

  it("required가 아닌 필드는 생략을 허용한다", () => {
    const schema = buildCustomFieldsSchema(defs);
    const result = schema.safeParse({
      note: "메모",
      budget: 1000,
      dueDate: "2026-01-01",
      priority: "high",
      // optionalNote 생략
    });
    expect(result.success).toBe(true);
  });

  it("required 필드가 없으면 거부한다", () => {
    const schema = buildCustomFieldsSchema([{ key: "note", type: "text" as const, required: true }]);
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("빈 필드 정의 배열은 빈 객체만 허용한다", () => {
    const schema = buildCustomFieldsSchema([]);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ x: 1 }).success).toBe(false);
  });
});
