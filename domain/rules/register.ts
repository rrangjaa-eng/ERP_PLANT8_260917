import { registerGateRule } from "@/domain/rules/gate";
import { ALLOWED_TRANSITIONS, AUTO_TRANSITIONS } from "@/domain/projects/status-transitions";
import {
  lineCellEditability,
  linkedDocumentReason,
  quoteLockReason,
  structuralEditability,
  type QuoteLineField,
  type QuoteLineKind,
} from "@/domain/quotes/edit-scope";
import { firstExpenseSubmitBlock, type ExpenseSubmitContext } from "@/domain/expenses/gate";
import {
  approvalGateDecision,
  evidenceGateDecision,
  pairGateDecision,
  type ApprovalGateInput,
  type EvidenceGateInput,
  type PairGateInput,
} from "@/domain/payments/action-row";
import { cardExecutionCap, type CardCapSource } from "@/domain/corp-card-usages/amounts";
import type { Money, MoneyInput } from "@/domain/money";
import { formatKrw } from "@/lib/format-number";
import type { LineLinks } from "@/repositories/quote-line-links";

// Phase 4의 프로젝트 게이트 규칙을 등록하는 한 곳 — 규칙마다 등록한 플랜을
// 주석 한 줄로 적는다: `project.line-edit`(04-06 · 04-12 · 04-13 · 06-07 D-47 ③ 갈래), `quote.line-cap`(04-26),
// `project.transition`(04-20), `project.auto-settle`(04-53), `project.period-edit`(04-22), `project.pre-estimate-edit`(04-44),
// `project.start-date-required`(04-20), `quote.revision-create`·`quote.customer-approval`·`quote.approval-toggle`·`quote.vendor-required`(04-14),
// `card.dual-link-block`·`card.execution-cap`(06-07).
//
// side-effect import 모듈 — `import "@/domain/rules/register"`로 불러
// 등록만 일으킨다(도메인 등록 사이드이펙트 모듈 규약).

// 04-06(D-75) — 완료 프로젝트의 견적 줄을 잠근다. 나머지 네 상태는
// 통과한다 — 미수주도 잠그지 않는다(D-45).
// 04-12(D-78 · 사용자 D10·D12 · D-66) — 셀 단위로 넓힌다. `update`는 바뀐 칸마다 DTO와 같은
// lineCellEditability를 보고, 잠김이면 quoteLockReason(표 위 한 줄과 한 문자열 — DR-2), 읽기 전용이면
// linkedDocumentReason. 구조 변경은 structuralEditability(사용자 D10)로 — 정산의 새 줄은 견적 칸 0일 때만(D12),
// 연결 문서가 있는 줄은 보관 대신 취소(D-66). 보관함 복원은 그 상태에서 줄을 더하는 것과 같다(정산은 견적가 0만).
// 04-13(D-83 · D-48) — 줄 종류와 권한 축. 조정 줄은 상태를 보지 않고 `projects.adjustment` 쓰기로만 판정하고,
// 견적 줄·견적 외 비용은 `projects` 쓰기가 있어야 한다 —
// 입구가 두 권한 중 하나로 열리므로 줄마다 여기서 막는다. 권한 사실은 호출자가 트랜잭션 전에 읽어 넘긴다.
export type ProjectLineEditCtx = {
  status: string;
  lineKind: QuoteLineKind;
  actorCanWrite: boolean;
  actorCanAdjust: boolean;
  hasLinkedDocuments: boolean;
  linkedDocumentNumber?: string;
  /** 04-40(사용자 D7 · OV-1) — 현재 차수가 고객 승인됐으면 그 순번. 견적 줄의 합계를 바꾸는 조작을 막는다. */
  approvedSeq?: number | null;
  /** 04 D-47 ③ — 완료 뒤 견적 외 비용 줄 추가 예외, 호출자가 트랜잭션 전에 권한 사실을 읽어 넘긴다. */
  completedOutOfQuote?: boolean;
  /** 06-07 N-3 — 줄 사슬에 보관 안 된 카드 사용 · `신청됨` 구매 요청이 있음. 보관만 막고 금액 셀은 정하지 않는다. */
  hasCardSideLinks?: boolean;
  change:
    // 04-40(GAP 1) — quoteAmountUnchanged: 서버가 다시 계산한 견적가 = 저장된 견적가. 승인 차수에서는 참이어야 통과한다.
    | { kind: "update"; fields: QuoteLineField[]; quoteAmountUnchanged?: boolean }
    | { kind: "insert"; quoteCellsZero: boolean }
    | { kind: "restore"; quoteAmountZero: boolean }
    | { kind: "archive"; quoteAmountZero?: boolean }
    | { kind: "reorder" | "duplicate" };
};

