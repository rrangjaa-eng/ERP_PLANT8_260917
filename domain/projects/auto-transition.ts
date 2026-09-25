import { SYSTEM_VIEWER } from "@/domain/viewer";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { AUTO_TRANSITIONS } from "@/domain/projects/status-transitions";
import { withTransaction } from "@/lib/db-transaction";
import { addDays, kstDateOf, kstToday } from "@/lib/kst-date";
import { log } from "@/lib/log";
import { settleOverdueProjects } from "@/repositories/projects";

// 04-11(D-76 · D-50 · CEO A-01·A-08·A-15·A-39·OV-5 · 사용자 D19) — 진행 → 정산 자동 전환.
// 읽기 시점 판정이다. 읽기용 입구(applyAutoSettlement)는 짧은 별도 트랜잭션에서 잠긴 행을
// 건너뛰며 돌고 실패해도 읽기를 막지 않는다(fail-open). 상태 변경과 그 행동 로그 한 줄은
// 한 트랜잭션이다 — 로그가 실패하면 상태도 진행으로 남아 다음 판정이 다시 잡는다.
// Phase 7 예약 작업은 같은 applyAutoSettlement를 부르기만 한다.

const PROJECT_ENTITY = "project";
const [AUTO_SETTLE] = AUTO_TRANSITIONS;

export type AutoSettlementDeps = {
  now: () => Date;
  transaction: typeof withTransaction;
  settle: typeof settleOverdueProjects;
  recordAction: typeof defaultRecordAction;
  logger: Pick<typeof log, "info" | "error">;
};

// A-08: 발효일 = max(종료일 + 1, 직전 상태 변경일). 판정이 늦게 돌아도 기록상의 날짜는 D-76
// 그대로이고, 종료일이 지난 뒤 사람이 진행으로 바꾼 건은 그 바꾼 날보다 앞서지 않는다.
export function effectiveOnFor(input: { endDate: string; lastChangeOn: string | null }): string {
  const dayAfterEnd = addDays(input.endDate, 1);
  return input.lastChangeOn !== null && input.lastChangeOn > dayAfterEnd ? input.lastChangeOn : dayAfterEnd;
}

function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const cause = (error as { cause?: unknown }).cause;
  const code = (error as { code?: unknown }).code ?? (cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? `${error.name}:${code}` : error.name;
}

// projectIds가 없으면 대상 전체(목록 입구 · Phase 7 예약 작업). 바뀐 프로젝트 id를 돌려준다.
export async function applyAutoSettlement(
  opts: { projectIds?: string[] },
  deps?: Partial<AutoSettlementDeps>,
): Promise<string[]> {
  const now = deps?.now ?? (() => new Date());
  const transaction = deps?.transaction ?? withTransaction;
  const settle = deps?.settle ?? settleOverdueProjects;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const logger = deps?.logger ?? log;

  try {
    const settled = await transaction(async (tx) => {
      const rows = await settle(
        SYSTEM_VIEWER,
        { todayKst: kstToday(now()), projectIds: opts.projectIds, from: AUTO_SETTLE.from, to: AUTO_SETTLE.to },
        tx,
      );
      for (const row of rows) {
        const lastChangeOn = row.lastChangeAt ? kstDateOf(row.lastChangeAt) : null;
        await recordAction(
          SYSTEM_VIEWER,
          {
            actionType: "status_change",
            entity: PROJECT_ENTITY,
            entityId: row.id,
            detail: {
              from: AUTO_SETTLE.from,
              to: AUTO_SETTLE.to,
              trigger: AUTO_SETTLE.trigger,
              effectiveOn: effectiveOnFor({ endDate: row.endDate, lastChangeOn }),
            },
          },
          { tx },
        );
      }
      return rows.map((row) => row.id);
    });
    if (settled.length > 0) logger.info("project.auto_settle", { count: settled.length });
    return settled;
  } catch (error) {
    // 읽기를 막지 않는다 — 쓰기 경로는 잠금 안에서 같은 판정을 다시 한다(loadProjectForGate).
    logger.error("project.auto_settle_failed", { projectIds: opts.projectIds ?? null, reason: failureReason(error) });
    return [];
  }
}
