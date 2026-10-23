import { MENUS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { SETTING_DEFS } from "@/domain/settings/keys";

// 07-25 K16 · SC-08: 행동 로그 `detail.changes = {칸: [이전, 이후]}`(쓰는 쪽 07-04 `buildChanges`)를
// 사람이 읽는 줄로 바꾼다. 바뀐 칸 전부를 돌려주고 자르지 않는다 — 자르기는 표 칸(detail-cell) 몫.
export type DetailLine = { label: string; before: string; after: string };

const CHANGED = "바뀜";
const NONE = "없음";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 칸 이름 표 — 설정 키는 레지스트리 라벨, 권한 칸은 메뉴 라벨 + 동작 낱말을 쓰므로 여기엔 나머지가 든다.
export const CHANGE_FIELD_LABELS: Record<string, string> = {
  value: "값",
  allowed: "허용",
  visible: "노출",
  name: "이름",
  workScope: "업무 범위",
  viewScope: "보는 범위",
  roleId: "계급",
  scheduledPaymentDate: "지급 예정일",
  budgetKrw: "예산",
  enabled: "켬",
  days: "일수",
  extraRoleIds: "받는 계급",
  emailEnabled: "이메일 알림",
  accountNumber: "계좌번호",
  bankAccountNo: "계좌번호",
  accountNo: "계좌번호",
  rrn: "주민등록번호",
  residentNumber: "주민등록번호",
  password: "비밀번호",
  tempPassword: "비밀번호",
};

// 민감 칸 — 쓰는 쪽이 이미 가렸어도 렌더 쪽이 칸 이름으로 한 번 더 가린다(T-07-25-01).
const LAST4_FIELDS = new Set(["accountNumber", "bankAccountNo", "accountNo"]);
const CHANGED_ONLY_FIELDS = new Set(["rrn", "residentNumber", "password", "tempPassword"]);

const ACTION_WORDS: Record<string, string> = { view: "보기", write: "쓰기", approve: "승인" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maskLast4(value: unknown): string {
  if (value === null || value === undefined) return NONE;
  if (typeof value !== "string" && typeof value !== "number") return CHANGED;
  const text = String(value);
  if (text.startsWith("····")) return text;
  const digits = text.replace(/\D/g, "");
  return digits.length < 4 ? CHANGED : `····${digits.slice(-4)}`;
}

function formatPlain(value: unknown): string {
  if (value === null || value === undefined) return NONE;
  if (typeof value === "boolean") return value ? "켬" : "끔";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 20 }) : CHANGED;
  if (typeof value === "string") {
    if (UUID.test(value)) return CHANGED;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
    return value === "" ? NONE : value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return NONE;
    if (value.every((item) => typeof item === "string" && UUID.test(item))) return `${value.length}개`;
    if (value.some((item) => isRecord(item) || Array.isArray(item))) return CHANGED;
    return value.map(formatPlain).join(", ");
  }
  return CHANGED;
}

function formatValue(field: string, value: unknown): string {
  if (LAST4_FIELDS.has(field)) return maskLast4(value);
  if (CHANGED_ONLY_FIELDS.has(field)) return value === null || value === undefined ? NONE : CHANGED;
  return formatPlain(value);
}

function settingLabel(key: string): string | undefined {
  return SETTING_DEFS.find((def) => def.key === key)?.label;
}

function labelFor(field: string, detail: Record<string, unknown>): string {
  if (field === "value" && typeof detail.key === "string") return settingLabel(detail.key) ?? detail.key;
  if (field === "allowed" && typeof detail.menu === "string") {
    const menu = MENUS.find((item) => item.key === detail.menu)?.label ?? detail.menu;
    const action = typeof detail.action === "string" ? (ACTION_WORDS[detail.action] ?? detail.action) : null;
    return action ? `${menu} ${action}` : menu;
  }
  if (field === "visible" && typeof detail.infoItem === "string") {
    return INFO_ITEMS.find((item) => item.key === detail.infoItem)?.label ?? detail.infoItem;
  }
  const own = CHANGE_FIELD_LABELS[field];
  if (own) return own;
  // 설정 가져오기의 이력형 칸 「키@적용 시작일」.
  const at = field.indexOf("@");
  if (at > 0) {
    const label = settingLabel(field.slice(0, at));
    if (label) return `${label} · ${field.slice(at + 1)}부터`;
  }
  return settingLabel(field) ?? field;
}

export function detailLines(detail: Record<string, unknown> | null | undefined): DetailLine[] | null {
  if (!detail || !isRecord(detail.changes)) return null;
  const lines: DetailLine[] = [];
  for (const [field, pair] of Object.entries(detail.changes)) {
    const values: unknown[] = Array.isArray(pair) ? pair : [null, pair];
    lines.push({ label: labelFor(field, detail), before: formatValue(field, values[0]), after: formatValue(field, values[1]) });
  }
  return lines.length > 0 ? lines : null;
}
