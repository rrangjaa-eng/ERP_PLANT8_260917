import { z } from "zod";
import {
  ACTIVE_OPTIONS_MAX,
  FIELD_DEFINITION_TARGETS,
  FIELD_NAME_MAX,
  OPTION_MAX_LENGTH,
  SORT_ORDER_MAX,
} from "@/domain/custom-fields/targets";

// 04.5-01: 화면 항목(커스텀 칸) 생성 입력. 07.5-05: 대상은 `target`(대상 상수 enum — 상수 밖 글자 거부, T-07.5-05-01)이고
// `entity` 키는 여전히 받지 않는다(.strict()). 선택형(04.5-02)은 활성 선택지 1~30개 · 각 1~40자 · 중복 없음이다. 칸 오류 문구는 UI-SPEC Copywriting 표의 뜻 그대로 명사형이다
// (DECISIONS 2026-09-26 · error-copy-noun-style 테스트가 높임말 종결을 막는다 — 04.5-08 편차).
export const NAME_EMPTY_MESSAGE = "이름 비어 있음 · 화면 항목 이름 적기";
export const NAME_TOO_LONG_MESSAGE = `이름 ${FIELD_NAME_MAX}자 초과 · ${FIELD_NAME_MAX}자 이하로 줄이기`;
export const SORT_ORDER_RANGE_MESSAGE = `0~${SORT_ORDER_MAX} 사이 정수 아님 · 숫자 고치기`;

export const NAME_CONFLICT_ACTIVE_MESSAGE = "같은 이름의 화면 항목 있음 · 이름 바꾸기";
// 「보관함에서 복원」 변형은 폼이 이 상수와 같은지로 3차 링크를 그린다.
export const NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE = "보관함에 같은 이름의 화면 항목 있음 · 보관함에서 복원";
export const NAME_CONFLICT_ARCHIVED_RENAME_MESSAGE = "보관함에 같은 이름의 화면 항목 있음 · 이름 바꾸기";

// 04.5-02 선택지 오류 문구 — UI-SPEC Copywriting 뜻 그대로 명사형(편차: 「~습니다」 종결은 error-copy-noun-style이 막는다).
export const OPTION_EMPTY_MESSAGE = "선택지 비어 있음 · 선택지 적기";
export const OPTION_DUPLICATE_MESSAGE = "이미 있는 선택지 · 다른 이름 적기";
export const OPTION_LIMIT_MESSAGE = `선택지는 ${ACTIVE_OPTIONS_MAX}개까지 · 쓰지 않는 선택지 삭제`;
export const OPTION_TOO_LONG_MESSAGE = `선택지 ${OPTION_MAX_LENGTH}자 초과 · ${OPTION_MAX_LENGTH}자 이하로 줄이기`;
// 선택형의 활성 선택지가 없을 때의 원인 — 폼이 formReason(「추가」|「수정」, 원인)으로 1차 비활성 이유를 만든다.
export const OPTIONS_ZERO_CAUSE = "선택지 0개 · 선택지 추가";
export const OPTIONS_ON_NON_SELECT_MESSAGE = "선택형 아닌 칸의 선택지 · 선택지 지우기";
// 수정 충돌 — 폼을 연 뒤 다른 사람이 먼저 저장·보관·복원. 폼이 이 상수와 같은지로 1차를 켠 채 「새로 불러오기」를 그린다.
export const FIELD_DEFINITION_CONFLICT_CAUSE = "다른 사람이 먼저 수정함 · 새로 불러오기";

// 자른 뒤 NFC로 합친다 — 자모가 풀린(NFD) 한글이 같아 보이는 다른 이름 · 선택지를 만들지 못하게(길이 · 중복 판정도 합친 뒤).
const nameField = z.string().trim().normalize("NFC").min(1, NAME_EMPTY_MESSAGE).max(FIELD_NAME_MAX, NAME_TOO_LONG_MESSAGE);

