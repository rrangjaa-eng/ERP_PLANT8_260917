import { remainingForInstallments, type Money } from "@/domain/money";

// 05-03(EXP-01): 견적 줄 하나의 지출결의 문 — 순수 함수. 06-02의 resolveLineDoor(지급 축)와 다른 축이라 이름이 다르다.
// none = 견적 줄이 아님(견적 외 비용 · 조정) · 취소, no_vendor = 거래처 없음, closed = 자기 밖에 번호 있는 비분할 문서가
// 있거나 남은 실행가가 0 이하, 그 밖 open. 앞 회차가 있으면 이번 문서는 분할로 강제된다.

export type ExpenseLineDoorState = "open" | "closed" | "no_vendor" | "none";

export type LineDoorNumbered = { id: string; number: string; installment: boolean; supply: Money };

export type ExpenseLineDoor = {
  state: ExpenseLineDoorState;
  latest?: { id: string; number: string };
  remaining: Money | null;
  nextInstallmentSeq: number | null;
  forcedInstallment: boolean;
};

export function expenseLineDoor(input: {
  line: { lineKind: string; cancelled: boolean; vendorId: string | null; execution: Money };
  // 번호 있는 문서 — 제출 순.
  numbered: readonly LineDoorNumbered[];
  selfId?: string;
}): ExpenseLineDoor {
  const { line } = input;
  if (line.lineKind !== "quote" || line.cancelled) {
    return { state: "none", remaining: null, nextInstallmentSeq: null, forcedInstallment: false };
  }
  if (!line.vendorId) return { state: "no_vendor", remaining: null, nextInstallmentSeq: null, forcedInstallment: false };

  const others = input.numbered.filter((doc) => doc.id !== input.selfId);
  const last = others.at(-1);
  const latest = last ? { id: last.id, number: last.number } : undefined;
  const { remaining } = remainingForInstallments(
    line.execution,
    others.map((doc) => doc.supply),
  );
  const closed = others.some((doc) => !doc.installment) || remaining.amountKrw <= 0;
  return {
    state: closed ? "closed" : "open",
    ...(latest ? { latest } : {}),
    remaining,
    nextInstallmentSeq: closed ? null : others.length + 1,
    forcedInstallment: others.length > 0,
  };
}
