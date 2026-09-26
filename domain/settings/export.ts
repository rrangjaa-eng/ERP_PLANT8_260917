import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { SETTING_DEFS } from "@/domain/settings/keys";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  getSettingValue as defaultGetSettingValue,
  listSettingHistory as defaultListSettingHistory,
} from "@/domain/settings/registry";
import { applySettingsImport as defaultApplySettingsImport } from "@/repositories/settings";

// ADMN-06: 설정 JSON 내보내기·가져오기. 내보내기는 excel_export(끌 수 없는
// 종류)로 행동 로그에 남는다 — 새 종류를 만들지 않는다(CORE_ACTION_TYPES는
// 03-01이 고정했다). 전 설정 덤프가 설정으로 조용해질 수 없다.
const SCHEMA_VERSION = "1";

export class ForbiddenError extends UserFacingError {}
export class ImportValidationError extends UserFacingError {
  constructor(public readonly issues: string[]) {
    super(`설정 가져오기 검증 실패: ${issues.join("; ")}`);
  }
}

export type SettingsExport = {
  schemaVersion: string;
  exportedAt: string;
  settings: Record<string, unknown>;
};

export type ExportDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  getSettingValue: typeof defaultGetSettingValue;
  listSettingHistory: typeof defaultListSettingHistory;
};

// 설정 메뉴 보기 권한 확인 → excel_export 기록 → 등록 키 전부의 현재 상태를
// 담은 평범한 객체를 반환한다. 비이력형은 값 하나, 이력형은
// { effectiveFrom, value } 배열 전부.
export async function exportSettings(viewer: Viewer, deps?: Partial<ExportDeps>): Promise<SettingsExport> {
  const can = deps?.can ?? defaultCan;
  const allowed = await can(viewer, "admin.settings", "view");
  if (!allowed) throw new ForbiddenError("설정 내보내기 권한 없음");

  const getSettingValue = deps?.getSettingValue ?? defaultGetSettingValue;
  const listSettingHistory = deps?.listSettingHistory ?? defaultListSettingHistory;

  const settings: Record<string, unknown> = {};
  for (const def of SETTING_DEFS) {
    if (def.kind === "historized") {
      settings[def.key] = await listSettingHistory(def);
      continue;
    }
    try {
      settings[def.key] = await getSettingValue(def);
    } catch {
      // 기본값도 없고 값도 없는 키(신규 등록 직후)는 내보내기에서 건너뛴다.
    }
  }

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "excel_export",
    entity: "settings",
    detail: { format: "json", scope: "settings" },
  });

  return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings };
}

export type ImportDeps = ExportDeps & {
  applySettingsImport: typeof defaultApplySettingsImport;
};

type HistorizedImportEntry = { effectiveFrom?: unknown; value?: unknown };

// T-03-24: 전 항목을 먼저 검증한다(등록되지 않은 키, 스키마 불일치, 이력
// 항목의 시작일 중복) — 하나라도 실패하면 아무것도 쓰지 않고 실패 목록을
// 담은 오류를 던진다. 전부 통과하면 한 트랜잭션 안에서 적용한다(멱등).
export async function importSettings(
  viewer: Viewer,
  payload: SettingsExport,
  deps?: Partial<ImportDeps>,
): Promise<void> {
  const can = deps?.can ?? defaultCan;
  const allowed = await can(viewer, "admin.settings", "write");
  if (!allowed) throw new ForbiddenError("설정 가져오기 권한 없음");

  const issues: string[] = [];
  const simple: Array<{ key: string; value: unknown; by: string | null }> = [];
  const historized: Array<{ key: string; effectiveFrom: string; value: unknown; by: string | null }> = [];

  for (const [key, raw] of Object.entries(payload.settings ?? {})) {
    const def = SETTING_DEFS.find((candidate) => candidate.key === key);
    if (!def) {
      issues.push(`등록되지 않은 키: ${key}`);
      continue;
    }

    if (def.kind === "historized") {
      if (!Array.isArray(raw)) {
        issues.push(`'${key}'는 이력 배열이어야 합니다.`);
        continue;
      }
      const seenDates = new Set<string>();
      for (const entry of raw as HistorizedImportEntry[]) {
        const effectiveFrom = entry?.effectiveFrom;
        if (typeof effectiveFrom !== "string") {
          issues.push(`'${key}' 항목에 적용 시작일이 없습니다.`);
          continue;
        }
        if (seenDates.has(effectiveFrom)) {
          issues.push(`'${key}'에 중복된 적용 시작일이 있습니다: ${effectiveFrom}`);
          continue;
        }
        const parsed = def.schema.safeParse(entry.value);
        if (!parsed.success) {
          issues.push(`'${key}'(${effectiveFrom}) 값이 스키마를 만족하지 않습니다.`);
          continue;
        }
        seenDates.add(effectiveFrom);
        historized.push({ key, effectiveFrom, value: parsed.data, by: viewer.id });
      }
      continue;
    }

    const parsed = def.schema.safeParse(raw);
    if (!parsed.success) {
      issues.push(`'${key}' 값이 스키마를 만족하지 않습니다.`);
      continue;
    }
    simple.push({ key, value: parsed.data, by: viewer.id });
  }

  if (issues.length > 0) {
    throw new ImportValidationError(issues);
  }

  const applySettingsImport = deps?.applySettingsImport ?? defaultApplySettingsImport;
  await applySettingsImport(viewer, { simple, historized });

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "settings_change",
    entity: "settings",
    detail: { format: "json", scope: "import" },
  });
}
