// 임자 없는 증빙(N21 · D-721 · AQ-25) — 06.1 증빙 목록 「공개」 거르개(공개됐는데 붙임 0 — 같은 stateWhere)에서 등록 N일(기본 7) 넘은 건수를
// 증빙 담당(evidence.intake 쓰기 권한 활성 사용자)마다 하루 한 행(entity `evidence-orphans`, entityId = 오늘). 사다리 없음 · 꺼 둔 종류.
import { CARD_FORMATS } from "@/domain/evidence-records";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { shiftDate } from "@/domain/notify/kinds/ladder-support";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { kstDayStart } from "@/lib/kst-date";
import { countPublishedUnattachedBefore } from "@/repositories/evidence-records";
import { listMenuWriterIds } from "@/repositories/notify-sources";

const DEFAULT_DAYS = 7;

export const orphanEvidenceKind: ConditionKind = {
  kind: "orphan-evidence",
  label: "임자 없는 증빙",
  dateUnit: "calendar",
  defaults: { enabled: false, days: DEFAULT_DAYS, emailEnabled: true },
  daysRange: { min: 1, max: 60 },
  defaultRecipientLabel: "증빙 담당",
  async evaluate(ctx) {
    const days = ctx.params?.days ?? DEFAULT_DAYS;
    // 등록 KST 날짜가 오늘 − N 이하인 것(다른 종류의 「+N일에 기한」과 같은 셈).
    const count = await countPublishedUnattachedBefore(
      SYSTEM_VIEWER,
      { cardFormats: CARD_FORMATS, createdBefore: kstDayStart(shiftDate(ctx.today, -days + 1)) },
      ctx.tx,
    );
    if (count === 0) return [];
    const recipients = await listMenuWriterIds(SYSTEM_VIEWER, "evidence.intake", ctx.today, ctx.tx);
    return recipients.map(
      (recipientId): NotificationCandidate => ({
        entity: "evidence-orphans",
        entityId: ctx.today,
        recipientId,
        round: 1,
        referenceDate: ctx.today,
        message: `임자 없는 증빙 · 등록 ${days}일 · ${count}건`,
      }),
    );
  },
};