const SETTLING_STRUCTURE_DENIED = "정산 · 줄 삭제·이동 없음";
const SETTLING_INSERT_DENIED = "정산 · 새 줄은 실행가만";
const LINKED_ARCHIVE_DENIED = "연결 문서 있음 · 삭제 대신 취소";
// 방어 문구(화면은 이 요청을 만들지 않는다 — 위조·오래된 페이로드로만 닿는다, DR-22 · DR-35).
const ADJUSTMENT_DENIED = "조정 줄 · 경영관리만";
const WRITE_DENIED = "견적 줄 · 쓰기 권한 없음";

function adjustmentAllowed(ctx: ProjectLineEditCtx): boolean {
  const scope = { status: ctx.status, canWrite: ctx.actorCanWrite, lineKind: "adjustment" as const, canAdjust: ctx.actorCanAdjust };
  if (ctx.change.kind === "update") {
    const cells = lineCellEditability({ ...scope, hasLinkedDocuments: ctx.hasLinkedDocuments, isNewLine: false });
    return ctx.change.fields.every((field) => cells[field] === "edit");
  }
  return structuralEditability(scope)[ctx.change.kind === "restore" ? "insert" : ctx.change.kind];
}

registerGateRule<unknown, ProjectLineEditCtx>({
  name: "project.line-edit",
  check: (_doc, ctx) => {
    if (ctx.lineKind === "adjustment") return adjustmentAllowed(ctx) ? { allowed: true } : { allowed: false, reason: ADJUSTMENT_DENIED };
    if (!ctx.actorCanWrite) return { allowed: false, reason: WRITE_DENIED };
    const approvedSeq = ctx.approvedSeq ?? null;
    const lockReason = quoteLockReason({ status: ctx.status, approvedSeq });
    // 04-40 — 승인 차수의 견적 줄은 합계를 바꾸는 조작을 막는다(이유는 quoteLockReason — 리터럴 없음, W5).
    const approvalLocks = approvedSeq !== null && ctx.lineKind === "quote" && lockReason !== null;
    if (ctx.change.kind === "update") {
      const cells = lineCellEditability({
        status: ctx.status,
        canWrite: true,
        hasLinkedDocuments: ctx.hasLinkedDocuments,
        isNewLine: false,
        lineKind: ctx.lineKind,
        approvedSeq,
      });
      for (const field of ctx.change.fields) {
        if (cells[field] === "readonly") return { allowed: false, reason: linkedDocumentReason(ctx.linkedDocumentNumber ?? "") };
        if (cells[field] === "locked" && lockReason) return { allowed: false, reason: lockReason };
      }
      if (approvalLocks && ctx.change.quoteAmountUnchanged !== true) return { allowed: false, reason: lockReason };
      return { allowed: true };
    }
    const kind = ctx.change.kind;
    if (ctx.status === "completed" && ctx.lineKind === "out_of_quote" && kind === "insert" && ctx.completedOutOfQuote === true) return { allowed: true };
    if (!structuralEditability({ status: ctx.status, canWrite: true })[kind === "restore" ? "insert" : kind]) {
      return { allowed: false, reason: ctx.status === "settling" ? SETTLING_STRUCTURE_DENIED : (lockReason ?? SETTLING_STRUCTURE_DENIED) };
    }
    if (ctx.change.kind === "insert" && ctx.status === "settling" && !ctx.change.quoteCellsZero) {
      return { allowed: false, reason: SETTLING_INSERT_DENIED };
    }
    if (ctx.change.kind === "restore" && ctx.status === "settling" && !ctx.change.quoteAmountZero) {
      return { allowed: false, reason: SETTLING_INSERT_DENIED };
    }
    if (kind === "archive" && (ctx.hasLinkedDocuments || ctx.hasCardSideLinks === true)) return { allowed: false, reason: LINKED_ARCHIVE_DENIED };
    if (approvalLocks) {
      if (ctx.change.kind === "insert" && !ctx.change.quoteCellsZero) return { allowed: false, reason: lockReason };
      if ((ctx.change.kind === "archive" || ctx.change.kind === "restore") && ctx.change.quoteAmountZero !== true) {
        return { allowed: false, reason: lockReason };
      }
    }
    return { allowed: true };
  },
});

