import { describe, expect, it } from "vitest";
import {
  ARCHIVED_OPTION_MESSAGE,
  CustomFieldsInvalidError,
  REQUIRED_SELECT_EMPTY_MESSAGE,
  REQUIRED_VALUE_EMPTY_MESSAGE,
  UNKNOWN_CUSTOM_FIELD_KEY_MESSAGE,
  UnknownCustomFieldKeyError,
  resolveCustomFieldsWrite,
  type CustomFieldsWriteInput,
  type InputFieldDef,
} from "@/domain/custom-fields/preserve";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// 04.5-05: 거래처 커스텀 값 쓰기 판정(순수) — 없는 키 거부 · 입력 밖 존재 키 버림 · 필수 판정 표(UI-SPEC 화면 3) ·
// 보관 선택지 · 타입 검증 · 보이지 않는 저장값 되살리기.

function def(key: string, type: InputFieldDef["type"], extra: Partial<InputFieldDef> = {}): InputFieldDef {
  return { key, label: key, type, options: [], archivedOptions: [], required: false, ...extra };
}

const memo = def("memo", "text");
const qty = def("qty", "number");
const grade = def("grade", "select", { options: ["상", "중"], archivedOptions: ["구형", "폐기"] });

function run(partial: Partial<CustomFieldsWriteInput>): Record<string, unknown> {
  const inputDefs = partial.inputDefs ?? [memo, qty, grade];
  return resolveCustomFieldsWrite({
    mode: "update",
    inputDefs,
    knownKeys: partial.knownKeys ?? new Set([...inputDefs.map((d) => d.key), "hiddenKey", "archivedKey"]),
    stored: {},
    submitted: {},
    ...partial,
  });
}

function fieldErrorsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (error) {
    if (error instanceof CustomFieldsInvalidError) return error.fieldErrors;
    throw error;
  }
  throw new Error("CustomFieldsInvalidError가 나지 않았다");
}

describe("없는 키 거부", () => {
  it("knownKeys 밖 키가 하나라도 있으면 값이 비어 있어도 UnknownCustomFieldKeyError(일반 문구)", () => {
    for (const value of ["", "x", null]) {
      expect(() => run({ submitted: { memo: "a", forged: value } })).toThrow(UnknownCustomFieldKeyError);
    }
    try {
      run({ submitted: { forged: "" } });
    } catch (error) {
      expect(error).toBeInstanceOf(UserFacingError);
      expect((error as Error).message).toBe(UNKNOWN_CUSTOM_FIELD_KEY_MESSAGE);
    }
    expect(UNKNOWN_CUSTOM_FIELD_KEY_MESSAGE).toBe("입력값 오류 · 값 확인");
  });

  it("등록에서도 같다", () => {
    expect(() => run({ mode: "create", submitted: { forged: "x" } })).toThrow(UnknownCustomFieldKeyError);
  });
});

describe("입력 밖 존재 키(E4 stale · hidden) — 버리고 저장값 유지", () => {
  it("knownKeys 안 · inputDefs 밖 키는 오류 없이 제출값을 버리고 저장값 그대로, 다른 칸은 반영", () => {
    const result = run({
      stored: { hiddenKey: "숨은값", memo: "옛메모" },
      submitted: { hiddenKey: "위조값", archivedKey: "새값", memo: "새메모" },
    });
    expect(result).toEqual({ hiddenKey: "숨은값", memo: "새메모" });
  });

  it("저장값이 없으면 결과에 없다(등록이면 결과에 없음)", () => {
    expect(run({ submitted: { hiddenKey: "위조값" } })).toEqual({});
    expect(run({ mode: "create", submitted: { hiddenKey: "위조값", memo: "a" } })).toEqual({ memo: "a" });
  });

  it("입력 밖 필수 칸은 판정하지 않는다(볼 수 없는 칸을 채우라고 막지 않는다)", () => {
    // hiddenKey가 필수인지 판정기는 모른다 — inputDefs 밖은 필수·타입 판정에 쓰이지 않는다.
    expect(run({ mode: "create", inputDefs: [memo], submitted: { hiddenKey: "" } })).toEqual({});
  });
});

