"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { authedActionClient } from "@/lib/actions/client";
import { createVendor, updateVendor, setVendorHidden, revealAccountNumber } from "@/domain/vendors";
import { CustomFieldsInvalidError } from "@/domain/custom-fields/preserve";
import { archive } from "@/domain/archive";
import "./actions.registry";

// MAST-01: domain/vendors만 부른다. 등록은 ./actions.registry로 분리(03-03
// 선례 — 누수 스캔이 server-only 의존 체인인 이 파일을 직접 import할 수 없다).
const customFieldsSchema = z.record(z.string(), z.unknown()).optional();

// 04.5-05: 스키마는 모듈 안 비공개 상수 — "use server" 파일은 async 함수 밖을 내보낼 수 없다.
const createVendorSchema = z.object({
  name: z.string().min(1, "이름 필요 · 이름 입력"),
  businessNo: z.string().optional(),
  defaultEvidenceType: z.string().optional(),
  accountBank: z.string().optional(),
  accountHolder: z.string().optional(),
  accountNumber: z.string().optional(),
  customFields: customFieldsSchema,
});

const updateVendorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "이름 필요 · 이름 입력"),
  businessNo: z.string().optional(),
  defaultEvidenceType: z.string().optional(),
  accountBank: z.string().optional(),
  accountHolder: z.string().optional(),
  // M-5: undefined(키 자체를 보내지 않음) = 안 바꿈 · null = 지움 · 문자열 =
  // 새 값. ""는 여기서 막지 않고 domain의 planAccountNumberUpdate가 "안
  // 바꿈"으로 처리한다(편집 폼이 빈 칸을 그냥 보낼 수도 있어 액션 계층에서
  // 거부하면 자연스러운 "안 바꿈" 조작이 에러가 된다).
  accountNumber: z.string().nullable().optional(),
  customFields: customFieldsSchema,
});

// 04.5-05: 커스텀 칸 오류는 폼 전체 serverError가 아니라 칸별 validationErrors.customFields.{key}._errors로 돌려준다
// (칸 정렬 순서 그대로 — 06이 칸 아래 · 이유 자리에 그린다). 다른 오류는 그대로 던져 handleServerError로 간다.
function customFieldErrors(error: CustomFieldsInvalidError): Record<string, { _errors: string[] }> {
  return Object.fromEntries(Object.entries(error.fieldErrors).map(([key, message]) => [key, { _errors: [message] }]));
}

export const createVendorAction = authedActionClient
  .schema(createVendorSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const result = await createVendor(ctx.viewer, parsedInput);
      revalidatePath("/admin/vendors");
      return result;
    } catch (error) {
      if (error instanceof CustomFieldsInvalidError) {
        returnValidationErrors(createVendorSchema, { customFields: customFieldErrors(error) });
      }
      throw error;
    }
  });

export const updateVendorAction = authedActionClient
  .schema(updateVendorSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...input } = parsedInput;
    try {
      const vendor = await updateVendor(ctx.viewer, id, input);
      revalidatePath("/admin/vendors");
      return { vendor };
    } catch (error) {
      if (error instanceof CustomFieldsInvalidError) {
        returnValidationErrors(updateVendorSchema, { customFields: customFieldErrors(error) });
      }
      throw error;
    }
  });

export const setVendorHiddenAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), hidden: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await setVendorHidden(ctx.viewer, parsedInput.id, parsedInput.hidden);
    revalidatePath("/admin/vendors");
  });

// 평문은 이 액션의 반환값으로만 나간다 — URL·쿠키·헤더에 담지 않는다.
export const revealVendorAccountNumberAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const value = await revealAccountNumber(ctx.viewer, parsedInput.id);
    return { value };
  });

// 03-07: 「삭제」 — domain/archive의 보관 함수만 부른다.
export const archiveVendorAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "vendor", parsedInput.id);
    revalidatePath("/admin/vendors");
    revalidatePath("/admin/archive");
  });
