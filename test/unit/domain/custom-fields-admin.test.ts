import { describe, expect, it } from "vitest";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import {
  FIELD_DEFINITION_TARGETS,
  customFieldInfoItem,
  nextSortOrder,
  parseCustomFieldInfoItem,
} from "@/domain/custom-fields/targets";
import { createFieldDefinitionInput, nameConflictMessage } from "@/domain/custom-fields/admin-input";

// 04.5-08: 대상 등록부 · 입력 규칙 · 이름 충돌 문구 — DB 없이 도는 순수 계약.
const valid = { name: "계약 메모", type: "text" as const, required: false, sortOrder: 1 };

function issueMessages(input: unknown): string[] {
  const result = createFieldDefinitionInput.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("대상 등록부 · 항목 키 규약", () => {
  it("대상은 거래처 하나다", () => {
    expect([...FIELD_DEFINITION_TARGETS]).toEqual(["vendor"]);
  });

  it("노출표 항목 키는 cf.<entity>.<key>이고 역으로 풀린다", () => {
    expect(customFieldInfoItem("vendor", "cf_1a2b3c4d")).toBe("cf.vendor.cf_1a2b3c4d");
    expect(parseCustomFieldInfoItem("cf.vendor.cf_1a2b3c4d")).toEqual({ entity: "vendor", key: "cf_1a2b3c4d" });
  });

  it("cf. 접두가 아니거나 조각이 셋이 아니면 null이다", () => {
    expect(parseCustomFieldInfoItem("vendor.value")).toBeNull();
    expect(parseCustomFieldInfoItem("cf.vendor")).toBeNull();
    expect(parseCustomFieldInfoItem("cf.vendor.a.b")).toBeNull();
  });

  it("INFO_ITEMS의 어떤 키도 cf.로 시작하지 않는다(두 출처의 키 공간 분리)", () => {
    expect(INFO_ITEMS.filter((item) => item.key.startsWith("cf."))).toEqual([]);
  });
});

describe("정렬 순서 기본값", () => {
  it("활성 정의가 없으면 1이다", () => {
    expect(nextSortOrder([])).toBe(1);
  });
  it("활성 최대값 + 1이다", () => {
    expect(nextSortOrder([1, 5])).toBe(6);
  });
  it("999를 넘지 않는다", () => {
    expect(nextSortOrder([999])).toBe(999);
  });
});

describe("생성 입력 — 칸 오류 문구", () => {
  it("정상 입력은 통과하고 이름은 앞뒤 공백이 잘린다", () => {
    const parsed = createFieldDefinitionInput.parse({ ...valid, name: "  계약 메모  " });
    expect(parsed.name).toBe("계약 메모");
  });

  it("공백만 있는 이름은 빈칸 문구로 거부한다", () => {
    expect(issueMessages({ ...valid, name: "   " })).toContain("이름이 비어 있습니다 · 화면 항목 이름을 적어 주세요");
  });

  it("21자 이름은 거부하고 20자는 통과한다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...valid, name: "가".repeat(21) }).success).toBe(false);
    expect(createFieldDefinitionInput.safeParse({ ...valid, name: "가".repeat(20) }).success).toBe(true);
  });

  it.each([-1, 1000, 1.5, Number.NaN])("정렬 순서 %s는 범위 문구로 거부한다", (sortOrder) => {
    expect(issueMessages({ ...valid, sortOrder })).toContain("0~999 사이 정수가 아닙니다 · 숫자 고치기");
  });

  it("숫자가 아닌 정렬 값도 같은 문구로 거부한다", () => {
    expect(issueMessages({ ...valid, sortOrder: "abc" })).toContain("0~999 사이 정수가 아닙니다 · 숫자 고치기");
    expect(issueMessages({ ...valid, sortOrder: undefined })).toContain("0~999 사이 정수가 아닙니다 · 숫자 고치기");
  });

  it("0과 999는 통과한다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...valid, sortOrder: 0 }).success).toBe(true);
    expect(createFieldDefinitionInput.safeParse({ ...valid, sortOrder: 999 }).success).toBe(true);
  });

  it("entity 키와 선택형은 여전히 거부한다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...valid, entity: "project" }).success).toBe(false);
    expect(createFieldDefinitionInput.safeParse({ ...valid, type: "select" }).success).toBe(false);
  });
});

describe("이름 충돌 문구", () => {
  it("활성 칸과 같으면 이름 바꾸기를 권한다", () => {
    expect(nameConflictMessage({ archived: false })).toBe("같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기");
  });
  it("보관된 칸과 같고 복원할 수 있으면 보관함에서 복원을 권한다", () => {
    expect(nameConflictMessage({ archived: true, canRestore: true })).toBe(
      "보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원",
    );
  });
  it("보관된 칸과 같고 복원할 수 없으면 이름 바꾸기 평문이다", () => {
    expect(nameConflictMessage({ archived: true, canRestore: false })).toBe(
      "보관함에 같은 이름의 화면 항목이 있습니다 · 이름 바꾸기",
    );
  });
});
