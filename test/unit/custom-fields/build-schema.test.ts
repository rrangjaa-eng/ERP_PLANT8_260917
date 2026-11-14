import { describe, expect, it } from "vitest";
import { buildCustomFieldsSchema, CUSTOM_DATE_INVALID_MESSAGE, isStrictIsoDate } from "@/domain/custom-fields/build-schema";

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

// 07.5-01 D-7521: 날짜 칸은 실존하는 YYYY-MM-DD만 — 관대 파싱(2026-02-31 → 3월 3일)을 막는다. 통과한 값의 저장 모양(Date)은 그대로.
describe("날짜 칸 엄격 ISO (D-7521)", () => {
  const schema = buildCustomFieldsSchema([{ key: "due", type: "date" as const }]);

  it("isStrictIsoDate — 실존하는 날짜만 통과(윤년 포함)", () => {
    expect(isStrictIsoDate("2026-11-04")).toBe(true);
    expect(isStrictIsoDate("2024-02-29")).toBe(true);
    expect(isStrictIsoDate("2023-02-29")).toBe(false);
    expect(isStrictIsoDate("2026-02-31")).toBe(false);
    expect(isStrictIsoDate("2026-13-01")).toBe(false);
    expect(isStrictIsoDate("11/4/2026")).toBe(false);
    expect(isStrictIsoDate("2026-1-4")).toBe(false);
    expect(isStrictIsoDate("2026-11-04T00:00:00.000Z")).toBe(false);
  });

  it("2026-11-04 통과 — 결과는 지금처럼 Date", () => {
    const result = schema.safeParse({ due: "2026-11-04" });
    expect(result.success).toBe(true);
    if (result.success) {
      const due = (result.data as { due: unknown }).due;
      expect(due).toBeInstanceOf(Date);
      expect((due as Date).toISOString().slice(0, 10)).toBe("2026-11-04");
    }
  });

  it("유효한 Date 객체는 통과하고 같은 날로 돌아온다", () => {
    const result = schema.safeParse({ due: new Date("2026-11-04T00:00:00.000Z") });
    expect(result.success).toBe(true);
    if (result.success) expect(((result.data as { due: Date }).due).toISOString().slice(0, 10)).toBe("2026-11-04");
  });

  it("잘못된 Date 객체는 거부", () => {
    expect(schema.safeParse({ due: new Date("not-a-date") }).success).toBe(false);
  });

  it("전체 ISO 시각 문자열은 거부 (D-7521 엄격)", () => {
    expect(schema.safeParse({ due: "2026-11-04T00:00:00.000Z" }).success).toBe(false);
  });

  it.each(["2026-02-31", "11/4/2026", "2026-1-4", "2023-02-29"])("%s 거부 — 칸 오류 「날짜 아님 · 2026-11-04처럼」", (value) => {
    const result = schema.safeParse({ due: value });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe("custom");
      expect(result.error.issues[0]?.message).toBe(CUSTOM_DATE_INVALID_MESSAGE);
    }
    expect(CUSTOM_DATE_INVALID_MESSAGE).toBe("날짜 아님 · 2026-11-04처럼");
  });

  it("2024-02-29 통과 · 2023-02-29 거부", () => {
    expect(schema.safeParse({ due: "2024-02-29" }).success).toBe(true);
    expect(schema.safeParse({ due: "2023-02-29" }).success).toBe(false);
  });
});
