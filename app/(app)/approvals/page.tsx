import type { ReactNode } from "react";
import { requireSession } from "@/lib/viewer";
import { kstDateOf } from "@/lib/kst-date";
import "@/app/(app)/document-kinds";
import {
  listMyInbox,
  REJECT_REASON_EMPTY_MESSAGE,
  REJECT_REASON_MAX,
  REJECT_REASON_TOO_LONG_MESSAGE,
  type ApprovalInboxItemDto,
  type DocumentMeasure,
  type DocumentSummary,
} from "@/domain/approvals";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { Num } from "@/ui/num/Num";
import type { StatusWord } from "@/ui/status-tag/status-map";
import { toLeaveStatusKey, type LeaveStatusKey } from "@/app/(app)/leave/status-display";
import { InboxTable, type InboxRow } from "./inbox-table";
import { toDecision, toSheet } from "./sheet-material";

// 04.1-02 S4 첫 형태 — 개인 결재함. 메뉴 게이트가 없다(세션만) — 내용은 결재선 후보 · 처리 기록으로만
// 정해진다(listMyInbox). 그룹 `내 결재`(지금 내가 담당) · `처리함`(내가 처리한 최근 50건).
// 문서 종류 등록은 document-kinds 한 곳으로 보장한다(CEO-3). WR-07: 세션 검사를 이 페이지가 직접 한다.
export const dynamic = "force-dynamic";

// 05-01(Round 4 D8): 숫자 칸 — 종류 요약 measure(금액 = 원화 1행 · 외화면 2행 / 일수 = 종류가 만든 글자 / null = 숫자 없는 종류 `—` /
// 필드째 없음 = 투영에서 빠짐 → 빈 칸).
function measureCell(measure: DocumentMeasure | null | undefined): ReactNode {
  if (measure === undefined) return "";
  if (measure === null) return <Num value={null} />;
  if (measure.kind === "days") return measure.text;
  const { money } = measure;
  const fx = money.currency === "KRW" ? undefined : { currency: money.currency, amount: money.amount, rate: money.fxRate };
  return <Num value={money.amountKrw} fx={fx} />;
}

// 처리함 상태 낱말 — 문서 상태 → 상태 배지 낱말(색은 `StatusTag`의 표 한 곳이 정한다). 결재선 목록 전용 키는 처리함에 오지 않는다.
function processedStatusWord(key: LeaveStatusKey | null, stepLabel: string | null | undefined): StatusWord | null {
  switch (key) {
    case "submitted":
    case "in_review":
      return stepLabel ? `${stepLabel} 결재 중` : "결재 중";
    case "approved":
      return "승인";
    case "rejected":
      return "반려";
    case "withdrawn":
      return "회수";
    case "draft":
      return "임시";
    default:
      return null;
  }
}

function toRow(item: Partial<ApprovalInboxItemDto>, group: InboxRow["group"]): InboxRow {
  const summary: DocumentSummary = item.summary ?? {};
  const status = group === "processed" ? processedStatusWord(toLeaveStatusKey(item.status), item.stepLabel) : null;
  return {
    id: `${group}:${item.instanceId ?? item.documentId ?? ""}`,
    group,
    instanceId: item.instanceId ?? null,
    version: item.version ?? null,
    href: item.href ?? null,
    document: [item.kindLabel, summary.documentText].filter(Boolean).join(" · "),
    drafter: [item.drafterName, item.submittedAt ? kstDateOf(item.submittedAt).slice(5) : null].filter(Boolean).join(" · "),
    measure: measureCell(summary.measure),
    status,
    actions: group === "mine" ? (item.actions ?? []) : [],
    // 잔여 초과 줄(종류가 준 상세 행의 경고 한 줄) — `내 결재`만 상세를 읽는다(UI-SPEC S4 · /design-review).
    // 05-10: 잔여 초과는 잔고 행의 경고 줄이다 — 지출결의의 세율 바뀜 경고 줄은 표 문서 칸에 올리지 않는다(시트에서 본다).
    overdraw: group === "mine" ? (item.detail?.rows.find((row) => row.tone === "warning" && row.label === "잔고")?.value ?? null) : null,
    // 시트 행(증빙 evidence 갈래 포함)은 sheet-material이 만든다 — 첫 화면 「내 차례」와 같은 재료.
    sheet: group === "mine" ? toSheet(item) : null,
    decision: group === "mine" ? toDecision(item, summary) : null,
  };
}

export default async function ApprovalsPage() {
  const { viewer } = await requireSession();
  // 상세까지 한 번에 — 같은 노출 메모 · 종류마다 loadDetails 한 번(CEO-17).
  const inbox = await listMyInbox(viewer, { withDetails: true });
  const rows = [...inbox.mine.map((item) => toRow(item, "mine")), ...inbox.processed.map((item) => toRow(item, "processed"))];

  return (
    <ListScreen title="결재">
      {rows.length === 0 ? (
        <ListEmpty message="결재할 건이 없습니다" action={{ label: "연차 목록 보기", href: "/leave" }} />
      ) : (
        <InboxTable
          rows={rows}
          measureHeader={inbox.measureHeader}
          rejectMessages={{ empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX }}
        />
      )}
    </ListScreen>
  );
}
