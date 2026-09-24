"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import {
  createCodeItem,
  setCodeItemActive,
  updateCodeItemLabel,
  updateCodeItemDescription,
  setEvidenceTypeTaxRule,
} from "@/domain/code-tables";
import { taxRuleSchema } from "@/domain/code-tables/tax-rule";
import { archive } from "@/domain/archive";
import "./actions.registry";

// MAST-04: 두 액션이 domain/code-tables만 부르고 리포지토리·db 계층을 직접
// import하지 않는다(기존 boundaries가 이미 금지한다). 액션 레지스트리 등록은
// ./actions.registry로 옮겼다(03-03, Rule 3 — server-only 의존 체인 때문에
// 누수 스캔이 이 파일을 직접 import할 수 없다).
export const createCodeItemAction = authedActionClient
  .schema(
    z.object({
      tableKey: z.string().min(1),
      value: z.string().min(1, "값을 입력하세요."),
      label: z.string().min(1, "이름을 입력하세요."),
      sortOrder: z.coerce.number().int().default(0),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await createCodeItem(ctx.viewer, parsedInput);
    revalidatePath("/admin/code-tables");
  });

// MAST-04 「수정」 — 이름만 바꾼다. value를 스키마에 넣지 않는 것이 계약이다:
// vendors.default_evidence_type이 FK 없이 value 문자열을 참조한다.
export const updateCodeItemLabelAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), label: z.string().min(1, "이름을 입력하세요.") }))
  .action(async ({ parsedInput, ctx }) => {
    await updateCodeItemLabel(ctx.viewer, parsedInput.id, parsedInput.label);
    revalidatePath("/admin/code-tables");
  });

// 04-10(D-93): 설명 저장 — 길이 검증(40자)은 domain(updateCodeItemDescription)이
// 한다. 빈 문자열도 유효한 입력이다(C-13 — 지우기).
export const updateCodeItemDescriptionAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), description: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    await updateCodeItemDescription(ctx.viewer, parsedInput.id, parsedInput.description);
    revalidatePath("/admin/code-tables");
  });

export const setCodeItemActiveAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), active: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await setCodeItemActive(ctx.viewer, parsedInput.id, parsedInput.active);
    revalidatePath("/admin/code-tables");
  });

// 03-06: 증빙 종류 항목의 세금 규칙 저장. taxRuleSchema를 그대로 액션
// 스키마로 재사용한다(domain의 검증 계약과 화면의 입력 검증이 갈라지지
// 않는다). domain이 evidence_type 항목이 아니면 거부한다.
export const setEvidenceTypeTaxRuleAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), taxRule: taxRuleSchema }))
  .action(async ({ parsedInput, ctx }) => {
    await setEvidenceTypeTaxRule(ctx.viewer, parsedInput.id, parsedInput.taxRule);
    revalidatePath("/admin/code-tables");
  });

// 03-07: 「삭제」 — domain/archive의 보관 함수만 부른다(03-01의 유일한
// 진입점).
export const archiveCodeItemAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "code_items", parsedInput.id);
    revalidatePath("/admin/code-tables");
    revalidatePath("/admin/archive");
  });
