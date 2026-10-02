import { describe, expect, it } from "vitest";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import {
  FIELD_DEFINITION_TARGETS,
  customFieldInfoItem,
  nextSortOrder,
  parseCustomFieldInfoItem,
} from "@/domain/custom-fields/targets";
import { createFieldDefinitionInput, nameConflictMessage, updateFieldDefinitionInput } from "@/domain/custom-fields/admin-input";
import { addOption, deriveArchivedOptions, normalizeOption, removeOption } from "@/domain/custom-fields/options";

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
    expect(issueMessages({ ...valid, name: "   " })).toContain("이름 비어 있음 · 화면 항목 이름 적기");
  });

  it("21자 이름은 거부하고 20자는 통과한다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...valid, name: "가".repeat(21) }).success).toBe(false);
    expect(createFieldDefinitionInput.safeParse({ ...valid, name: "가".repeat(20) }).success).toBe(true);
  });

  it.each([-1, 1000, 1.5, Number.NaN])("정렬 순서 %s는 범위 문구로 거부한다", (sortOrder) => {
    expect(issueMessages({ ...valid, sortOrder })).toContain("0~999 사이 정수 아님 · 숫자 고치기");
  });

  it("숫자가 아닌 정렬 값도 같은 문구로 거부한다", () => {
    expect(issueMessages({ ...valid, sortOrder: "abc" })).toContain("0~999 사이 정수 아님 · 숫자 고치기");
    expect(issueMessages({ ...valid, sortOrder: undefined })).toContain("0~999 사이 정수 아님 · 숫자 고치기");
  });

  it("0과 999는 통과한다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...valid, sortOrder: 0 }).success).toBe(true);
    expect(createFieldDefinitionInput.safeParse({ ...valid, sortOrder: 999 }).success).toBe(true);
  });

  it("자모가 풀린(NFD) 이름 · 선택지는 NFC로 합쳐 저장 · 길이 판정한다", () => {
    const nfdName = "계약 메모".normalize("NFD");
    const parsed = createFieldDefinitionInput.parse({ ...valid, name: ` ${nfdName} `, type: "select", options: [" 갑 ".normalize("NFD")] });
    expect(parsed.name).toBe("계약 메모".normalize("NFC"));
    expect(parsed.options).toEqual(["갑"]);
    expect(createFieldDefinitionInput.safeParse({ ...valid, name: "가".repeat(20).normalize("NFD") }).success).toBe(true);
    const updated = updateFieldDefinitionInput.parse({ id: "x", version: 1, name: nfdName, required: false, sortOrder: 1 });
    expect(updated.name).toBe("계약 메모");
  });

  it("NFC로 합치면 같아지는 선택지는 중복으로 거부한다", () => {
    expect(issueMessages({ ...valid, type: "select", options: ["갑", "갑".normalize("NFD")] })).toContain("이미 있는 선택지 · 다른 이름 적기");
  });

  it("entity 키는 거부하고, 선택형은 선택지 없이는 거부한다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...valid, entity: "project" }).success).toBe(false);
    expect(createFieldDefinitionInput.safeParse({ ...valid, type: "select" }).success).toBe(false);
  });
});

describe("이름 충돌 문구", () => {
  it("활성 칸과 같으면 이름 바꾸기를 권한다", () => {
    expect(nameConflictMessage({ archived: false })).toBe("같은 이름의 화면 항목 있음 · 이름 바꾸기");
  });
  it("보관된 칸과 같고 복원할 수 있으면 보관함에서 복원을 권한다", () => {
    expect(nameConflictMessage({ archived: true, canRestore: true })).toBe(
      "보관함에 같은 이름의 화면 항목 있음 · 보관함에서 복원",
    );
  });
  it("보관된 칸과 같고 복원할 수 없으면 이름 바꾸기 평문이다", () => {
    expect(nameConflictMessage({ archived: true, canRestore: false })).toBe(
      "보관함에 같은 이름의 화면 항목 있음 · 이름 바꾸기",
    );
  });
});

