import "@/app/(app)/document-kinds";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import type { Viewer } from "@/domain/viewer";
import { SETTING_DEFS } from "@/domain/settings/keys";
import {
  getSettingValue,
  listSettingHistory,
  describeSettingField,
  type SettingDef,
  type SettingFieldDescriptor,
} from "@/domain/settings/registry";
import { isSettingActive, listApprovalRouteOptions, type ApprovalRouteOptions } from "@/domain/approvals/settings-options";
import { listApprovalRouteSettingWarnings } from "@/domain/approvals/settings-warnings";
import { formatCount, formatForeignAmount, formatFxRate, formatKrw, formatQuantity } from "@/lib/format-number";
import { seoulToday } from "@/lib/dates";
import type { HistoryEntry } from "@/ui/history-list/HistoryList";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { SettingsFormClient, type SettingsSection, type SettingsFieldViewModel } from "./settings-form-client";

// D-36 계약: 화면 코드에 계급 이름 분기가 없다. 캐시 없음 — 화면 로드마다
// 레지스트리를 순회해 다시 그린다(ADMN-05: "설정 화면이 레지스트리에서
// 자동 생성된다").
export const dynamic = "force-dynamic";

// numberKind가 있으면 그 종류의 포맷터, 없으면 정수만 쉼표로 그리고 소수(0~1 비율 등)는 저장값 그대로 —
// formatQuantity(2자리) · formatFxRate(4자리)는 0.088 같은 비율을 반올림해 잘못 보여 준다.
function formatNumberValue(descriptor: SettingFieldDescriptor, value: number): string {
  if (descriptor.kind === "number" && descriptor.numberKind) {
    switch (descriptor.numberKind) {
      case "krw":
        return formatKrw(value);
      case "fxRate":
        return formatFxRate(value);
      case "foreign":
        return formatForeignAmount(value);
      case "quantity":
        return formatQuantity(value);
    }
  }
  return Number.isInteger(value) ? formatCount(value) : String(value);
}

function formatValue(descriptor: SettingFieldDescriptor, value: unknown): string {
  if (descriptor.kind === "boolean") return value === true ? "켬" : "끔";
  if (descriptor.kind === "multi-enum") {
    return Array.isArray(value) && value.length > 0 ? value.join(", ") : "(없음)";
  }
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumberValue(descriptor, value);
  return "(값 없음)";
}

// 04.1-04(U3): 키 정의의 optionLabels · dynamicOptions로 select 옵션을 만든다. 동적
// 옵션은 맨 앞에 빈 값(라벨은 optionLabels[""], 없으면 —)을 두고, 저장값이 지금 목록에
// 없으면(보관됨) 그 값을 (보관됨) 한 옵션으로 남겨 저장값이 조용히 바뀌지 않게 한다.
function optionsFor(
  def: SettingDef<unknown>,
  descriptor: SettingFieldDescriptor,
  value: unknown,
  routeOptions: ApprovalRouteOptions,
): SettingsFieldViewModel["options"] {
  if (def.dynamicOptions) {
    const list = def.dynamicOptions === "roles" ? routeOptions.roles : routeOptions.orgUnits;
    const options = [
      { value: "", label: def.optionLabels?.[""] ?? "—" },
      ...list.filter((item) => !item.archived).map((item) => ({ value: item.id, label: item.name })),
    ];
    if (typeof value === "string" && !options.some((option) => option.value === value)) {
      options.push({ value, label: "(보관됨)" });
    }
    return options;
  }
  if (def.optionLabels && descriptor.kind === "enum") {
    return descriptor.options.map((option) => ({ value: option, label: def.optionLabels?.[option] ?? option }));
  }
  return undefined;
}

async function buildSections(viewer: Viewer): Promise<SettingsSection[]> {
  const sections = new Map<string, SettingsFieldViewModel[]>();
  const values: Record<string, unknown> = {};
  const routeOptions = await listApprovalRouteOptions(viewer);
  const warnings = await listApprovalRouteSettingWarnings(viewer);

  for (const def of SETTING_DEFS) {
    const descriptor = describeSettingField(def);
    let field: SettingsFieldViewModel["field"];

    if (def.kind === "historized") {
      const history = await listSettingHistory(def);
      const today = seoulToday();
      // 가장 최근의 effectiveFrom <= 오늘인 행이 "적용 중" — listSettingHistory는
      // 이미 내림차순이므로 그 조건을 만족하는 첫 행이 유효값이다.
      let activeMarked = false;
      const entries: HistoryEntry[] = history.map((entry) => {
        if (entry.effectiveFrom > today) return { effectiveFrom: entry.effectiveFrom, displayValue: formatValue(descriptor, entry.value), status: "scheduled" };
        if (!activeMarked) {
          activeMarked = true;
          return { effectiveFrom: entry.effectiveFrom, displayValue: formatValue(descriptor, entry.value), status: "active" };
        }
        return { effectiveFrom: entry.effectiveFrom, displayValue: formatValue(descriptor, entry.value), status: "past" };
      });
      field = { kind: "historized", descriptor, entries };
    } else {
      let currentValue: unknown;
      if (def.key in routeOptions.values) {
        // 결재선 단계 칸은 옵션이 한 문장으로 읽은 값(Codex r4141687065) — 단계 기준값이 두 저장 사이로 섞이지 않게.
        currentValue = routeOptions.values[def.key];
      } else {
        try {
          currentValue = await getSettingValue(def);
        } catch {
          currentValue = undefined;
        }
      }
      field = { kind: "simple", descriptor, value: currentValue };
      values[def.key] = currentValue;
    }

    const viewModel: SettingsFieldViewModel = {
      key: def.key,
      label: def.label,
      hint: def.hint,
      ...(def.unitLabel ? { unitLabel: def.unitLabel } : {}),
      field,
      options: field.kind === "simple" ? optionsFor(def, descriptor, field.value, routeOptions) : undefined,
      warning: warnings[def.key],
    };

    const bucket = sections.get(def.namespace);
    if (bucket) bucket.push(viewModel);
    else sections.set(def.namespace, [viewModel]);
  }

  // CX-W2: 켜짐 판정은 저장값 전부를 모은 뒤에 한다 — 판정은 값을 지우지 않는다. 결재선 단계 칸은
  // 저장 전 화면 값으로 다시 판정하도록 조건과 단계를 함께 넘긴다(사용자 결정 2026-09-30 A).
  return Array.from(sections.entries()).map(([namespace, fields]) => ({
    namespace,
    fields: fields.map((field) => ({
      ...field,
      disabled: !isSettingActive(routeOptions.activeWhen[field.key], values),
      activeWhen: routeOptions.activeWhen[field.key],
      step: routeOptions.steps[field.key],
    })),
  }));
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.settings", "view"))) notFound();

  const sections = await buildSections(session.viewer);

  return (
    <DetailScreen title="설정">
      <div className="single-column">
        <SettingsFormClient sections={sections} viewerId={session.viewer.id} />
      </div>
    </DetailScreen>
  );
}
