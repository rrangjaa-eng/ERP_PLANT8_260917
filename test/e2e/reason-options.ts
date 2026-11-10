import { randomUUID } from "node:crypto";
import { expect, type Locator } from "@playwright/test";
import { createCodeItem, setCodeItemActive } from "@/domain/code-tables";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 07.2-07 — 사유 목록은 전역 코드표라 시험이 등록한 항목은 끝에 비활성으로 돌려놓는다.
// desktop 프로젝트는 워커가 둘 이상이라 다른 워커가 같은 표에 등록한 항목이 동시에 활성일 수 있다 — 그래서 문구마다 시험 고유 꼬리표를 붙이고
// (`labels`), 목록 전체가 아니라 「내가 등록한 문구만 그 순서로」 단언한다(expectSeededReasonOptions). 「항목 0건」 단언은 직렬 스펙
// (reason-options-empty.spec.ts · desktop-settings)에서만 한다.
export type ReasonTableKey = "reject_reason" | "prepaid_reason" | "requested_payment_reason";

export type SeededReasonOptions = { labels: string[]; restore: () => Promise<void> };

export async function seedReasonOptions(tableKey: ReasonTableKey, baseLabels: string[]): Promise<SeededReasonOptions> {
  const tag = randomUUID().slice(0, 6);
  const labels = baseLabels.map((label) => `${label} ${tag}`);
  const ids: string[] = [];
  for (const [index, label] of labels.entries()) {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: `e2e-${randomUUID().slice(0, 8)}`, label, sortOrder: index + 1 });
    ids.push(dto.id);
  }
  return {
    labels,
    restore: async () => {
      for (const id of ids) await setCodeItemActive(SYSTEM_VIEWER, id, false);
    },
  };
}

// 고르개 옵션 = 자리표시(처음) + (남의 항목이 섞여 있을 수 있음) + 기타(끝). 내 문구는 등록한 순서대로 모두 있어야 한다.
export async function expectSeededReasonOptions(options: Locator, labels: string[]): Promise<void> {
  await expect
    .poll(async () => {
      const texts = (await options.allInnerTexts()).map((text) => text.trim());
      return {
        first: texts[0],
        last: texts[texts.length - 1],
        mine: texts.filter((text) => labels.includes(text)),
      };
    })
    .toEqual({ first: "사유 고르기", last: "기타", mine: labels });
}
