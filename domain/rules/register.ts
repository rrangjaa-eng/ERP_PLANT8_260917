import { registerGateRule } from "@/domain/rules/gate";
import { ALLOWED_TRANSITIONS } from "@/domain/projects/status-transitions";
import {
  lineCellEditability,
  linkedDocumentReason,
  quoteLockReason,
  structuralEditability,
  type QuoteLineField,
} from "@/domain/quotes/edit-scope";

// Phase 4의 프로젝트 게이트 규칙을 등록하는 한 곳 — 규칙마다 등록한 플랜을
// 주석 한 줄로 적는다(`project.line-edit` 04-06, 뒤 규칙은 04-20·04-22·
// 04-12·04-26·그룹 B).
//
// side-effect import 모듈 — `import "@/domain/rules/register"`로 불러
// 등록만 일으킨다(도메인 등록 사이드이펙트 모듈 규약).

// 04-06(D-47·D-75) — 완료 프로젝트의 견적 줄을 잠근다. 나머지 네 상태는
// 통과한다 — 미수주도 잠그지 않는다(D-45).
// 04-12(D-78 · 사용자 D10·D12 · D-66) — 셀 단위로 넓힌다. `update`는 바뀐 칸마다 DTO와 같은
// lineCellEditability를 보고, 잠김이면 quoteLockReason(표 위 한 줄과 한 문자열 — DR-2), 읽기 전용이면
// linkedDocumentReason. 구조 변경은 structuralEditability(사용자 D10)로 — 정산의 새 줄은 견적 칸 0일 때만(D12),
// 연결 문서가 있는 줄은 보관 대신 취소(D-66). 보관함 복원은 그 상태에서 줄을 더하는 것과 같다(정산은 견적가 0만).
export type ProjectLineEditCtx = {
  status: string;
  hasLinkedDocuments: boolean;
  linkedDocumentNumber?: string;
  change:
    | { kind: "update"; fields: QuoteLineField[] }
    | { kind: "insert"; quoteCellsZero: boolean }
    | { kind: "restore"; quoteAmountZero: boolean }
    | { kind: "archive" | "reorder" | "duplicate" };
};

const SETTLING_STRUCTURE_DENIED = "정산 · 줄 삭제·이동 없음";
const SETTLING_INSERT_DENIED = "정산 · 새 줄은 실행가만";
const LINKED_ARCHIVE_DENIED = "연결 문서 있음 · 삭제 대신 취소";

registerGateRule<unknown, ProjectLineEditCtx>({
  name: "project.line-edit",
  check: (_doc, ctx) => {
    const lockReason = quoteLockReason({ status: ctx.status });
    if (ctx.change.kind === "update") {
      const cells = lineCellEditability({
        status: ctx.status,
        canWrite: true,
        hasLinkedDocuments: ctx.hasLinkedDocuments,
        isNewLine: false,
      });
      for (const field of ctx.change.fields) {
        if (cells[field] === "readonly") return { allowed: false, reason: linkedDocumentReason(ctx.linkedDocumentNumber ?? "") };
        if (cells[field] === "locked" && lockReason) return { allowed: false, reason: lockReason };
      }
      return { allowed: true };
    }
    const kind = ctx.change.kind;
    if (!structuralEditability({ status: ctx.status, canWrite: true })[kind === "restore" ? "insert" : kind]) {
      return { allowed: false, reason: ctx.status === "settling" ? SETTLING_STRUCTURE_DENIED : (lockReason ?? SETTLING_STRUCTURE_DENIED) };
    }
    if (ctx.change.kind === "insert" && ctx.status === "settling" && !ctx.change.quoteCellsZero) {
      return { allowed: false, reason: SETTLING_INSERT_DENIED };
    }
    if (ctx.change.kind === "restore" && ctx.status === "settling" && !ctx.change.quoteAmountZero) {
      return { allowed: false, reason: SETTLING_INSERT_DENIED };
    }
    if (kind === "archive" && ctx.hasLinkedDocuments) return { allowed: false, reason: LINKED_ARCHIVE_DENIED };
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