// 04-26(D-86 · CEO A-19·A-20) — 차수당 견적 줄 상한. 줄을 더하는 저장·복원만 판정한다(newLines > 0) — 상한을
// 지금 줄 수보다 낮춰도 기존 줄 고치기·보관은 통과한다. countAfter는 호출자가 잠근 트랜잭션 안에서 센 값이다.
export type QuoteLineCapCtx = { newLines: number; countAfter: number; cap: number };

registerGateRule<unknown, QuoteLineCapCtx>({
  name: "quote.line-cap",
  check: (_doc, ctx) => {
    if (ctx.newLines > 0 && ctx.countAfter > ctx.cap) return { allowed: false, reason: `${ctx.cap}줄 상한을 넘음 · 전부 거부` };
    return { allowed: true };
  },
});

// 04-20(D-46·D-75·D-79 · 사용자 D11·D13·D20) — 사람의 전환. 전이표(04-06)에 없는
// 쌍은 갈 수 없고, 쌍마다 정해진 메뉴 권한이 있어야 하며, 업무 범위가 그 프로젝트
// 팀을 덮어야 한다. 권한 사실(메뉴·팀 범위)은 호출자가 읽어 넘긴다 — 규칙은 판정만.
export type ProjectTransitionCtx = {
  from: string;
  to: string;
  actorMenus: { status: boolean; complete: boolean };
  actorCoversTeam: boolean;
};

registerGateRule<unknown, ProjectTransitionCtx>({
  name: "project.transition",
  check: (_doc, ctx) => {
    const transition = ALLOWED_TRANSITIONS.find((entry) => entry.from === ctx.from && entry.to === ctx.to);
    if (!transition) return { allowed: false, reason: "갈 수 없는 상태 · 새로 고침" };
    const hasMenu = transition.menu === "projects.complete" ? ctx.actorMenus.complete : ctx.actorMenus.status;
    if (!hasMenu) return { allowed: false, reason: "상태 바꾸기 권한 없음" };
    if (!ctx.actorCoversTeam) return { allowed: false, reason: "다른 팀 프로젝트 · 상태 바꾸기 권한 없음" };
    return { allowed: true };
  },
});

// 04-11(D-76) · 04-53(V-04-auto-settle-gate) — 날짜로 일어나는 자동 전환(진행 → 정산)의 판정 한 곳.
// 전이표(AUTO_TRANSITIONS)에 있는 쌍 · 종료일이 오늘(KST)보다 앞 · 보관 아님. 시스템 행위자 — 권한 사실 없음.
// 잠근 tx 안에서 불리므로 순수하다 — 오늘은 ctx로만 받는다(ARCHITECTURE §4-8 (3)).
export type ProjectAutoSettleCtx = {
  from: string;
  to: string;
  endDate: string | null;
  archived: boolean;
  todayKst: string;
};

const NOT_AUTO_SETTLE_TARGET = "자동 정산 대상 아님";

registerGateRule<unknown, ProjectAutoSettleCtx>({
  name: "project.auto-settle",
  check: (_doc, ctx) => {
    const transition = AUTO_TRANSITIONS.find((entry) => entry.from === ctx.from && entry.to === ctx.to);
    if (!transition) return { allowed: false, reason: NOT_AUTO_SETTLE_TARGET };
    if (ctx.endDate === null || ctx.endDate >= ctx.todayKst) return { allowed: false, reason: NOT_AUTO_SETTLE_TARGET };
    if (ctx.archived) return { allowed: false, reason: NOT_AUTO_SETTLE_TARGET };
    return { allowed: true };
  },
});

