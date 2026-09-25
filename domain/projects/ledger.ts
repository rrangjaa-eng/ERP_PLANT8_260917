import type { Viewer } from "@/domain/viewer";
import { withTransaction, withTimeoutConversion } from "@/lib/db-transaction";
import { saveQuoteLines, type QuoteLineWriteRow, type SaveQuoteLinesResult } from "@/domain/quotes/lines";
import { saveRevenue, listRevenue, type SaveRevenueInput, type RevenueDto } from "@/domain/revenue";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { findQuoteRevisionById } from "@/repositories/quote-revisions";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { scopeFor } from "@/domain/permissions/scope-for";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { denyWrite } from "@/domain/rules/deny-write";
import { loadProjectForGate } from "@/domain/projects/auto-transition";
import { coversProjectTeam, loadActorTeamScope, StatusChangedError, statusChangedMessage } from "@/domain/projects/status";
import {
  periodEditRights,
  resolvePeriodSave,
  validatePeriodChange,
  type PeriodFieldError,
} from "@/domain/projects/period";
import { validatePreEstimateChange, type PreEstimateFieldError } from "@/domain/projects/pre-estimate";
import { moneyFromRow, moneyToColumns, type Currency, type Money } from "@/domain/money";
import { projectResponsibles } from "@/domain/projects/responsibles";
import { rememberFxRate as defaultRememberFxRate } from "@/domain/money/currency";
import { log } from "@/lib/log";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { kstToday } from "@/lib/kst-date";
import {
  findProjectById,
  updateProjectPeriod,
  updateProjectPreEstimate,
  updateProjectStatusIfCurrent,
} from "@/repositories/projects";

// 04-02 Task 2 ⑥ — 상세 화면의 1차 「일괄 저장」 하나가 견적 줄 + 매출
// 섹션(계약 금액·발행 줄·입금 줄)의 dirty 전부를 **같은 트랜잭션**으로
// 저장한다(§7-3 "전부 저장 또는 전부 거부", §7-15 "화면의 1차에 합류").
// 두 domain 함수(saveQuoteLines·saveRevenue)는 각자 독립 실행도 가능하도록
// 남겨 두고, 여기서는 tx를 넘겨 하나로 묶기만 한다 — 계산·권한 판정 로직은
// 중복하지 않는다.
//
// 04-22(D-80 · D-82 · ENG-D6 · ENG-D3 ① · CEO A-01·A-13·A-14·A-16) — 기간 칸이 같은 저장에
// 합류한다. 트랜잭션 안의 순서는 고정이다: ① 잠금 읽기·자동 전환 선판정(loadProjectForGate)
// ② 기간 판정·쓰기(정산→진행 되돌리기 포함) ③ 재판정 ④ 견적 줄 ⑤ 매출 — ④·⑤는 ③의 새 행으로
// 판정된다. 기간 권리의 사실은 트랜잭션을 열기 전에 읽는다(잠근 트랜잭션 안 풀 호출 금지).
export type PeriodInput = {
  startDate: string | null;
  endDate: string | null;
  // 화면이 서버 렌더(또는 직전 저장 결과)에서 받은 기간 — 동시 수정 판정의 기준값.
  baseline: { startDate: string | null; endDate: string | null };
};

// 04-44(DR-28 · DR-37 · 계약 8) — 총 매출 예상가 칸. 동시 수정 기준값은 없다(나중 저장이 이긴다 — 사용자 2026-09-23).
export type PreEstimateInput = {
  currency: Currency;
  amount: number;
  fxRate: number | null;
  // 환율 칸을 이번 저장에서 실제로 고쳤을 때만 true.
  fxRateTouched: boolean;
};

export type SaveProjectLedgerInput = {
  // DR-6 · 계약 4 — 화면이 본 상태. 잠금 직후 첫 판정 행과 다르면 저장 전체를 거부한다.
  seenStatus: ProjectStatus;
  quoteLines?: { revisionId: string; rows: QuoteLineWriteRow[] };
  revenue?: SaveRevenueInput;
  period?: PeriodInput;
  preEstimate?: PreEstimateInput;
};

