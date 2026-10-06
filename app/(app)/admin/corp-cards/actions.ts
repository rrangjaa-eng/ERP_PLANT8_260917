"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createCorpCard, updateCorpCardOwner, setCorpCardActive } from "@/domain/corp-cards";
import { archive } from "@/domain/archive";
import "./actions.registry";

// MAST-03: domain/corp-cards만 부른다. 등록은 ./actions.registry로 분리
// (03-03 선례 — 누수 스캔이 server-only 의존 체인인 이 파일을 직접 import할
// 수 없다).

const LAST4_PATTERN = /^\d{4}$/;
// 06-30(Q5 · C8): 카드 종류는 사람이 고른 값이다 — 칸 조합 판정 정본은 domain의 cardOwnerKind.
const CARD_KIND = z.enum(["personal", "team", "shared"]);

export const createCorpCardAction = authedActionClient
  .schema(
    z.object({
      issuer: z.string().min(1, "발급사 필요 · 발급사 입력"),
      numberLast4: z.string().regex(LAST4_PATTERN, "숫자 4자리 필요 · 끝 4자리 입력"),
      label: z.string().min(1, "별칭 필요 · 별칭 입력"),
      kind: CARD_KIND,
      holderUserId: z.string().min(1).optional(),
      teamId: z.string().min(1).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const dto = await createCorpCard(ctx.viewer, parsedInput);
    revalidatePath("/admin/corp-cards");
    return dto;
  });

// 고른 종류에 맞지 않는 소유 칸 조합(소지자 · 팀 둘 다, 공용인데 소유 칸 등)은 서버가
// domain에 도달하기 전에 거부한다(zod superRefine — T-03-33 세 겹 방어 중 액션 계층,
// 06-30 종류별). 표는 domain의 cardOwnerKind와 같다.
export const updateCorpCardOwnerAction = authedActionClient
  .schema(
    z
      .object({
        id: z.string().min(1),
        kind: CARD_KIND,
        holderUserId: z.string().min(1).optional(),
        teamId: z.string().min(1).optional(),
      })
      .superRefine((value, ctx) => {
        const hasHolder = Boolean(value.holderUserId);
        const hasTeam = Boolean(value.teamId);
        const valid =
          (value.kind === "personal" && hasHolder && !hasTeam) ||
          (value.kind === "team" && hasTeam && !hasHolder) ||
          (value.kind === "shared" && !hasHolder && !hasTeam);
        if (!valid) {
          ctx.addIssue({
            code: "custom",
            message: value.kind === "shared" ? "소유 칸 조합 오류 · 공용에 맞는 칸만" : "소지자·팀 중 하나 필요 · 하나만 선택",
            path: ["holderUserId"],
          });
        }
      }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await updateCorpCardOwner(ctx.viewer, parsedInput.id, {
      kind: parsedInput.kind,
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

// 03-07: 「삭제」 — domain/archive의 보관 함수만 부른다.
export const archiveCorpCardAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "corp_card", parsedInput.id);
    revalidatePath("/admin/corp-cards");
    revalidatePath("/admin/archive");
  });