// 04-22(D-80 · D-82 · S13) — 기간 칸 저장. 권리(domain/projects/period periodEditRights)와 칸 오류는
// 호출자가 계산해 넘긴다. 권리가 없으면 방어 문구(화면은 권리 없는 사람에게 「기간 바꾸기」를 그리지
// 않는다 — 위조 요청으로만 닿는다), 칸 오류가 있으면 첫 오류 이유.
export type ProjectPeriodEditCtx = { rights: "lead" | "pm" | "none"; errors: { reason: string }[] };

registerGateRule<unknown, ProjectPeriodEditCtx>({
  name: "project.period-edit",
  check: (_doc, ctx) => {
    if (ctx.rights === "none") return { allowed: false, reason: "기간 바꾸기 권한 없음" };
    const [first] = ctx.errors;
    if (first) return { allowed: false, reason: first.reason };
    return { allowed: true };
  },
});

// 04-44(DR-28 · DR-37 · 계약 8 · S17) — 총 매출 예상가 칸 저장. 권리는 기간과 같은 periodEditRights이고 금액을
// 볼 수 없으면 고칠 수 없다(quote.amount). 권리 없음은 방어 문구(화면은 3차를 그리지 않는다 — 위조 요청으로만
// 닿는다), 칸 오류가 있으면 첫 오류 이유.
export type ProjectPreEstimateEditCtx = {
  rights: "lead" | "pm" | "none";
  canSeeAmount: boolean;
  errors: { reason: string }[];
};

registerGateRule<unknown, ProjectPreEstimateEditCtx>({
  name: "project.pre-estimate-edit",
  check: (_doc, ctx) => {
    if (ctx.rights === "none" || !ctx.canSeeAmount) return { allowed: false, reason: "총 매출 예상가 바꾸기 권한 없음" };
    const [first] = ctx.errors;
    if (first) return { allowed: false, reason: first.reason };
    return { allowed: true };
  },
});

// 04-20(D-82) — 진행으로 가는 전환은 시작일이 있어야 한다. 이 문자열은
// statusDestinations의 blockedReason으로 화면에 그대로 간다(UI-SPEC rev 5 원문).
export type ProjectStartDateRequiredCtx = { to: string; startDate: string | null };

registerGateRule<unknown, ProjectStartDateRequiredCtx>({
  name: "project.start-date-required",
  check: (_doc, ctx) => {
    if (ctx.to !== "in_progress" || ctx.startDate) return { allowed: true };
    return { allowed: false, reason: "시작일 없음 · 기간 적기" };
  },
});

// 04-14(D-53 · 사용자 D10 · UI-SPEC rev 5 `막힘 — 새 차수(빈 차수)`) — 새 차수. `canCreateRevision`은
// structuralEditability(…).newRevision(수주중·진행·미수주 + `projects` 쓰기)이고, 복사할 견적 줄 수는 호출자가 잠근
// 트랜잭션 안에서 센 값이다. 정산은 새 줄이 열렸어도 새 차수는 닫힌다(방어 문구 — 화면은 버튼을 그리지 않는다).
export type QuoteRevisionCreateCtx = { canCreateRevision: boolean; copyableLineCount: number; status: string };

registerGateRule<unknown, QuoteRevisionCreateCtx>({
  name: "quote.revision-create",
  check: (_doc, ctx) => {
    if (!ctx.canCreateRevision) {
      if (ctx.status === "settling") return { allowed: false, reason: "정산 · 새 차수 없음" };
      return { allowed: false, reason: quoteLockReason({ status: ctx.status }) ?? WRITE_DENIED };
    }
    if (ctx.copyableLineCount === 0) return { allowed: false, reason: "복사할 견적 줄 없음 · 첫 줄 만들기" };
    return { allowed: true };
  },
});

// 04-14(D-43 · D-54 · ROADMAP 기준 3 · PROJ-07) — 고객 승인 게이트. 현재 차수(최신 순번 하나)가 미승인이면 지출 동작을
// 막는다 — 이전 승인 차수를 대신 보지 않는다. 설정 `project.customer_approval_gate`를 끄면 통과한다. 이 페이즈에는
// 호출자가 없다 — Phase 5 지출결의가 부른다.
// 사용자 D8(CEO 리뷰 B-08): D-43 원문은 수주중만 면제였지만 미수주도 면제한다(뒤늦은 PT 청구서 · 승인 차수가 거의 없음).
export type QuoteCustomerApprovalCtx = {
  status: string;
  revisionSeq: number;
  revisionApproved: boolean;
  gateEnabled: boolean;
  actorIsAssignedPm: boolean;
  pmName: string;
};