describe("빈 값", () => {
  it("undefined · null · 공백만은 빈 값, 0과 \"0\"은 빈 값이 아니다", () => {
    const req = def("qty", "number", { required: true });
    for (const value of [undefined, null, "   "]) {
      expect(fieldErrorsOf(() => run({ mode: "create", inputDefs: [req], submitted: { qty: value } }))).toEqual({
        qty: REQUIRED_VALUE_EMPTY_MESSAGE,
      });
    }
    expect(run({ mode: "create", inputDefs: [req], submitted: { qty: 0 } })).toEqual({ qty: 0 });
    expect(run({ mode: "create", inputDefs: [req], submitted: { qty: "0" } })).toEqual({ qty: 0 });
  });
});

describe("필수 판정 표(UI-SPEC 화면 3)", () => {
  const types: InputFieldDef[] = [
    def("t", "text", { required: true }),
    def("n", "number", { required: true }),
    def("d", "date", { required: true }),
    def("s", "select", { required: true, options: ["가", "나"] }),
  ];
  const filled: Record<string, unknown> = { t: "값", n: 3, d: "2026-10-02T00:00:00.000Z", s: "가" };

  it.each(types)("등록: 빈칸이면 막힘 — $type", (field) => {
    const message = field.type === "select" ? REQUIRED_SELECT_EMPTY_MESSAGE : REQUIRED_VALUE_EMPTY_MESSAGE;
    expect(fieldErrorsOf(() => run({ mode: "create", inputDefs: [field], submitted: { [field.key]: "" } }))).toEqual({
      [field.key]: message,
    });
    // 등록에서 키 없음 = 빈칸
    expect(fieldErrorsOf(() => run({ mode: "create", inputDefs: [field], submitted: {} }))).toEqual({
      [field.key]: message,
    });
  });

  it.each(types)("수정: 저장값도 비고 제출도 비면 안 바꿈(결과에 키 없음) — $type", (field) => {
    expect(run({ inputDefs: [field], stored: {}, submitted: { [field.key]: "" } })).toEqual({});
  });

  it.each(types)("수정: 저장값이 있는데 지우면 막힘 — $type", (field) => {
    const message = field.type === "select" ? REQUIRED_SELECT_EMPTY_MESSAGE : REQUIRED_VALUE_EMPTY_MESSAGE;
    expect(
      fieldErrorsOf(() => run({ inputDefs: [field], stored: { [field.key]: filled[field.key] }, submitted: { [field.key]: "" } })),
    ).toEqual({ [field.key]: message });
  });

  it.each(types)("수정: 필수 칸 키가 제출에 없으면 저장값 그대로(막지 않음) — $type", (field) => {
    const stored = { [field.key]: filled[field.key] };
    expect(run({ inputDefs: [field], stored, submitted: {} })).toEqual(stored);
  });

  it("값이 있으면 타입 검증만 — 막힘 없음", () => {
    const result = run({ mode: "create", inputDefs: types, submitted: { t: "값", n: "3", d: "2026-10-02", s: "가" } });
    expect(result.t).toBe("값");
    expect(result.n).toBe(3);
    expect(result.d).toBeInstanceOf(Date);
    expect(result.s).toBe("가");
  });
});

describe("필수 아님 · 수정", () => {
  it("빈 문자열이면 결과에서 그 키가 빠진다(비움)", () => {
    expect(run({ stored: { memo: "옛값" }, submitted: { memo: "" } })).toEqual({});
  });

  it("키가 없으면 저장값 그대로", () => {
    expect(run({ stored: { memo: "옛값", qty: 2 }, submitted: { qty: "5" } })).toEqual({ memo: "옛값", qty: 5 });
  });
});

describe("보관 선택지", () => {
  it("저장값 「구형」이 보관 선택지이고 제출도 「구형」이면 통과하고 값 유지", () => {
    expect(run({ stored: { grade: "구형" }, submitted: { grade: "구형" } })).toEqual({ grade: "구형" });
  });

  it("다른 보관 선택지 「폐기」로 바꾸면 그 칸에 보관 선택지 문구", () => {
    expect(fieldErrorsOf(() => run({ stored: { grade: "구형" }, submitted: { grade: "폐기" } }))).toEqual({
      grade: ARCHIVED_OPTION_MESSAGE,
    });
  });

  it("등록에서 보관 선택지를 보내도 같은 문구", () => {
    expect(fieldErrorsOf(() => run({ mode: "create", submitted: { grade: "구형" } }))).toEqual({
      grade: ARCHIVED_OPTION_MESSAGE,
    });
  });

  it("저장값이 활성 선택지면 보관 선택지를 새로 고를 수 없다", () => {
    expect(fieldErrorsOf(() => run({ stored: { grade: "상" }, submitted: { grade: "구형" } }))).toEqual({
      grade: ARCHIVED_OPTION_MESSAGE,
    });
  });
});