const sortOrderField = z
  .number({ error: SORT_ORDER_RANGE_MESSAGE })
  .int(SORT_ORDER_RANGE_MESSAGE)
  .min(0, SORT_ORDER_RANGE_MESSAGE)
  .max(SORT_ORDER_MAX, SORT_ORDER_RANGE_MESSAGE);

// 원소 자르기 · 1~40자 · 최대 30개 · 중복 없음(자른 뒤 기준).
const optionsField = z
  .array(z.string().trim().normalize("NFC").min(1, OPTION_EMPTY_MESSAGE).max(OPTION_MAX_LENGTH, OPTION_TOO_LONG_MESSAGE))
  .max(ACTIVE_OPTIONS_MAX, OPTION_LIMIT_MESSAGE)
  .superRefine((options, ctx) => {
    if (new Set(options).size !== options.length) {
      ctx.addIssue({ code: "custom", message: OPTION_DUPLICATE_MESSAGE });
    }
  });

// 두 생성 스키마(도메인 · 액션)가 같은 칸 묶음 · 같은 선택지 검사를 건다 — 검사가 붙은 스키마를 덮어 잇지 않는다(zod가 모듈 로드 때 예외, eng r2 N1).
const createFields = {
  name: nameField,
  type: z.enum(["text", "number", "date", "select"]),
  required: z.boolean(),
  sortOrder: sortOrderField,
  options: optionsField.optional(),
};

function checkOptionsForType(input: { type: string; options?: string[] | undefined }, ctx: z.RefinementCtx): void {
  const count = input.options?.length ?? 0;
  if (input.type === "select" && count === 0) {
    ctx.addIssue({ code: "custom", path: ["options"], message: OPTIONS_ZERO_CAUSE });
  }
  if (input.type !== "select" && count > 0) {
    ctx.addIssue({ code: "custom", path: ["options"], message: OPTIONS_ON_NON_SELECT_MESSAGE });
  }
}

// 도메인 입력 — target을 생략하면 거래처(04.5 호출 그대로 · assumption_delta_decision).
export const createFieldDefinitionInput = z
  .object({ ...createFields, target: z.enum(FIELD_DEFINITION_TARGETS).default("vendor") })
  .strict()
  .superRefine(checkOptionsForType);

// 호출자가 넘기는 모양(target 생략 가능 — eng C-2). 파싱 뒤 값은 parse 결과 추론을 쓴다.
export type CreateFieldDefinitionInput = z.input<typeof createFieldDefinitionInput>;

// 관리 화면 액션 입력 — target 필수 · 기본값 없음(폼이 대상을 빠뜨리면 거래처 칸으로 조용히 저장되던 길을 막는다, eng C-3).
export const createFieldDefinitionActionInput = z
  .object({ ...createFields, target: z.enum(FIELD_DEFINITION_TARGETS) })
  .strict()
  .superRefine(checkOptionsForType);

// 04.5-02: 수정 입력 — type · entity · target 키가 없다(.strict()가 거부 — 타입 · 대상은 바꿀 수 없다, 대상은 저장된 행 그대로).
// 선택형인지는 읽은 행으로 판정하므로 선택지 배열은 모양 규칙만 본다(선택형의 0개 거부는 domain).
export const updateFieldDefinitionInput = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    name: nameField,
    required: z.boolean(),
    sortOrder: sortOrderField,
    options: optionsField.optional(),
  })
  .strict();

export type UpdateFieldDefinitionInput = z.infer<typeof updateFieldDefinitionInput>;

// 이름 충돌 칸 오류 문구 — 활성과 같음 / 보관과 같음(복원 권한이 있으면 복원 링크 변형, 없으면 이름 바꾸기 평문).
export function nameConflictMessage(opts: { archived: boolean; canRestore?: boolean }): string {
  if (!opts.archived) return NAME_CONFLICT_ACTIVE_MESSAGE;
  return opts.canRestore ? NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE : NAME_CONFLICT_ARCHIVED_RENAME_MESSAGE;
}