const CUSTOMER_APPROVAL_EXEMPT_STATUSES = ["bidding", "lost"];

registerGateRule<unknown, QuoteCustomerApprovalCtx>({
  name: "quote.customer-approval",
  check: (_doc, ctx) => {
    if (!ctx.gateEnabled || ctx.revisionApproved || CUSTOMER_APPROVAL_EXEMPT_STATUSES.includes(ctx.status)) return { allowed: true };
    const next = ctx.actorIsAssignedPm ? "고객 승인 표시" : `담당 PM ${ctx.pmName}`;
    return { allowed: false, reason: `${ctx.revisionSeq}차 고객 승인 전 · ${next}` };
  },
});

// 04-14(D-56 · CEO 리뷰 B-30 · ENG-D4 · ENG-D9 · 사용자 D19-9) — 차수의 고객 승인 표시 켜기·끄기. 담당 PM이면서
// `projects` 쓰기가 있어야 하고, 완료에서는 바뀌지 않는다(정산은 된다). 켜기만 견적 줄 수(빈 차수)·기준값(PM이 본
// 합계·내용 토큰)을 보고, 끄기만 연결 문서를 본다. 우선순위: 담당·권한 → 완료 → 현재 차수 → 빈 차수 → 기준값 → 연결 문서.
export type QuoteApprovalToggleCtx = {
  turningOn: boolean;
  status: string;
  actorIsAssignedPm: boolean;
  actorCanWrite: boolean;
  isCurrentRevision: boolean;
  approvableLineCount: number;
  basisMatches: boolean;
  hasLinkedDocuments: boolean;
};

registerGateRule<unknown, QuoteApprovalToggleCtx>({
  name: "quote.approval-toggle",
  check: (_doc, ctx) => {
    // 방어 문구(rev 5 밖 — 화면은 담당 PM에게만 버튼을 그린다).
    if (!ctx.actorIsAssignedPm || !ctx.actorCanWrite) return { allowed: false, reason: "고객 승인 표시는 담당 PM만" };
    if (ctx.status === "completed") return { allowed: false, reason: "완료 · 견적 줄 잠김" };
    if (!ctx.isCurrentRevision) return { allowed: false, reason: "다른 사람이 새 차수를 만듦 · 새로 고침" };
    if (ctx.turningOn) {
      if (ctx.approvableLineCount === 0) return { allowed: false, reason: "승인할 견적 줄이 없음 · 첫 줄 만들기" };
      if (!ctx.basisMatches) return { allowed: false, reason: "견적이 바뀜 · 새로 고침" };
      return { allowed: true };
    }
    if (ctx.hasLinkedDocuments) return { allowed: false, reason: "연결 문서 있음 · 고치려면 새 차수" };
    return { allowed: true };
  },
});

// 04-14(D-64) — 거래처 필수. Phase 5 지출결의·구매 요청이 부른다(이 페이즈 호출자 없음).
export type QuoteVendorRequiredCtx = { vendorId: string | null };

registerGateRule<unknown, QuoteVendorRequiredCtx>({
  name: "quote.vendor-required",
  check: (_doc, ctx) => (ctx.vendorId ? { allowed: true } : { allowed: false, reason: "거래처 없음 · 거래처 고르기" }),
});

// 05-06(UI-SPEC S6 · EXP-14 · UX-06) — 지출결의 제출. ①~⑨를 문맥의 순서 표(domain/expenses/gate.ts `buildExpenseSubmitContext`)대로
// 보고 첫 막힘의 글자 하나만 돌려준다. ① · ⑤는 위 `quote.customer-approval` · `quote.vendor-required` 규칙을 그대로 부른 결과다.
// 미리보기와 제출 트랜잭션 안 재판정이 같은 규칙을 부른다(T-05-601).
registerGateRule<unknown, ExpenseSubmitContext>({
  name: "expense.submit",
  check: async (doc, ctx) => {
    const first = await firstExpenseSubmitBlock(doc, ctx);
    return first ? { allowed: false, reason: first.reason } : { allowed: true };
  },
});

