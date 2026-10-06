import { remainingForInstallments, type Money } from "@/domain/money";

// 05-03(EXP-01): 견적 줄 하나의 지출결의 문 — 순수 함수. 06-02의 resolveLineDoor(지급 축)와 다른 축이라 이름이 다르다.
// none = 견적 줄이 아님(견적 외 비용 · 조정) · 취소, no_vendor = 거래처 없음, closed = 자기 밖에 번호 있는 비분할 문서가
// 있거나 남은 실행가가 0 이하, 그 밖 open. 앞 회차가 있으면 이번 문서는 분할로 강제된다.

export type ExpenseLineDoorState = "open" | "closed" | "no_vendor" | "none";

export type LineDoorNumbered = { id: string; number: string; installment: boolean; installmentSeq: number | null; supply: Money };

// 줄(계보)에 들어갈 회차 — 자기 회차(다시 제출 문서)가 있고 다른 문서가 쓰지 않으면 그대로, 아니면 남은 회차 중 가장 큰 값 + 1.
// 문서 수 + 1이 아니다 — 회수 · 반려 문서가 다른 줄로 옮겨 가면 빈 회차 번호가 생겨 수 + 1이 남은 회차와 겹친다(PR #162 독립 검토).
export function installmentSeqFor(others: readonly { installmentSeq: number | null }[], ownSeq: number | null = null): number {
  if (ownSeq !== null && !others.some((doc) => doc.installmentSeq === ownSeq)) return ownSeq;
  return others.reduce((max, doc) => Math.max(max, doc.installmentSeq ?? 0), 0) + 1;
}

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
    nextInstallmentSeq: closed ? null : installmentSeqFor(others),
    forcedInstallment: others.length > 0,
  };
}
