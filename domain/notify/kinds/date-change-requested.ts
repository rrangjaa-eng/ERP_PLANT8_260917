// 희망 지급일 변경 요청 도착(07.2-18 X4 · D-7296 · D-7301) — 기안자가 요청을 올리면 경영관리(지급 처리 쓰기 활성 사용자 · 자금 본부 거르개)에게
// `희망 지급일 변경 요청 도착 · {번호}`. 즉시 행 생성 경로가 없어(expense-result.ts AQ-18) 사건 종류로 다음 영업일 9시 tick 묶음에 나간다.
// 고정 되돌아보기 창(ctx.since) 안에 생긴 대기 요청만 — 철회 · 처리된 요청은 읽기에서 빠진다. 사건 키 entityId = `{지출결의 id}:{요청 id}`
// (entity `expense` — 알림 링크가 첫 `:` 앞 문서 id로 상세를 연다). 요청자 본인은 받지 않는다. 금액 · 계좌 · 사유 글 없음.
// 기본 켬 · 이메일 켬(플래너 가정 — D-7290 · D-7296 「결과 알림 요구」라 07-14 꺼 둔 사건 종류와 다르게) · 관리자 규칙 화면에서 끌 수 있다.
import { toKstDate } from "@/domain/holidays/business-day";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { paymentManagers } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listDateChangeRequestsSince } from "@/repositories/expense-date-change-requests";
import { listOrgSnapshot } from "@/repositories/org-snapshot";

const KIND = "date-change-requested";

export const dateChangeRequestedKind: ConditionKind = {
  kind: "date-change-requested",
  label: "희망 지급일 변경 요청",
  dateUnit: "calendar",
  defaults: { enabled: true, emailEnabled: true },
  defaultRecipientLabel: "경영관리",
  // 본문의 문서 번호는 문서 DTO에서 expense.value 칸 — 받는 사람 계급이 그 항목을 볼 때만 행(tick 거르개 · G-61 · Codex P2).
  recipientInfoItem: "expense.value",
  async evaluate(ctx) {
    if (!ctx.since) return [];
    const rows = capRows(KIND, await listDateChangeRequestsSince(SYSTEM_VIEWER, ctx.since, NOTIFY_KIND_EVAL_MAX, ctx.tx), NOTIFY_KIND_EVAL_MAX);
    if (rows.length === 0) return [];
    const recipients = await paymentManagers(ctx.today, ctx.tx);
    const roles = new Map((await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx)).map((person) => [person.id, person.roleId]));
    const candidates: NotificationCandidate[] = [];
    for (const row of rows) {
      for (const recipientId of recipients) {
        if (recipientId === row.requestedBy) continue;
        candidates.push({
          entity: "expense",
          entityId: `${row.expenseId}:${row.requestId}`,
          recipientId,
          recipientRoleId: roles.get(recipientId) ?? null,
          round: 1,
          referenceDate: toKstDate(row.at),
          message: `희망 지급일 변경 요청 도착 · ${row.number ?? "지출결의"}`,
        });
      }
    }
    return candidates;
  },
};
