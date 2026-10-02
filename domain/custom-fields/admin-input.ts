import { z } from "zod";
import { FIELD_NAME_MAX, SORT_ORDER_MAX } from "@/domain/custom-fields/targets";

// 04.5-01: 화면 항목(커스텀 칸) 생성 입력 — 대상(entity)은 받지 않는다(서버가 거래처를 넣는다,
// T-04.5-02). 선택형은 02가 더한다. 칸 오류 문구는 UI-SPEC Copywriting 표의 원문이다(04.5-08).
export const NAME_EMPTY_MESSAGE = "이름이 비어 있습니다 · 화면 항목 이름을 적어 주세요";
export const NAME_TOO_LONG_MESSAGE = `이름이 너무 깁니다 · ${FIELD_NAME_MAX}자 이하로 줄이기`;
export const SORT_ORDER_RANGE_MESSAGE = `0~${SORT_ORDER_MAX} 사이 정수가 아닙니다 · 숫자 고치기`;

export const NAME_CONFLICT_ACTIVE_MESSAGE = "같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기";
// 「보관함에서 복원」 변형은 폼이 이 상수와 같은지로 3차 링크를 그린다.
export const NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE = "보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원";
export const NAME_CONFLICT_ARCHIVED_RENAME_MESSAGE = "보관함에 같은 이름의 화면 항목이 있습니다 · 이름 바꾸기";

export const createFieldDefinitionInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, NAME_EMPTY_MESSAGE)
      .max(FIELD_NAME_MAX, NAME_TOO_LONG_MESSAGE),
    type: z.enum(["text", "number", "date"]),
    required: z.boolean(),
    sortOrder: z
      .number({ error: SORT_ORDER_RANGE_MESSAGE })
      .int(SORT_ORDER_RANGE_MESSAGE)
      .min(0, SORT_ORDER_RANGE_MESSAGE)
      .max(SORT_ORDER_MAX, SORT_ORDER_RANGE_MESSAGE),
  })
  .strict();

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionInput>;

// 이름 충돌 칸 오류 문구 — 활성과 같음 / 보관과 같음(복원 권한이 있으면 복원 링크 변형, 없으면 이름 바꾸기 평문).
export function nameConflictMessage(opts: { archived: boolean; canRestore?: boolean }): string {
  if (!opts.archived) return NAME_CONFLICT_ACTIVE_MESSAGE;
  return opts.canRestore ? NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE : NAME_CONFLICT_ARCHIVED_RENAME_MESSAGE;
}
