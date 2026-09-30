import type { Viewer } from "@/domain/viewer";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { getDocumentKind, listDocumentKinds } from "@/domain/approvals/kinds";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { lockRouteStep, lockSimpleValues, upsertSimpleValue as defaultUpsertSimpleValue } from "@/repositories/settings";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { simpleValueOrDefault } from "@/domain/settings/registry";

// 사용자 결정(2026-09-30 A · PR #90 Codex r4137164384): 결재선 한 단계(사용 · 담당 계급 · 조직 범위 · 특정 부서)는
// 네 칸을 한 트랜잭션에 저장한다 — 칸마다 저장하면 그 사이의 중간 결재선이 제출된 문서에 굳는다. 결재선 로더는
// 17키를 한 문장으로 읽으므로 커밋 전후 둘 중 하나만 본다. 로그도 같은 tx(실패하면 네 칸 모두 옛 값).

export type RouteStepValues = { enabled?: unknown; roleId?: unknown; scope?: unknown; orgUnitId?: unknown };

export type RouteStepSettingsDeps = {
  can: typeof defaultCan;
  upsertSimpleValue: typeof defaultUpsertSimpleValue;
  recordAction: typeof defaultRecordAction;
};

// 칸 하나 저장 경로(setSimpleSettingAction)가 단계 칸을 거부하는 판정 — 단계 칸은 이 파일의 저장으로만 쓴다.
export function isRouteStepSettingKey(key: string): boolean {
  return listDocumentKinds().some((kind) =>
    (kind.routeSettings?.steps ?? []).some((step) => [step.enabled, step.roleId, step.scope, step.orgUnitId].some((def) => def.key === key)),
  );
}

export const ROUTE_STEP_STALE_ERROR = "다른 저장이 먼저 됨 · 새로 고침";

// 특정 부서는 기본값이 없는 단계가 있다 — 결재선 로더처럼 값이 없으면 빈 값(빈 자리)으로 본다.
function withOrgUnitFallback(values: RouteStepValues): RouteStepValues {
  return { ...values, orgUnitId: values.orgUnitId ?? "" };
}

export async function saveRouteStepSettings(
  viewer: Viewer,
  // expected = 화면을 열 때의 저장값. 주면 같은 tx에서 행을 잠그고 비교해, 그 사이 다른 저장이 있었으면 거부한다
  // (오래된 화면이 손대지 않은 칸까지 옛 값으로 덮어쓰지 않게).
  input: { kind: string; stepIndex: number; values: RouteStepValues; expected?: RouteStepValues },
  deps?: Partial<RouteStepSettingsDeps>,
): Promise<void> {
  const can = deps?.can ?? defaultCan;
  if (!(await can(viewer, "admin.settings", "write"))) throw new ForbiddenError("설정 변경 권한 없음");

  const step = getDocumentKind(input.kind).routeSettings?.steps[input.stepIndex - 1];
  if (!step) throw new UserFacingError("결재선 단계 없음");
  const defs = [step.enabled, step.roleId, step.scope, step.orgUnitId];

  // 쓰기 전에 네 칸을 전부 검증한다 — 한 칸이라도 틀리면 아무것도 쓰지 않는다.
  const values = withOrgUnitFallback(input.values);
  const entries = [
    { key: step.enabled.key, value: step.enabled.schema.parse(values.enabled) },
    { key: step.roleId.key, value: step.roleId.schema.parse(values.roleId) },
    { key: step.scope.key, value: step.scope.schema.parse(values.scope) },
    { key: step.orgUnitId.key, value: step.orgUnitId.schema.parse(values.orgUnitId) },
  ];

  const upsertSimpleValue = deps?.upsertSimpleValue ?? defaultUpsertSimpleValue;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await withTransaction(async (tx) => {
    await lockRouteStep(viewer, `${input.kind}:${input.stepIndex}`, tx);
    if (input.expected) {
      const rows = await lockSimpleValues(viewer, defs.map((def) => def.key), tx);
      // 화면과 같은 규칙으로 읽는다 — 형식이 맞지 않는 저장값은 기본값(화면이 보인 값)이어야 기대값과 맞는다.
      const stored = new Map(rows.map((row) => [row.key, row]));
      const current = withOrgUnitFallback({
        enabled: simpleValueOrDefault(step.enabled, stored.get(step.enabled.key)),
        roleId: simpleValueOrDefault(step.roleId, stored.get(step.roleId.key)),
        scope: simpleValueOrDefault(step.scope, stored.get(step.scope.key)),
        orgUnitId: simpleValueOrDefault(step.orgUnitId, stored.get(step.orgUnitId.key)),
      });
      const expected = withOrgUnitFallback(input.expected);
      const fields = ["enabled", "roleId", "scope", "orgUnitId"] as const;
      if (fields.some((field) => current[field] !== expected[field])) throw new UserFacingError(ROUTE_STEP_STALE_ERROR);
    }
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