export type SaveProjectLedgerResult = {
  quoteLines: SaveQuoteLinesResult | null;
  revenue: RevenueDto | null;
  // preEstimate는 이번 저장에 실어 보낸(권리·노출을 통과한) 경우에만 싣는다.
  project: { status: string; startDate: string | null; endDate: string | null; preEstimate?: Money };
};

export type { PeriodFieldError };

// 기간 칸 거부 — 칸 오류를 싣고 저장 전체를 되돌린다(표 쪽은 저장하지 않는다). 같은 저장의 총 매출 예상가 칸
// 오류도 함께 싣는다(04-44 · U-6 — 표 밖 칸 오류를 모아 한 번에 거부).
export class PeriodRejectedError extends UserFacingError {
  constructor(
    readonly errors: PeriodFieldError[],
    readonly preEstimateErrors: PreEstimateFieldError[] = [],
  ) {
    super(errors[0]?.reason ?? "기간 바꾸기 권한 없음");
  }
}

// 04-44 — 총 매출 예상가 칸 거부.
export class PreEstimateRejectedError extends UserFacingError {
  constructor(readonly errors: PreEstimateFieldError[]) {
    super(errors[0]?.reason ?? "총 매출 예상가 바꾸기 권한 없음");
  }
}

export type SaveProjectLedgerDeps = {
  now: () => Date;
  // 트랜잭션 안의 행동 로그(기간 변경·되돌리기·같은 커밋의 자동 정산) — 테스트가 실패를 주입한다.
  recordAction: typeof defaultRecordAction;
  // 테스트 전용 — 잠금 획득 직후 호출(경합 재현, sleep 없이).
  afterLock: () => Promise<void>;
  // 04-44 — 커밋 뒤 최근 환율 기억. 테스트가 실패를 주입한다.
  rememberFxRate: typeof defaultRememberFxRate;
};

