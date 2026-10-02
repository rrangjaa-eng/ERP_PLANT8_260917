import { z } from "zod";

// 04.5-01: 화면 항목(커스텀 칸) 생성 입력 — 대상(entity)은 받지 않는다(서버가 거래처를 넣는다,
// T-04.5-02). 선택형은 02가 더한다. 칸 오류 문구 · 길이 · 범위 · 이름 충돌 문구는 08이 더한다.
export const createFieldDefinitionInput = z
  .object({
    name: z.string().trim().min(1),
    type: z.enum(["text", "number", "date"]),
    required: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict();

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionInput>;
