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
import type { HistoryEntry } from "@/ui/history-list/HistoryList";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { SettingsFormClient, type SettingsSection, type SettingsFieldViewModel } from "./settings-form-client";

// D-36 계약: 화면 코드에 계급 이름 분기가 없다. 캐시 없음 — 화면 로드마다
// 레지스트리를 순회해 다시 그린다(ADMN-05: "설정 화면이 레지스트리에서
// 자동 생성된다").
export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatValue(descriptor: SettingFieldDescriptor, value: unknown): string {
  if (descriptor.kind === "boolean") return value === true ? "켬" : "끔";
  if (descriptor.kind === "multi-enum") {
    return Array.isArray(value) && value.length > 0 ? value.join(", ") : "(없음)";
  }
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
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

  for (const def of SETTING_DEFS) {
    const descriptor = describeSettingField(def);
    let field: SettingsFieldViewModel["field"];

    if (def.kind === "historized") {
      const history = await listSettingHistory(def);
      const today = todayIso();
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
      try {
        currentValue = await getSettingValue(def);
      } catch {
        currentValue = undefined;
      }
      field = { kind: "simple", descriptor, value: currentValue };
      values[def.key] = currentValue;
    }

    const viewModel: SettingsFieldViewModel = {
      key: def.key,
      label: def.label,
      hint: def.hint,
      field,
      options: field.kind === "simple" ? optionsFor(def, descriptor, field.value, routeOptions) : undefined,
    };

    const bucket = sections.get(def.namespace);
    if (bucket) bucket.push(viewModel);
    else sections.set(def.namespace, [viewModel]);
  }

  // CX-W2: 켜짐 판정은 저장값 전부를 모은 뒤에 한다 — 판정은 값을 지우지 않는다.
  return Array.from(sections.entries()).map(([namespace, fields]) => ({
    namespace,
    fields: fields.map((field) => ({ ...field, disabled: !isSettingActive(routeOptions.activeWhen[field.key], values) })),
  }));
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.settings", "view"))) notFound();

  const sections = await buildSections(session.viewer);

  return (
    <>
      <PageHeader title="설정" />
      <div className="single-column">
        <SettingsFormClient sections={sections} />
      </div>
    </>
  );
}