// 06-03(EXP-06 · 기준 1 · UI-SPEC 「지출결의 상태 → 1차」) — 지급 완료는 결재 통과(approved · 자기 승인 포함, UA-607) 문서만. 몸통은 화면 1차와
// 같은 순수 함수(domain/payments/action-row.ts)를 부르기만 한다. 06-04가 그 뒤에 증빙 · 짝 규칙을 더한다.
registerGateRule<unknown, ApprovalGateInput>({
  name: "payment.approval-required",
  check: (_doc, ctx) => approvalGateDecision(ctx),
});

// 06-04(EVID-02 · D-603) — 증빙 필수 on · 증빙 0(hasEvidence) · 선결제 아님 · 면제 아님이면 지급 완료를 막는다. 화면 P3와 같은 순수 함수.
registerGateRule<unknown, EvidenceGateInput>({
  name: "payment.evidence-required",
  check: (_doc, ctx) => evidenceGateDecision(ctx),
});

// 06-04(Q4 · K-6) — 지급 방식 ↔ 증빙 종류 짝. 몸통 pairGateDecision이 06-02 isMethodEvidencePairAllowed를 부른다(06-15 일괄 · 06-17 선택 칸도 이 규칙).
registerGateRule<unknown, PairGateInput>({
  name: "payment.method-evidence-mismatch",
  check: (_doc, ctx) => pairGateDecision(ctx),
});

// 06-07(D-609) — 견적 줄 하나는 지출결의 쪽 또는 카드 쪽(카드 사용 · 구매 요청) 한 쪽에만 잇는다. 같은 쪽 여러 건은 통과.
// `links`는 잠근 뒤 같은 tx로 읽은 줄 사슬 전체의 연결(`findLineLinks` — X-1). 카드 쪽 판정은 구매 요청 칸을 읽지 않는다.
export type CardDualLinkCtx = { side: "card" | "expense"; links: Pick<LineLinks, "expenses" | "cardUsages"> };

export function cardDualLinkDecision(ctx: CardDualLinkCtx): { allowed: true } | { allowed: false; reason: string } {
  if (ctx.side === "card") {
    const expense = ctx.links.expenses[0];
    return expense ? { allowed: false, reason: `지출결의 ${expense.number} 연결됨 · 다른 줄 고르기` } : { allowed: true };
  }
  const count = ctx.links.cardUsages.length;
  return count > 0 ? { allowed: false, reason: `카드 사용 ${count}건 연결됨 · 지출결의는 다른 줄` } : { allowed: true };
}

registerGateRule<unknown, CardDualLinkCtx>({
  name: "card.dual-link-block",
  check: (_doc, ctx) => cardDualLinkDecision(ctx),
});

// 06-07(Q3 · U-8 · Q-E) — 카드 쪽 실행가 상한. 남은 실행가는 06-05 `cardExecutionCap` 한 곳이 셈한다. 사람이 적은 금액(entry)의 초과만 막고,
// 연결을 고를 수 있으면(pickable) `다른 줄 고르기`, 연결이 고정이면(fixed — 06-12 구매 완료) 담당 PM을 가리킨다.
export type CardExecutionCapCtx = {
  execution: Money;
  otherSupplies: readonly Money[];
  supply: MoneyInput;
  source: CardCapSource;
  link: "pickable" | "fixed";
  pmName?: string;
};

registerGateRule<unknown, CardExecutionCapCtx>({
  name: "card.execution-cap",
  check: (_doc, ctx) => {
    const cap = cardExecutionCap({ execution: ctx.execution, otherSupplies: ctx.otherSupplies, supply: ctx.supply, source: ctx.source });
    if (!cap.blocked) return { allowed: true };
    const next = ctx.link === "pickable" ? "다른 줄 고르기" : `견적 줄은 담당 PM ${ctx.pmName ?? ""}`;
    return { allowed: false, reason: `실행가 초과 · 남은 실행가 ${formatKrw(cap.remaining.amountKrw)} · ${next}` };
  },
});
