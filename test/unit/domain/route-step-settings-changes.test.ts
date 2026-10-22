import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingDef } from "@/domain/settings/registry";
import type { Viewer } from "@/domain/viewer";

// quick 261022-cwp(round2-money F2): 결재선 단계 저장의 특정 부서 칸 — 기본값 없는 칸이 저장값 없음 → 빈 값으로 바뀌지
// 않았으면 그 칸 기록은 빈 changes다(이전 값도 화면이 보인 빈 값). 잠금 · 읽기는 저장 행 없음으로 갈아 끼운다.
const mocks = vi.hoisted(() => {
  const tx = { tx: true };
  return {
    tx,
    withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    lockRouteStep: vi.fn(),
    lockSimpleValues: vi.fn(),
  };
});

vi.mock("@/lib/db-transaction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-transaction")>()),
  withTransaction: mocks.withTransaction,
}));
vi.mock("@/repositories/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/repositories/settings")>()),
  lockRouteStep: mocks.lockRouteStep,
  lockSimpleValues: mocks.lockSimpleValues,
}));

// 문서 종류 등록(앱 진입점과 같은 세 모듈).
await import("@/domain/leave");
await import("@/domain/expenses");
await import("@/domain/settlements");
const { LEAVE_DOCUMENT_KIND } = await import("@/domain/leave/access");
const { getDocumentKind, listDocumentKinds } = await import("@/domain/approvals/kinds");
const { saveRouteStepSettings } = await import("@/domain/approvals/route-step-settings");

const viewer: Viewer = { id: "u1", roleId: "role-sysadmin" };
const ORG_UNIT_ID = "11111111-2222-4333-8444-555555555555";

function makeDeps() {
  return {
    can: vi.fn().mockResolvedValue(true),
    upsertSimpleValue: vi.fn().mockResolvedValue(undefined),
    recordAction: vi.fn().mockResolvedValue(undefined),
  };
}

function changesFor(recordAction: ReturnType<typeof makeDeps>["recordAction"], key: string): unknown {
  const call = recordAction.mock.calls.find((args) => (args[1] as { entityId: string }).entityId === key);
  return (call?.[1] as { detail: { changes: unknown } } | undefined)?.detail.changes;
}

// 기본값이 있고 스키마를 통과하면 기본값, 아니면 스키마를 통과하는 값을 직접 준다.
function defaultOr<T>(def: SettingDef<T>, fallback: T): T {
  return def.default !== undefined && def.schema.safeParse(def.default).success ? def.default : fallback;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lockRouteStep.mockResolvedValue(undefined);
  mocks.lockSimpleValues.mockResolvedValue([]);
});

describe("결재선 단계 저장 — 특정 부서 칸 changes", () => {
  it("연차 3단: 저장값 없는 특정 부서를 생략해 저장하면 그 칸 기록은 빈 changes다", async () => {
    const step = getDocumentKind(LEAVE_DOCUMENT_KIND).routeSettings!.steps[2]!;
    const deps = makeDeps();
    await saveRouteStepSettings(
      viewer,
      { kind: LEAVE_DOCUMENT_KIND, stepIndex: 3, values: { enabled: true, roleId: "", scope: "company" } },
      deps,
    );
    expect(changesFor(deps.recordAction, step.orgUnitId.key)).toEqual({});
  });

  it("모든 문서 종류 · 기본값 없는 특정 부서 단계: 기본값 저장은 특정 부서 칸 빈 changes다", async () => {
    const cases = listDocumentKinds().flatMap((kind) =>
      (kind.routeSettings?.steps ?? [])
        .map((step, index) => ({ kind: kind.kind, stepIndex: index + 1, step }))
        .filter(({ step }) => step.orgUnitId.default === undefined),
    );
    expect(cases.length).toBeGreaterThan(0);
    const actual: Record<string, unknown> = {};
    for (const { kind, stepIndex, step } of cases) {
      const deps = makeDeps();
      await saveRouteStepSettings(
        viewer,
        {
          kind,
          stepIndex,
          values: {
            enabled: defaultOr(step.enabled, true),
            roleId: defaultOr(step.roleId, ""),
            scope: defaultOr(step.scope, "company"),
          },
        },
        deps,
      );
      actual[step.orgUnitId.key] = changesFor(deps.recordAction, step.orgUnitId.key);
    }
    expect(actual).toEqual(Object.fromEntries(cases.map(({ step }) => [step.orgUnitId.key, {}])));
  });

  it("빈 특정 부서를 부서 id로 바꾸면 그 칸 기록은 [빈 값, id]다", async () => {
    const step = getDocumentKind(LEAVE_DOCUMENT_KIND).routeSettings!.steps[2]!;
    const deps = makeDeps();
    await saveRouteStepSettings(
      viewer,
      { kind: LEAVE_DOCUMENT_KIND, stepIndex: 3, values: { enabled: true, roleId: "", scope: "org_unit", orgUnitId: ORG_UNIT_ID } },
      deps,
    );
    expect(changesFor(deps.recordAction, step.orgUnitId.key)).toEqual({ value: ["", ORG_UNIT_ID] });
  });
});
