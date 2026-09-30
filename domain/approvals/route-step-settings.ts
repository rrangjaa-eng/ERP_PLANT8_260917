import type { Viewer } from "@/domain/viewer";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { getDocumentKind } from "@/domain/approvals/kinds";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { upsertSimpleValue as defaultUpsertSimpleValue } from "@/repositories/settings";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";

// 사용자 결정(2026-09-30 A · PR #90 Codex r4137164384): 결재선 한 단계(사용 · 담당 계급 · 조직 범위 · 특정 부서)는
// 네 칸을 한 트랜잭션에 저장한다 — 칸마다 저장하면 그 사이의 중간 결재선이 제출된 문서에 굳는다. 결재선 로더는
// 17키를 한 문장으로 읽으므로 커밋 전후 둘 중 하나만 본다. 로그도 같은 tx(실패하면 네 칸 모두 옛 값).

export type RouteStepValues = { enabled?: unknown; roleId?: unknown; scope?: unknown; orgUnitId?: unknown };

export type RouteStepSettingsDeps = {
  can: typeof defaultCan;
  upsertSimpleValue: typeof defaultUpsertSimpleValue;
  recordAction: typeof defaultRecordAction;
};

export async function saveRouteStepSettings(
  viewer: Viewer,
  input: { kind: string; stepIndex: number; values: RouteStepValues },
  deps?: Partial<RouteStepSettingsDeps>,
): Promise<void> {
  const can = deps?.can ?? defaultCan;
  if (!(await can(viewer, "admin.settings", "write"))) throw new ForbiddenError("설정 변경 권한 없음");

  const step = getDocumentKind(input.kind).routeSettings?.steps[input.stepIndex - 1];
  if (!step) throw new UserFacingError("결재선 단계 없음");

  // 쓰기 전에 네 칸을 전부 검증한다 — 한 칸이라도 틀리면 아무것도 쓰지 않는다.
  const entries = [
    { key: step.enabled.key, value: step.enabled.schema.parse(input.values.enabled) },
    { key: step.roleId.key, value: step.roleId.schema.parse(input.values.roleId) },
    { key: step.scope.key, value: step.scope.schema.parse(input.values.scope) },
    { key: step.orgUnitId.key, value: step.orgUnitId.schema.parse(input.values.orgUnitId) },
  ];

  const upsertSimpleValue = deps?.upsertSimpleValue ?? defaultUpsertSimpleValue;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await withTransaction(async (tx) => {
    for (const entry of entries) {
      await upsertSimpleValue(viewer, entry.key, entry.value, viewer.id, tx);
      await recordAction(
        viewer,
        { actionType: "settings_change", entity: "settings_simple", entityId: entry.key, detail: { key: entry.key } },
        { tx },
      );
    }
  });
}
