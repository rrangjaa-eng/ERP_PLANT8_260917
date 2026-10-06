import "@/app/(app)/document-kinds";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { REJECT_REASON_EMPTY_MESSAGE, REJECT_REASON_MAX, REJECT_REASON_TOO_LONG_MESSAGE } from "@/domain/approvals";
import { listNextTurnItems, type NextTurnEntry } from "@/domain/next-turn";
import { log } from "@/lib/log";
import { buildNextTurnView, type NextTurnItem } from "@/ui/next-turn/build-next-turn-view";
import { NextTurn, nextTurnLabelId } from "@/ui/next-turn/NextTurn";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { toDecision, toSheet } from "@/app/(app)/approvals/sheet-material";
import { HomeApprovalRow, HomeApprovalsProvider, HomeNextTurnError } from "./home-approval-actions";

// D-28: 루트가 「내 차례」 홈이다. 미인증이면 로그인으로 보내는 분기는
// 02-04에서 그대로 유지한다(app/(app)/layout.tsx의 requireSession()이 이미
// (app) 그룹 전체를 게이트하지만, 이 화면 자체의 명시적 분기도 살려 둔다).
// 05-10: 항목은 공급 함수(domain/next-turn) 한 곳에서 온다. 문서 종류 등록은 부작용 import 한 줄이 보장한다 —
// 첫 화면 → domain/next-turn → listMyInbox 간접 경로는 document-kinds-import 가드가 보지 못한다(D14).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // 공급 함수가 실패하면 블록 자리에 오류 한 줄 — 첫 화면 전체가 오류 경계로 떨어지지 않는다(§7-7 ERROR).
  let entries: NextTurnEntry[] = [];
  let failed = false;
  try {
    entries = await listNextTurnItems(session.viewer, { withDetails: true });
  } catch (error) {
    failed = true;
    log.warn("next_turn.load_failed", { message: error instanceof Error ? error.message : String(error) });
  }
  const items: NextTurnItem[] = entries.map((entry) => ({
    key: entry.key,
    tag: entry.tag,
    label: entry.label,
    reason: entry.reason,
    amount: 0,
    measureText: entry.measureText,
    action: entry.action,
  }));
  const view = buildNextTurnView(items);

  // [결재] 행 행동 — 결재 시트 재료가 있는 행만 승인 · 반려 / 폰 시트 노드로 바꾸고, 없으면(결재 정보가 꺼진 계급) 기본 링크가 남는다.
  const rejectMessages = { empty: REJECT_REASON_EMPTY_MESSAGE, tooLong: REJECT_REASON_TOO_LONG_MESSAGE, max: REJECT_REASON_MAX };
  const actionSlots: Record<string, ReactNode> = {};
  if (view.visible) {
    for (const item of view.items) {
      const approval = entries.find((entry) => entry.key === item.key)?.approval;
      const sheet = approval ? toSheet(approval) : null;
      if (!approval || !sheet || !item.key) continue;
      actionSlots[item.key] = (
        <HomeApprovalRow
          labelId={nextTurnLabelId(item.key)}
          instanceId={sheet.instanceId}
          version={sheet.version}
          actions={sheet.actions}
          sheet={sheet}
          decision={toDecision(approval, approval.summary ?? {})}
          rejectMessages={rejectMessages}
        />
      );
    }
  }

  return (
    <ListScreen title="내 차례">
      <HomeApprovalsProvider>
        <NextTurn view={view} actionSlots={actionSlots} />
      </HomeApprovalsProvider>
      {failed ? <HomeNextTurnError /> : null}
      {!failed && !view.visible ? (
        <ListEmpty message="표시할 항목이 없습니다" action={{ label: "프로젝트 보기", href: "/projects" }} />
      ) : null}
    </ListScreen>
  );
}
