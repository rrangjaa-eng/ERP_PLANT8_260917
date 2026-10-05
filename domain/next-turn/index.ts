import type { Viewer } from "@/domain/viewer";
import { listMyBlockedDocuments, listMyInbox, type ApprovalDeps, type ApprovalInboxItem, type DocumentMeasure } from "@/domain/approvals";
import { formatKrw } from "@/lib/format-number";

// 05-10 S11(06 UA-611): 첫 화면 「내 차례」 공급 함수. 06 S19가 같은 함수에 경영관리 · PM 항목을 더한다.
// 이 함수는 종류 이름으로 분기하지 않는다 — 대상 · 상황 · 숫자 글자는 전부 종류 요약(nextTurnText · measure)에서 온다.

export type NextTurnEntry = {
  key: string;
  tag: "결재" | "막힘";
  // `{대상} — {상황}`. 이유 칸은 쓰지 않는다(상황이 같은 줄에 있다 — §7-4).
  label: string;
  reason: string;
  // 숫자 칸 글자 — 돈은 원화, 일수는 종류가 만든 글자, 숫자 없는 종류는 `—`, 투영에서 빠졌으면 빈 글자.
  measureText: string;
  action: { label: string; href: string };
  // [결재] 행 — 행동 참조(인스턴스 id · version)와 결재 시트 재료. 투영을 지난 결재함 항목 그대로다.
  approval?: ApprovalInboxItem;
};

function measureTextOf(measure: DocumentMeasure | null | undefined): string {
  if (measure === undefined) return "";
  if (measure === null) return "—";
  return measure.kind === "days" ? measure.text : formatKrw(measure.money.amountKrw);
}

export async function listNextTurnItems(viewer: Viewer, deps?: ApprovalDeps): Promise<NextTurnEntry[]> {
  const inbox = await listMyInbox(viewer, deps);
  const entries: NextTurnEntry[] = [];
  for (const item of inbox.mine) {
    const text = item.summary?.nextTurnText;
    entries.push({
      key: `approve-${item.instanceId}`,
      tag: "결재",
      label: text ? `${text.target} — ${text.situation}` : (item.kindLabel ?? ""),
      reason: "",
      measureText: measureTextOf(item.summary?.measure),
      action: { label: `${item.kindLabel} 열기`, href: item.href },
      approval: item,
    });
  }
  // [막힘] — 내가 기안한 문서의 반려(이유 = `{종류 라벨} 반려, {반려자}`)와 승인 뒤 종류가 알린 막힘(종류 필드 blockedAfterApproval — 글자 · 주소는 종류가 준다). 반려가 먼저.
  for (const item of await listMyBlockedDocuments(viewer, deps)) {
    const { cause } = item;
    const situation = cause.type === "rejected" ? [`${item.kindLabel} 반려`, cause.rejecterName].filter(Boolean).join(", ") : cause.situation;
    const action = cause.type === "rejected" ? { label: `${item.kindLabel} 열기`, href: item.href } : { label: cause.actionLabel, href: cause.href };
    const target = item.summary?.nextTurnText?.target;
    entries.push({
      key: `blocked-${item.instanceId}`,
      tag: "막힘",
      label: target ? `${target} — ${situation}` : situation,
      reason: "",
      measureText: measureTextOf(item.summary?.measure),
      action,
    });
  }
  return entries;
}
