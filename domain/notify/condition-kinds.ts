// 알림 조건 종류 등록부(NOTI-03). tick이 종류마다 규칙(기본값 ⊕ notification_rules 행)을 합쳐 evaluate(ctx)로 후보를 모은다.
import { approvalWaitingKind } from "@/domain/notify/kinds/approval-waiting";
import { expenseResultKind } from "@/domain/notify/kinds/expense-result";
import { orphanEvidenceKind } from "@/domain/notify/kinds/orphan-evidence";
import { paidNoEvidenceKind } from "@/domain/notify/kinds/paid-no-evidence";
import { preCutoffUnapprovedKind } from "@/domain/notify/kinds/pre-cutoff-unapproved";
import { payWeekAlertKind } from "@/domain/notify/kinds/pay-week-alert";
import { prepaidEvidenceKind } from "@/domain/notify/kinds/prepaid-evidence";
import { projectEndNoExpenseKind } from "@/domain/notify/kinds/project-end-no-expense";
import { proxyRegisteredKind } from "@/domain/notify/kinds/proxy-registered";
import { collectionOverdueKind } from "@/domain/notify/kinds/collection-overdue";
import { quoteNudgeKind } from "@/domain/notify/kinds/quote-nudge";
import { rejectedIdleKind } from "@/domain/notify/kinds/rejected-idle";
import { settleNudgeKind } from "@/domain/notify/kinds/settle-nudge";
import { vendorAccountChangedKind } from "@/domain/notify/kinds/vendor-account-changed";
import type { NotifyTx } from "@/repositories/notifications";

export { NOTIFY_EVENT_LOOKBACK_DAYS, NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";

export type NotificationCandidate = {
  entity: string;
  entityId: string;
  recipientId: string;
  round: number;
  // YYYY-MM-DD(KST) — 조건이 가리키는 날. 상한으로 자를 때 오래된 건 우선의 기준.
  referenceDate: string;
  message: string;
  // 07-22(G-61) — 받는 사람의 계급. 종류에 recipientInfoItem이 있으면 tick이 이 계급의 정보 항목 노출로 거른다(없으면 버린다).
  recipientRoleId?: string | null;
};

export type EvaluateContext = {
  // 오늘 KST 날짜(YYYY-MM-DD).
  today: string;
  // 규칙이 정한 일수(종류 허용 범위 안의 값만 — 없으면 undefined, 종류가 자기 기본을 쓴다).
  params?: { days?: number };
  // 사건 종류의 되돌아보기 하한 = max(오늘 KST 00:00 - 14일, 규칙 enabled_at). 창 안 사건을 사건 키로 모두 돌려주면 중복은 dedup 키가 막는다.
  since?: Date;
  // tick 잠금 트랜잭션(R8) — 종류의 읽기는 이 tx를 repository에 넘겨 풀의 다른 연결을 잡지 않는다.
  tx?: NotifyTx;
};

export type ConditionKind = {
  kind: string;
  label: string;
  // D-709: 기한을 영업일로 세는지 달력일로 세는지(종류가 단위를 가진다 — 관리자 단위 칸 없음).
  dateUnit: "business" | "calendar";
  // 코드 기본값(규칙 행이 NULL이면 이 값) — DB 시드로 넣지 않는다.
  defaults: { enabled: boolean; days?: number; emailEnabled: boolean };
  // 일수 칸의 허용 범위 — 없으면 일수 칸이 없는 종류.
  daysRange?: { min: number; max: number };
  // 독촉 사다리(3영업일마다 회차, 3회 상한) 종류인지.
  ladder?: boolean;
  // 규칙 화면 읽기 줄의 기본 받는 사람 글자(07-19) — 판정과 무관.
  defaultRecipientLabel: string;
  // 07-22(G-61 · D-748) — 받는 사람의 계급이 이 정보 항목을 볼 때만 행(담당 PM · 받는 계급 추가 모두). 없으면 거르지 않는다.
  recipientInfoItem?: string;
  evaluate(ctx: EvaluateContext): Promise<NotificationCandidate[]>;
};

// 실제 조건 종류는 Phase 7(NOTI-03)이 더한다 — 테스트 종류는 여기 등록하지 않는다.
// evaluate는 today까지 기한이 된 발생을 모두 안정된 키로 돌려준다 — 그날 기한만 돌려주면 주말·상한 초과분을 잃는다. 평가량 한도는 종류가 자기 쿼리에 둔다.
export const CONDITION_KINDS: readonly ConditionKind[] = [
  projectEndNoExpenseKind,
  payWeekAlertKind,
  approvalWaitingKind,
  paidNoEvidenceKind,
  prepaidEvidenceKind,
  proxyRegisteredKind,
  // 07-14 꺼 둔 종류(D17 · 시드 끔) — SC-07 표 순서.
  expenseResultKind,
  preCutoffUnapprovedKind,
  settleNudgeKind,
  rejectedIdleKind,
  quoteNudgeKind,
  // 07-23(N14 · D-716) 계좌 바뀜 — SC-07 표에서 견적 재촉 다음 · 임자 없는 증빙 앞(꺼 둔 종류).
  vendorAccountChangedKind,
  orphanEvidenceKind,
  // 07-22(N22 · D-716) 수금 지연 — SC-07 마지막 행.
  collectionOverdueKind,
];
