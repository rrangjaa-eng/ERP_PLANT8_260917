import { describe, expect, it } from "vitest";
import {
  CUSTOM_FIELD_COLUMN_LIMIT,
  CUSTOM_FIELD_FILTER_LIMIT,
  customFieldFilterDefs,
  customFieldListColumns,
  customTextSearchKeys,
  parseCustomFieldFilters,
} from "@/domain/custom-fields/access-rules";

// 07.5-01: 대상 무관 순수 규칙 — 열 상한 3 · 거르개 상한 2 · 텍스트만 검색 · 거르개 값은 활성 선택지만(정의 키 그대로).
type Def = { key: string; label: string; type: "text" | "number" | "date" | "select"; options: string[] };

function def(key: string, type: Def["type"], options: string[] = []): Def {
  return { key, label: key, type, options };
}

describe("customFieldListColumns", () => {
  it("상한 상수는 3 · 2다", () => {
    expect(CUSTOM_FIELD_COLUMN_LIMIT).toBe(3);
    expect(CUSTOM_FIELD_FILTER_LIMIT).toBe(2);
  });

  it("정렬 순서 앞 3개만 — 4개 입력이면 3개", () => {
    const defs = [def("a", "text"), def("b", "number"), def("c", "date"), def("d", "select", ["x"])];
    expect(customFieldListColumns(defs).map((d) => d.key)).toEqual(["a", "b", "c"]);
  });

  it("정확히 3개면 3개 모두, 0개면 빈 배열", () => {
    const three = [def("a", "text"), def("b", "text"), def("c", "text")];
    expect(customFieldListColumns(three)).toHaveLength(3);
    expect(customFieldListColumns([])).toEqual([]);
  });
});

describe("customTextSearchKeys", () => {
  it("text 타입 키만 — 열 상한과 무관하게 4번째 칸도 포함", () => {
    const defs = [def("a", "number"), def("b", "text"), def("c", "select", ["x"]), def("d", "text"), def("e", "date")];
    expect(customTextSearchKeys(defs)).toEqual(["b", "d"]);
  });
});

describe("customFieldFilterDefs", () => {
  it("select 타입 앞 2개만", () => {
    const defs = [def("a", "text"), def("s1", "select", ["x"]), def("s2", "select", ["y"]), def("s3", "select", ["z"])];
    expect(customFieldFilterDefs(defs).map((d) => d.key)).toEqual(["s1", "s2"]);
  });
});

describe("parseCustomFieldFilters", () => {
  const filterDefs = [def("s1", "select", ["서울", "부산"]), def("s2", "select", ["A"])];

  it("활성 선택지 안 값만 남긴다", () => {
    expect(parseCustomFieldFilters({ s1: "서울", s2: "A" }, filterDefs)).toEqual({ s1: "서울", s2: "A" });
  });

  it("모르는 키 · 목록 밖 값(보관 선택지) · 빈 값은 버린다", () => {
    expect(parseCustomFieldFilters({ s1: "대구", zz: "서울", s2: "" }, filterDefs)).toEqual({});
  });

  it("filterDefs가 비면 전부 버린다", () => {
    expect(parseCustomFieldFilters({ s1: "서울" }, [])).toEqual({});
  });

  it("입력 배열 · 객체를 바꾸지 않는다", () => {
    const raw = { s1: "서울", zz: "x" };
    const defsCopy = JSON.stringify(filterDefs);
    parseCustomFieldFilters(raw, filterDefs);
    expect(raw).toEqual({ s1: "서울", zz: "x" });
    expect(JSON.stringify(filterDefs)).toBe(defsCopy);
  });
});