// 04.5-02: 선택지 편집 순수 함수 — 폼과 서버가 같이 쓴다.
describe("선택지 편집 순수 함수", () => {
  it("normalizeOption은 앞뒤 공백을 자른다", () => {
    expect(normalizeOption("  특약 ")).toBe("특약");
  });

  it("addOption은 앞뒤 공백을 자르고 활성 목록 끝에 더한다", () => {
    expect(addOption({ active: ["기본"], archived: [] }, "  특약 ")).toEqual({
      state: { active: ["기본", "특약"], archived: [] },
    });
  });

  it("활성과 같은 선택지는 duplicate 오류이고 상태는 그대로다", () => {
    const state = { active: ["기본"], archived: [] };
    expect(addOption(state, "기본")).toEqual({ state, error: "duplicate" });
  });

  it("공백만 있는 선택지는 empty 오류다", () => {
    const state = { active: ["기본"], archived: [] };
    expect(addOption(state, "   ")).toEqual({ state, error: "empty" });
  });

  it("활성이 30개면 limit 오류다", () => {
    const state = { active: Array.from({ length: 30 }, (_, i) => `선택${i}`), archived: [] };
    expect(addOption(state, "서른하나")).toEqual({ state, error: "limit" });
  });

  it("보관 선택지와 같은 문자열을 더하면 보관에서 빼 활성으로 돌린다(복원)", () => {
    expect(addOption({ active: ["기본"], archived: ["특약"] }, "특약")).toEqual({
      state: { active: ["기본", "특약"], archived: [] },
    });
  });

  it("저장된 선택지를 삭제하면 보관으로 옮기고, 저장 안 한 선택지는 목록에서 뺀다", () => {
    const saved = ["기본", "특약"];
    const state = { active: ["기본", "특약", "MOU"], archived: [] };
    const archivedOne = removeOption(state, "특약", saved);
    expect(archivedOne).toEqual({ active: ["기본", "MOU"], archived: ["특약"] });
    expect(removeOption(archivedOne, "MOU", saved)).toEqual({ active: ["기본"], archived: ["특약"] });
  });

  it("deriveArchivedOptions는 (저장 활성 ∪ 저장 보관) − 제출 활성이고 저장 순서를 지킨다", () => {
    expect(
      deriveArchivedOptions({ storedActive: ["a", "b", "c"], storedArchived: ["x"], submittedActive: ["a", "d"] }),
    ).toEqual(["b", "c", "x"]);
  });

  it("deriveArchivedOptions는 중복을 만들지 않는다", () => {
    expect(
      deriveArchivedOptions({ storedActive: ["a", "b"], storedArchived: ["b"], submittedActive: ["a"] }),
    ).toEqual(["b"]);
  });
});

describe("생성 입력 — 선택형", () => {
  const select = { ...valid, type: "select" as const };

  it("선택형은 선택지 1~30개 · 각 1~40자를 받고 원소는 앞뒤 공백이 잘린다", () => {
    const parsed = createFieldDefinitionInput.parse({ ...select, options: [" 기본 ", "특약"] });
    expect(parsed.options).toEqual(["기본", "특약"]);
    expect(createFieldDefinitionInput.safeParse({ ...select, options: ["가".repeat(40)] }).success).toBe(true);
    expect(createFieldDefinitionInput.safeParse({ ...select, options: Array.from({ length: 30 }, (_, i) => `선택${i}`) }).success).toBe(true);
  });

  it("선택지 0개 · 생략 · 31개 · 41자 · 공백만 · 중복은 거부한다", () => {
    expect(issueMessages({ ...select, options: [] })).toContain("선택지 0개 · 선택지 추가");
    expect(issueMessages(select)).toContain("선택지 0개 · 선택지 추가");
    expect(issueMessages({ ...select, options: Array.from({ length: 31 }, (_, i) => `선택${i}`) })).toContain(
      "선택지는 30개까지 · 쓰지 않는 선택지 삭제",
    );
    expect(createFieldDefinitionInput.safeParse({ ...select, options: ["가".repeat(41)] }).success).toBe(false);
    expect(issueMessages({ ...select, options: ["   "] })).toContain("선택지 비어 있음 · 선택지 적기");
    expect(issueMessages({ ...select, options: ["기본", " 기본 "] })).toContain("이미 있는 선택지 · 다른 이름 적기");
  });

  it("텍스트 타입에 선택지를 실으면 거부하고, 빈 배열이나 생략은 통과한다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...valid, options: ["기본"] }).success).toBe(false);
    expect(createFieldDefinitionInput.safeParse({ ...valid, options: [] }).success).toBe(true);
    expect(createFieldDefinitionInput.safeParse(valid).success).toBe(true);
  });
});

describe("수정 입력 (04.5-02)", () => {
  const update = { id: "fd-1", version: 3, name: "계약 메모", required: true, sortOrder: 2 };

  it("id · version · 이름 · 필수 · 정렬 순서만 받고 선택지는 선택이다", () => {
    expect(updateFieldDefinitionInput.safeParse(update).success).toBe(true);
    expect(updateFieldDefinitionInput.safeParse({ ...update, options: [" 기본 ", "특약"] }).success).toBe(true);
    expect(updateFieldDefinitionInput.parse({ ...update, name: "  계약  ", options: [" 기본 "] })).toMatchObject({
      name: "계약",
      options: ["기본"],
    });
  });

  it("type · entity 키가 실린 입력은 거부한다(타입 불변 · 대상 위조 금지)", () => {
    expect(updateFieldDefinitionInput.safeParse({ ...update, type: "number" }).success).toBe(false);
    expect(updateFieldDefinitionInput.safeParse({ ...update, entity: "project" }).success).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN])("version %s는 거부한다", (version) => {
    expect(updateFieldDefinitionInput.safeParse({ ...update, version }).success).toBe(false);
  });

  it("이름 · 정렬 순서 · 선택지 규칙은 생성과 같은 문구다", () => {
    const messages = (input: unknown) => {
      const result = updateFieldDefinitionInput.safeParse(input);
      return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };
    expect(messages({ ...update, name: "  " })).toContain("이름 비어 있음 · 화면 항목 이름 적기");
    expect(messages({ ...update, sortOrder: 1000 })).toContain("0~999 사이 정수 아님 · 숫자 고치기");
    expect(messages({ ...update, options: ["기본", "기본"] })).toContain("이미 있는 선택지 · 다른 이름 적기");
    expect(messages({ ...update, options: Array.from({ length: 31 }, (_, i) => `선택${i}`) })).toContain(
      "선택지는 30개까지 · 쓰지 않는 선택지 삭제",
    );
  });
});
