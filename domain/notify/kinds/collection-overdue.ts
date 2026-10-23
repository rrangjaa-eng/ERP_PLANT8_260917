// 수금 지연(N22 · D-716) — 발행 줄의 수금 예정일이 지나도 덜 받은 프로젝트를 담당 PM에게. 판정은 Task 1 collectionOverdueByProject 한 벌
// (목록 · 상세 배지와 같은 정의 — 두 벌 금지). 완료 프로젝트도 대상 · 보관 프로젝트 · 비활성 담당 PM은 후보 없음. 사건 키는 `{프로젝트}:{예정일}` —
// 같은 예정일이면 한 행, 새 발행 줄이 새로 지연되면 새 행. 금액은 문장에 넣지 않고, 받는 사람 계급이 revenue.paid_amount를 볼 때만(tick 거르개).
// 꺼 둔 종류 · 일수 칸 · 사다리 없음.
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { collectionOverdueByProject } from "@/domain/revenue";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listCollectionCandidateProjects, type CollectionCandidateProject } from "@/repositories/revenue-entries";
import type { NotifyTx } from "@/repositories/notifications";

const KIND = "collection-overdue";

export type CollectionOverdueKindDeps = {
  max: number;
  listCandidates: (input: { limit: number; today: string }, tx?: NotifyTx) => Promise<CollectionCandidateProject[]>;
  overdueByProject: typeof collectionOverdueByProject;
};

function shortDate(date: string): string {
  return date.slice(5);
}

export function createCollectionOverdueKind(deps?: Partial<CollectionOverdueKindDeps>): ConditionKind {
  const max = deps?.max ?? NOTIFY_KIND_EVAL_MAX;
  const listCandidates = deps?.listCandidates ?? ((input, tx) => listCollectionCandidateProjects(SYSTEM_VIEWER, input, tx));
  const overdueByProject = deps?.overdueByProject ?? collectionOverdueByProject;
  return {
    kind: KIND,
    label: "수금 지연",
    dateUnit: "calendar",
    defaults: { enabled: false, emailEnabled: true },
    defaultRecipientLabel: "담당 PM",
    recipientInfoItem: "revenue.paid_amount",
    async evaluate(ctx) {
      // 상한 + 1로 읽어 넘침을 안다 — 넘치면 상한까지만 판정하고 경고 한 번.
      const found = await listCandidates({ limit: max + 1, today: ctx.today }, ctx.tx);
      const projects = capRows(KIND, found, max).filter(
        (project): project is CollectionCandidateProject & { pmUserId: string } => project.pmUserId !== null && project.pmRoleId !== null,
      );
      if (projects.length === 0) return [];
      const statuses = await overdueByProject(
        SYSTEM_VIEWER,
        projects.map((project) => project.id),
        { today: ctx.today, tx: ctx.tx },
      );
      const candidates: NotificationCandidate[] = [];
      for (const project of projects) {
        const status = statuses.get(project.id);
        if (!status?.overdue || !status.dueDate) continue;
        candidates.push({
          entity: "project",
          entityId: `${project.id}:${status.dueDate}`,
          recipientId: project.pmUserId,
          recipientRoleId: project.pmRoleId,
          round: 1,
          referenceDate: status.dueDate,
          message: `수금 지연 · ${project.name} · 예정 ${shortDate(status.dueDate)}`,
        });
      }
      return candidates;
    },
  };
}

export const collectionOverdueKind: ConditionKind = createCollectionOverdueKind();
