"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createCorpCard, updateCorpCardOwner, setCorpCardActive } from "@/domain/corp-cards";
import "./actions.registry";

// MAST-03: domain/corp-cards만 부른다. 등록은 ./actions.registry로 분리
// (03-03 선례 — 누수 스캔이 server-only 의존 체인인 이 파일을 직접 import할
// 수 없다).

const LAST4_PATTERN = /^\d{4}$/;

export const createCorpCardAction = authedActionClient
  .schema(
    z.object({
      issuer: z.string().min(1, "발급사를 입력하세요."),
      numberLast4: z.string().regex(LAST4_PATTERN, "숫자 4자리를 입력하세요."),
      label: z.string().min(1, "별칭을 입력하세요."),
      holderUserId: z.string().min(1).optional(),
      teamId: z.string().min(1).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const dto = await createCorpCard(ctx.viewer, parsedInput);
    revalidatePath("/admin/corp-cards");
    return dto;
  });

// 소지자와 팀을 동시에 받으면 서버가 domain에 도달하기 전에 거부한다
// (zod superRefine — T-03-33 세 겹 방어 중 액션 계층).
export const updateCorpCardOwnerAction = authedActionClient
  .schema(
    z
      .object({
        id: z.string().min(1),
        holderUserId: z.string().min(1).optional(),
        teamId: z.string().min(1).optional(),
      })
      .superRefine((value, ctx) => {
        const hasHolder = Boolean(value.holderUserId);
        const hasTeam = Boolean(value.teamId);
        if (hasHolder === hasTeam) {
          ctx.addIssue({
            code: "custom",
            message: "소지자 또는 팀 중 정확히 하나를 선택하세요.",
            path: ["holderUserId"],
          });
        }
      }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await updateCorpCardOwner(ctx.viewer, parsedInput.id, {
      holderUserId: parsedInput.holderUserId,
      teamId: parsedInput.teamId,
    });
    revalidatePath("/admin/corp-cards");
  });

export const setCorpCardActiveAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), active: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await setCorpCardActive(ctx.viewer, parsedInput.id, parsedInput.active);
    revalidatePath("/admin/corp-cards");
  });
