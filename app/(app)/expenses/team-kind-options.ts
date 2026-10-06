import { TEAM_EXPENSE_KINDS, TEAM_EXPENSE_KIND_LABELS } from "@/domain/expenses";
import type { SelectOption } from "@/ui/select/Select";

// 05-07 팀 비용 종류 Select 선택지 — 값 · 이름은 도메인 상수 그대로(`—`는 Select가 맨 앞에 둔다).
export function teamKindOptions(): SelectOption[] {
  return TEAM_EXPENSE_KINDS.map((value) => ({ value, label: TEAM_EXPENSE_KIND_LABELS[value] }));
}