// 0023 이전에 지워진 선택지 — 활성 · 보관 어디에도 없는 저장값. 수정에서 그대로 다시 보내면 통과(안 바꿈).
describe("목록에 없는 옛 저장값", () => {
  it("수정에서 저장값과 같은 값을 다시 보내면 통과하고 값 유지 — 다른 칸 수정이 막히지 않는다", () => {
    expect(run({ stored: { grade: "옛값", memo: "옛메모" }, submitted: { grade: "옛값", memo: "새메모" } })).toEqual({
      grade: "옛값",
      memo: "새메모",
    });
  });

  it("수정에서 저장값과 다른 목록 밖 값이면 허용되지 않은 값(그 거래처가 유지할 수 있는 저장값도 나열)", () => {
    expect(fieldErrorsOf(() => run({ stored: { grade: "옛값" }, submitted: { grade: "다른값" } }))).toEqual({
      grade: "허용되지 않은 값 · 상, 중, 옛값 중 선택",
    });
  });

  it("등록에서는 목록 밖 값이 저장값과 같아도 거부", () => {
    expect(fieldErrorsOf(() => run({ mode: "create", stored: { grade: "옛값" }, submitted: { grade: "옛값" } }))).toEqual({
      grade: "허용되지 않은 값 · 상, 중 중 선택",
    });
  });
});

describe("타입 검증 — 기존 한국어 한 줄", () => {
  it("숫자 칸에 「abc」면 형식 오류", () => {
    expect(fieldErrorsOf(() => run({ submitted: { qty: "abc" } }))).toEqual({ qty: "형식 오류 · 값 확인" });
  });

  it("선택형에 없는 값이면 허용되지 않은 값(활성 선택지만 나열)", () => {
    expect(fieldErrorsOf(() => run({ submitted: { grade: "없는값" } }))).toEqual({
      grade: "허용되지 않은 값 · 상, 중 중 선택",
    });
  });
});

describe("여러 칸", () => {
  it("inputDefs 순서대로 모든 키를 담고 한 칸에는 메시지 하나(필수 → 보관 → 타입 순으로 첫 것)", () => {
    const reqMemo = def("memo", "text", { required: true });
    let caught: unknown;
    try {
      run({ mode: "create", inputDefs: [reqMemo, qty, grade], submitted: { grade: "폐기", qty: "abc" } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CustomFieldsInvalidError);
    const error = caught as CustomFieldsInvalidError;
    expect(Object.keys(error.fieldErrors)).toEqual(["memo", "qty", "grade"]);
    expect(error.fieldErrors).toEqual({
      memo: REQUIRED_VALUE_EMPTY_MESSAGE,
      qty: "형식 오류 · 값 확인",
      grade: ARCHIVED_OPTION_MESSAGE,
    });
    expect(error.message).toBe(REQUIRED_VALUE_EMPTY_MESSAGE);
    expect(error).toBeInstanceOf(UserFacingError);
  });
});

describe("되살리기", () => {
  it("stored의 inputDefs 밖 키(보관 칸 · 끈 칸 · 정의가 없어진 키)는 결과에 그대로, 인자 객체는 바꾸지 않는다", () => {
    const stored = { hiddenKey: "숨은값", archivedKey: "보관값", goneKey: "옛키값", memo: "옛메모" };
    const submitted = { memo: "새메모" };
    const storedCopy = structuredClone(stored);
    const submittedCopy = structuredClone(submitted);
    const result = run({ stored, submitted });
    expect(result).toEqual({ hiddenKey: "숨은값", archivedKey: "보관값", goneKey: "옛키값", memo: "새메모" });
    expect(result).not.toBe(stored);
    expect(stored).toEqual(storedCopy);
    expect(submitted).toEqual(submittedCopy);
  });
});

describe("문구 — 명사형(DECISIONS 2026-09-26)", () => {
  it("UI-SPEC 문구의 뜻을 지킨 명사형", () => {
    expect(REQUIRED_VALUE_EMPTY_MESSAGE).toBe("필수 칸 비어 있음 · 값 입력");
    expect(REQUIRED_SELECT_EMPTY_MESSAGE).toBe("필수 칸 비어 있음 · 선택지 고르기");
    expect(ARCHIVED_OPTION_MESSAGE).toBe("보관된 선택지 · 다른 선택지 고르기");
  });
});
