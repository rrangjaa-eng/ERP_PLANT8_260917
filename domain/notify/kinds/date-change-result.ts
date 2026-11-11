// 희망 지급일 변경 결과(07.2-18 X4 · D-7296 · D-7301) — 경영관리가 요청을 승인 · 거절하면 요청자(기안자)에게 `변경 요청 승인됨 · MM-DD` /
// `변경 요청 거절됨 · {메모}`(거절 메모 원문 — D-7296 · 위협 T-07.2-18-06 accept). 사건 종류 · 다음 영업일 9시 tick 묶음(즉시 경로 없음, AQ-18).
// 원천은 요청 표의 approved/rejected만 — 60초 안에 되돌린 승인은 pending으로 돌아가 읽기에서 빠진다(디자인 D-F4). 처리자가 요청자 본인이면
// 알리지 않는다(expense-result의 본인 행동 제외와 같은 결). 사건 키 `{지출결의 id}:{요청 id}:{상태}` · 활성 사용자만. 금액 · 계좌 없음.
import { toKstDate } from "@/domain/holidays/business-day";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listDateChangeDecisionsSince } from "@/repositories/expense-date-change-requests";
import { listOrgSnapshot } from "@/repositories/org-snapshot";

const KIND = "date-change-result";

export const dateChangeResultKind: ConditionKind = {
  kind: KIND,
  label: "희망 지급일 변경 결과",
  dateUnit: "calendar",
  defaults: { enabled: true, emailEnabled: true },
  defaultRecipientLabel: "기안자",
  // 본문의 새 희망일 · 거절 메모는 이력 DTO에서 expense.value 칸 — 받는 사람 계급이 그 항목을 볼 때만 행(tick 거르개 · G-61 · Codex P2).
  recipientInfoItem: "expense.value",
  async evaluate(ctx) {
    if (!ctx.since) return [];
    const rows = capRows(KIND, await listDateChangeDecisionsSince(SYSTEM_VIEWER, ctx.since, NOTIFY_KIND_EVAL_MAX, ctx.tx), NOTIFY_KIND_EVAL_MAX).filter(
      (row) => row.decidedBy !== row.requestedBy,
    );
    if (rows.length === 0) return [];
    const active = new Map((await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx)).map((person) => [person.id, person.roleId]));
    const candidates: NotificationCandidate[] = [];
    for (const row of rows) {
      if (!active.has(row.requestedBy)) continue;
      candidates.push({
        entity: "expense",
        entityId: `${row.expenseId}:${row.requestId}:${row.status}`,
        recipientId: row.requestedBy,
        recipientRoleId: active.get(row.requestedBy) ?? null,
        round: 1,
        referenceDate: toKstDate(row.at),
        message: row.status === "approved" ? `변경 요청 승인됨 · ${row.newDate.slice(5)}` : `변경 요청 거절됨 · ${row.rejectMemo ?? ""}`,
      });
    }
    return candidates;
  },
};
