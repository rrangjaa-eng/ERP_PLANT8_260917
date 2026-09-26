"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createVendor, updateVendor, setVendorHidden, revealAccountNumber } from "@/domain/vendors";
import { archive } from "@/domain/archive";
import "./actions.registry";

// MAST-01: domain/vendors만 부른다. 등록은 ./actions.registry로 분리(03-03
// 선례 — 누수 스캔이 server-only 의존 체인인 이 파일을 직접 import할 수 없다).
const customFieldsSchema = z.record(z.string(), z.unknown()).optional();

export const createVendorAction = authedActionClient
  .schema(
    z.object({
      name: z.string().min(1, "이름 필요 · 이름 입력"),
      businessNo: z.string().optional(),
      defaultEvidenceType: z.string().optional(),
      accountBank: z.string().optional(),
      accountHolder: z.string().optional(),
      accountNumber: z.string().optional(),
      customFields: customFieldsSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await createVendor(ctx.viewer, parsedInput);
    revalidatePath("/admin/vendors");
    return result;
  });

export const updateVendorAction = authedActionClient
  .schema(
    z.object({
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
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...input } = parsedInput;
    const vendor = await updateVendor(ctx.viewer, id, input);
    revalidatePath("/admin/vendors");
    return { vendor };
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