const PROJECT_ENTITY = "project";
const PERIOD_RULE = "project.period-edit";
const PRE_ESTIMATE_RULE = "project.pre-estimate-edit";
const PERIOD_CONFLICT = "다른 사람이 먼저 기간을 바꿈 · 새로 고침";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveProjectLedger(
  viewer: Viewer,
  projectId: string,
  input: SaveProjectLedgerInput,
  deps?: Partial<SaveProjectLedgerDeps>,
): Promise<SaveProjectLedgerResult> {
  const now = deps?.now ?? (() => new Date());
  const recordAction = deps?.recordAction ?? defaultRecordAction;

  // ENG-D11(04-32 실측): 트랜잭션을 열기 전의 읽기도 풀 db로 돈다 — withTransaction과 같은 시간
  // 초과 판정·UserFacing 변환을 커밋까지 씌워, 경합 중 저장 전에 실패하면 원시 pg-pool 오류가
  // 아니라 같은 문구로 끝나게 한다(tx-safety.test.ts (c)). 커밋 뒤 단계(감사 기록·스냅샷)는
  // 씌우지 않는다 — 이미 저장됐는데 「다시 저장」을 시키면 새 줄이 두 번 들어간다
  // (tx-safety.test.ts (d)).
  const { quoteLinesResult, pendingActions, project } = await withTimeoutConversion(async () => {
    // 볼 수 없는 프로젝트(보기 권한·범위 밖, 권한 없는 보관 프로젝트)에는 쓰지 않는다 — 조회
    // 화면(findProject)과 같은 조건이다(/cso 14b1ae15). 04-22(A-13): findProject는 풀에서 자동
    // 정산을 따로 커밋하므로 부르지 않는다 — 판정은 트랜잭션 안 잠금 읽기가 한다.
    const scope = await scopeFor(viewer, PROJECT_ENTITY);
    if (scope.rows === "none" || !UUID_SHAPE.test(projectId)) {
      throw new UserFacingError("존재하지 않는 프로젝트입니다.");
    }

    // A-14: 견적 줄의 차수가 이 프로젝트의 것인지 먼저 확인한다 — 아니면 매출·감사 기록은 이
    // 프로젝트로, 견적 줄은 다른 프로젝트로 섞여 저장된다. 차수의 소속은 바뀌지 않는 사실이라
    // 트랜잭션 밖에서 읽는다.
    if (input.quoteLines) {
      const revision = await findQuoteRevisionById(viewer, input.quoteLines.revisionId);
      if (!revision || revision.projectId !== projectId) {
        denyWrite(
          viewer,
          "quote.revision-project",
          { projectId, revisionId: input.quoteLines.revisionId },
          new UserFacingError("차수와 프로젝트가 맞지 않음 · 새로 고침"),
        );
      }
    }

    // ENG-D3 ①: 기간 권리의 사실은 트랜잭션 전에 읽는다. 총 매출 예상가도 같은 권리(periodEditRights —
    // DR-37)라 기간 없이 총 매출 예상가만 실린 저장도 같은 사실과 quote.amount 노출을 여기서 읽는다(04-44).
    const todayKst = kstToday(now());
    const periodFacts =
      input.period || input.preEstimate
        ? await (async () => {
            const [canWrite, canEditPeriod, teamScope, canSeeAmount] = await Promise.all([
              can(viewer, "projects", "write"),
              can(viewer, "projects.period", "write"),
              loadActorTeamScope(viewer, { todayKst }),
              input.preEstimate ? visible(viewer, "quote.amount") : Promise.resolve(false),
            ]);
            // 거부 문구의 팀장 이름은 기간 저장에서 권리가 pm이 될 수 있는 사람(담당 PM)일 때만 읽는다.
            const known = input.period && canWrite ? await findProjectById(viewer, projectId) : null;
            const teamLeadName =
              known && known.pmUserId === viewer.id ? (await projectResponsibles(viewer, known, { now }, { leadMenu: "projects.period" })).teamLeadName : null;
            return { canWrite, canEditPeriod, teamScope, teamLeadName, canSeeAmount };
          })()
        : null;

    // 감사 기록은 트랜잭션 밖 커넥션으로 쓰인다 — 안에서 바로 남기면 뒤쪽
    // 저장이 거부돼 롤백돼도 기록만 남는다. 모았다가 커밋 뒤에 남긴다.
    const pendingActions: Parameters<typeof defaultRecordAction>[1][] = [];
    const deferRecord = {
      recordAction: (_viewer: Viewer, entry: Parameters<typeof defaultRecordAction>[1]): Promise<void> => {
        pendingActions.push(entry);
        return Promise.resolve();
      },
    };

    const inTx = await withTransaction(async (tx) => {
      // ① 잠금 읽기 + 자동 전환 선판정 — 같은 tx(A-13).
      const locked = await loadProjectForGate(viewer, projectId, { now, tx, afterLock: deps?.afterLock }, { recordAction });
      if (!locked || (locked.archivedAt !== null && !scope.includeArchived)) {
        throw new UserFacingError("존재하지 않는 프로젝트입니다.");
      }
      // DR-6: 비교는 첫 판정 행(자정 자동 정산 반영)과 기간 쓰기 전에 한다 — 사람 자신의 기간 변경은
      // 거부 사유가 아니다. 던지면 같은 tx의 자동 정산까지 전부 되돌아가고, 읽기 경로가 다음 렌더에
      // 같은 판정을 다시 한다. 권한 위반이 아니라 write.denied를 남기지 않는다. 문구의 라벨은
      // 롤백 뒤 액션이 코드표에서 찾는다.
      if (locked.status !== input.seenStatus) {
        throw new StatusChangedError(statusChangedMessage(locked.status, "전부 거부"), locked.status);
      }
      let current = locked;
      let savedPreEstimate: Money | undefined;
      const status = locked.status;
      const rights = periodFacts
        ? periodEditRights({
            status,
            isAssignedPm: locked.pmUserId === viewer.id,
            canWrite: periodFacts.canWrite,
            canEditPeriod: periodFacts.canEditPeriod,
            actorCoversTeam: coversProjectTeam(periodFacts.teamScope, locked.teamId),
          })
        : "none";

      // ② 기간 판정·쓰기.
      let periodRejection: PeriodFieldError[] | null = null;
      if (input.period && periodFacts) {
        const period = input.period;
        const conflict = locked.startDate !== period.baseline.startDate || locked.endDate !== period.baseline.endDate;
        const errors: PeriodFieldError[] = conflict
          ? [{ field: "end", reason: PERIOD_CONFLICT }]
          : validatePeriodChange({
              status,
              rights,
              start: period.startDate,
              end: period.endDate,
              todayKst,
              teamLeadName: periodFacts.teamLeadName,
            });
        const decision = await gate(locked, PERIOD_RULE, { rights, errors });
        if (!decision.allowed) periodRejection = rights === "none" ? [{ field: "end", reason: decision.reason }] : errors;
      }

      // ②' 총 매출 예상가 판정 — 기간 판정 바로 뒤, 같은 잠근 행·같은 권리(DR-37)와 트랜잭션 전 노출 사실로.
      const preEstimate = input.preEstimate;
      let preEstimateRejection: PreEstimateFieldError[] | null = null;
      if (preEstimate) {
        const canSeeAmount = periodFacts?.canSeeAmount ?? false;
        const errors: PreEstimateFieldError[] = validatePreEstimateChange(preEstimate);
        const decision = await gate(locked, PRE_ESTIMATE_RULE, { rights, canSeeAmount, errors });
        if (!decision.allowed) {
          preEstimateRejection = rights === "none" || !canSeeAmount ? [{ field: "amount", reason: decision.reason }] : errors;
        }
      }

      // U-6 — 표 밖 칸(기간 · 총 매출 예상가) 오류는 모아 한 번에 거부한다. write.denied는 한 번.
      if (periodRejection) {
        denyWrite(viewer, PERIOD_RULE, { projectId }, new PeriodRejectedError(periodRejection, preEstimateRejection ?? []));
      }
      if (preEstimateRejection) {
        denyWrite(viewer, PRE_ESTIMATE_RULE, { projectId }, new PreEstimateRejectedError(preEstimateRejection));
      }

      // A-16: 누가 무엇을 바꿨는지 — 바뀐 칸만 싣는다(총 매출 예상가는 금액 없이 표시만). 같은 tx, 한 줄.
      const changed: Record<string, unknown> = {};

      const resolved = input.period
        ? resolvePeriodSave({ status, newStart: input.period.startDate, newEnd: input.period.endDate, todayKst })
        : null;
      if (input.period && resolved) {
        const period = input.period;
        const written = await updateProjectPeriod(
          viewer,
          projectId,
          { startDate: resolved.startDate, endDate: resolved.endDate, expected: period.baseline },
          tx,
        );
        // 잠근 행이라 0행은 기준값이 어긋난 경우뿐이다(위에서 판정) — 이중 안전장치.
        if (!written) throw new PeriodRejectedError([{ field: "end", reason: PERIOD_CONFLICT }]);
        current = written;

        if (locked.startDate !== written.startDate) changed.startDate = { from: locked.startDate, to: written.startDate };
        if (locked.endDate !== written.endDate) changed.endDate = { from: locked.endDate, to: written.endDate };
      }

      // ③' 총 매출 예상가 쓰기 — 기간 쓰기 뒤. moneyToColumns를 지나 저장 규칙(04-40 normalizeMoneyInput)을 따른다.
      if (preEstimate) {
        const columns = moneyToColumns({
          currency: preEstimate.currency,
          amount: preEstimate.amount,
          fxRate: preEstimate.currency === "KRW" ? 1 : (preEstimate.fxRate ?? 1),
        });
        const written = await updateProjectPreEstimate(viewer, projectId, columns, tx);
        if (!written) throw new Error("project.pre_estimate_no_row");
        savedPreEstimate = moneyFromRow(columns);
        if (
          locked.preEstimateCurrency !== columns.currency ||
          locked.preEstimateForeignAmount !== columns.foreignAmount ||
          locked.preEstimateFxRate !== columns.fxRate ||
          locked.preEstimateAmountKrw !== columns.amountKrw
        ) {
          changed.preEstimateChanged = true;
        }
      }

      if (Object.keys(changed).length > 0) {
        await recordAction(
          viewer,
          { actionType: "document_update", entity: PROJECT_ENTITY, entityId: projectId, detail: changed },
          { tx },
        );
      }

      if (resolved) {
        if (resolved.statusChange) {
          const reverted = await updateProjectStatusIfCurrent(
            viewer,
            projectId,
            { expectedStatus: resolved.statusChange.from, status: resolved.statusChange.to, fillEndDateFromStart: false },
            tx,
          );
          if (!reverted) throw new Error("project.period_revert_no_row");
          current = reverted;
          // D-80: 되돌리기는 날짜를 고친 사람의 판단이다 — 사람 행위자, 같은 tx(A-01).
          await recordAction(
            viewer,
            {
              actionType: "status_change",
              entity: PROJECT_ENTITY,
              entityId: projectId,
              detail: {
                from: resolved.statusChange.from,
                to: resolved.statusChange.to,
                trigger: "end_date_extended",
                endDate: { from: locked.endDate, to: resolved.endDate },
              },
            },
            { tx },
          );
        }

        // ③ 재판정 — 새 종료일이 지난 진행이면 같은 커밋에서 시스템 행위자로 정산한다.
        const rejudged = await loadProjectForGate(viewer, projectId, { now, tx }, { recordAction });
        if (!rejudged) throw new Error("project.period_rejudge_no_row");
        current = rejudged;
      }

      // ④ 견적 줄 ⑤ 매출 — ③이 만든 새 행 위에서(ENG-D6).
      const quoteLinesResult = input.quoteLines
        ? await saveQuoteLines(viewer, input.quoteLines.revisionId, input.quoteLines.rows, deferRecord, tx)
        : null;
      if (input.revenue) await saveRevenue(viewer, projectId, input.revenue, deferRecord, tx);
      return {
        quoteLinesResult,
        project: {
          status: current.status,
          startDate: current.startDate,
          endDate: current.endDate,
          ...(savedPreEstimate ? { preEstimate: savedPreEstimate } : {}),
        },
      };
    });
    return { ...inTx, pendingActions };
  });

  // D-71 · ENG-D3 ① — 최근 환율은 커밋 뒤에만 기억한다(거부·롤백된 저장은 여기 오지 않는다). 실패해도 저장은
  // 이미 끝났다 — 오류 로그만 남긴다.
  const savedPreEstimate = project.preEstimate;
  if (input.preEstimate?.fxRateTouched && savedPreEstimate && savedPreEstimate.currency !== "KRW") {
    try {
      await (deps?.rememberFxRate ?? defaultRememberFxRate)(savedPreEstimate.currency, savedPreEstimate.fxRate);
    } catch {
      log.error("fx.remember_failed", { currency: savedPreEstimate.currency });
    }
  }
  for (const entry of pendingActions) await defaultRecordAction(viewer, entry);

  // 트랜잭션 커밋 뒤 스냅샷을 새로 읽는다 — saveRevenue가 tx 안에서 커밋
  // 전 listRevenue를 부르면 자기 자신의 쓰기를 보지 못한다(격리).
  const revenueResult = input.revenue ? await listRevenue(viewer, projectId) : null;

  return { quoteLines: quoteLinesResult, revenue: revenueResult, project };
}
