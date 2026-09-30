// 알림 조건 종류 등록부(NOTI-03 틀). tick이 종류마다 evaluate({ today })로 후보를 모은다.

export type NotificationCandidate = {
  entity: string;
  entityId: string;
  recipientId: string;
  round: number;
  // YYYY-MM-DD(KST) — 조건이 가리키는 날. 상한으로 자를 때 오래된 건 우선의 기준.
  referenceDate: string;
  message: string;
};

export type ConditionKind = {
  kind: string;
  label: string;
  // D-709: 기한을 영업일로 세는지 달력일로 세는지(Phase 7이 쓴다).
  dateUnit: "business" | "calendar";
  evaluate(ctx: { today: string }): Promise<NotificationCandidate[]>;
};

// 실제 조건 종류는 Phase 7(NOTI-03)이 더한다 — 테스트 종류는 여기 등록하지 않는다.
// evaluate는 today까지 기한이 된 발생을 모두 안정된 키로 돌려준다 — 그날 기한만 돌려주면 주말·상한 초과분을 잃는다. 평가량 한도는 종류가 자기 쿼리에 둔다.
export const CONDITION_KINDS: readonly ConditionKind[] = [];
