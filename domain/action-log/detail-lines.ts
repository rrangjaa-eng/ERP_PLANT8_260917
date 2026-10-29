import { MENUS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { SETTING_DEFS } from "@/domain/settings/keys";

// 07-25 K16 · SC-08: 행동 로그 `detail.changes = {칸: [이전, 이후]}`(쓰는 쪽 07-04 `buildChanges`)를
// 사람이 읽는 줄로 바꾼다. 바뀐 칸 전부를 돌려주고 자르지 않는다 — 자르기는 표 칸(detail-cell) 몫.
export type DetailLine = { label: string; before: string; after: string };

const CHANGED = "바뀜";
const NONE = "없음";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 계급 id(`role-sysadmin` · `role-<uuid>`) — 이름 풀이는 DB 조회가 필요해 뒤 결정. 지금은 UUID와 같이 바뀜 · 개수로 줄인다.
const ROLE_ID = /^role-/;

function isInternalId(value: unknown): boolean {
  return typeof value === "string" && (UUID.test(value) || ROLE_ID.test(value));
}

// 범위 라벨 — 계급 화면(app/(app)/admin/people/roles/roles-client.tsx)의 VIEW_SCOPE_LABEL · WORK_SCOPE_LABEL과 같은 글자.
// 그 표는 클라이언트 파일에 있어 domain이 가져올 수 없으므로 같은 값을 둔다(계급 화면 라벨을 바꾸면 여기도).
const SCOPE_LABELS: Record<string, Record<string, string>> = {
  workScope: { team: "자기 팀", company: "전사" },
  viewScope: { company: "전사", org_unit: "본부", team: "팀", own: "본인" },
  // 07.1-13: 견적 줄 상태 — 견적 표(app/(app)/projects/[id]/quote-table.tsx)의 LINE_STATUS_LABELS와 같은 글자(같은 까닭으로 같은 값을 둔다).
  lineStatus: { not_started: "미착수", cancelled: "취소" },
};

// 칸 이름 표 — 설정 키는 레지스트리 라벨, 권한 칸은 메뉴 라벨 + 동작 낱말을 쓰므로 여기엔 나머지가 든다.
export const CHANGE_FIELD_LABELS: Record<string, string> = {
  value: "값",
  allowed: "허용",
  visible: "노출",
  name: "이름",
  workScope: "업무 범위",
  viewScope: "보는 범위",
  roleId: "계급",
  // 07.1-14(E-P2-41): 사람 본부 칸 — 쓰는 쪽이 id가 아니라 본부 이름 글자를 담는다.
  division: "본부",
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
  usedOn: "사용일",
  cardLast4: "카드",
  totalKrw: "결제 합계",
  supplyKrw: "공급가",
  vatKrw: "부가세",
  approvalNo: "승인번호",
  hireDate: "입사일",
  resignationDate: "퇴직일",
  preEstimate: "사전 견적",
};

// 07.1-13 S8(E-P2-40): detail.lineChanges 원소의 줄 종류별 제목과 칸 이름 — 견적 줄은 domain/quotes/lines.ts CELL_LABELS,
// 발행 · 입금 줄은 매출 표(app/(app)/projects/[id]/revenue-section.tsx) 열 이름과 같은 글자. 줄 안 칸 순서는 이 선언 순서.
export const LINE_CHANGE_LABELS: Record<string, { title: string; fields: Record<string, string> }> = {
  quote: {
    title: "견적 줄",
    fields: {
      subcategory: "소분류",
      itemName: "항목",
      vendorId: "거래처",
      quantity: "수량",
      unitPrice: "단가",
      execution: "실행가",
      lineStatus: "상태",
      note: "비고",
    },
  },
  issue: { title: "발행 줄", fields: { entryDate: "발행일", amount: "발행액", note: "메모" } },
  payment: { title: "입금 줄", fields: { entryDate: "입금일", amount: "입금액", note: "메모" } },
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
    if (isInternalId(value)) return CHANGED;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
    return value === "" ? NONE : value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return NONE;
    if (value.every(isInternalId)) return `${value.length}개`;
    if (value.some((item) => isRecord(item) || Array.isArray(item))) return CHANGED;
    return value.map(formatPlain).join(", ");
  }
  return CHANGED;
}

function formatValue(field: string, value: unknown): string {
  if (LAST4_FIELDS.has(field)) return maskLast4(value);
  if (CHANGED_ONLY_FIELDS.has(field)) return value === null || value === undefined ? NONE : CHANGED;
  const scopeLabel = typeof value === "string" ? SCOPE_LABELS[field]?.[value] : undefined;
  return scopeLabel ?? formatPlain(value);
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

// 줄 순서(07-25 DOM 감사 P2-3 · 오케스트레이터 결정, SC-08 계약 공백 메움 — 되돌릴 수 있음): jsonb는 키를 길이 · 사전 순으로
// 저장해 Object.entries 순서가 쓰는 쪽이 넣은 순서와 무관하다. 그래서 칸 이름 표(CHANGE_FIELD_LABELS)가 선언된 순서(= 폼 순서)를
// 먼저, 표에 없는 키는 그 뒤에 키 사전 순으로 놓아 「앞 3줄」 · 폰 접힌 줄 첫 줄이 늘 같게 한다.
const FIELD_ORDER = new Map(Object.keys(CHANGE_FIELD_LABELS).map((key, index) => [key, index]));

function compareFields(a: string, b: string): number {
  const rankA = FIELD_ORDER.get(a);
  const rankB = FIELD_ORDER.get(b);
  if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
  if (rankA !== undefined) return -1;
  if (rankB !== undefined) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// changes 없이 다른 모양으로 남은 기존 기록(지급 취소 · 증빙 면제 · 거래처 계좌 변경 · 업무 중 거래처 등록)의 대체 줄.
// 이전 값이 없는 단일 값은 「없음 → 값」으로 같은 DetailLine 모양을 쓴다. 내부 id · 알 수 없는 키는 싣지 않는다.
const FALLBACK_KEYS: Array<[key: string, label: string]> = [
  ["reason", "사유"],
  ["payDate", "지급일"],
  ["transferKrw", "이체 금액"],
  ["payableKrw", "지급 금액"],
];
const SOURCE_LABELS: Record<string, string> = { admin: "관리자 화면", workplace: "업무 중 등록" };

// 대체 줄은 이 종류에만 쓴다 — 그 밖의 종류는 reason 같은 키가 내부 코드값(excluded · manual 등)이라 줄로 만들면 영문이 그대로 보인다.
export type DetailKind = { actionType: string | null | undefined; entity?: string | null | undefined };
const FALLBACK_ACTION_TYPES = new Set(["payment_cancel", "payment_process", "evidence_waive", "vendor_account_change", "work_vendor_create"]);

function hasFallback(kind: DetailKind | undefined, detail: Record<string, unknown>): boolean {
  if (!kind?.actionType) return false;
  if (FALLBACK_ACTION_TYPES.has(kind.actionType)) return true;
  // 업무 중 거래처 등록은 document_create + entity vendor + source workplace로 남는다.
  return kind.actionType === "document_create" && kind.entity === "vendor" && detail.source === "workplace";
}

function fallbackLines(detail: Record<string, unknown>): DetailLine[] | null {
  const lines: DetailLine[] = [];
  for (const [key, label] of FALLBACK_KEYS) {
    if (detail[key] === undefined || detail[key] === null) continue;
    const after = formatPlain(detail[key]);
    if (after !== NONE) lines.push({ label, before: NONE, after });
  }
  if ("beforeLast4" in detail || "afterLast4" in detail) {
    const before = maskLast4(detail.beforeLast4);
    const after = maskLast4(detail.afterLast4);
    if (before !== NONE || after !== NONE) lines.push({ label: "계좌번호", before, after });
  }
  if (typeof detail.source === "string") lines.push({ label: "출처", before: NONE, after: SOURCE_LABELS[detail.source] ?? detail.source });
  return lines.length > 0 ? lines : null;
}

// 07.1-13 S8: 줄 원소 하나를 `{제목} {순번} {항목명} {칸}` 라벨 줄들로. 모르는 종류 · 모르는 칸은 줄을 만들지 않는다(영문 키 노출 금지).
function lineChangeLines(lineChanges: unknown): DetailLine[] {
  if (!Array.isArray(lineChanges)) return [];
  const lines: DetailLine[] = [];
  for (const element of lineChanges) {
    if (!isRecord(element) || typeof element.kind !== "string" || !isRecord(element.changes)) continue;
    const labels = LINE_CHANGE_LABELS[element.kind];
    if (!labels) continue;
    const prefix = [labels.title, typeof element.no === "number" ? String(element.no) : "", typeof element.name === "string" ? element.name : ""]
      .filter((part) => part !== "")
      .join(" ");
    for (const [field, fieldLabel] of Object.entries(labels.fields)) {
      if (!(field in element.changes)) continue;
      const pair = element.changes[field];
      const values: unknown[] = Array.isArray(pair) ? pair : [null, pair];
      const before = formatValue(field, values[0]);
      const after = formatValue(field, values[1]);
      if (before === NONE && after === NONE) continue;
      lines.push({ label: `${prefix} ${fieldLabel}`, before, after });
    }
  }
  return lines;
}

export function detailLines(detail: Record<string, unknown> | null | undefined, kind?: DetailKind): DetailLine[] | null {
  if (!detail) return null;
  const lines: DetailLine[] = [];
  if (isRecord(detail.changes)) {
    for (const [field, pair] of Object.entries(detail.changes).sort(([a], [b]) => compareFields(a, b))) {
      const values: unknown[] = Array.isArray(pair) ? pair : [null, pair];
      const before = formatValue(field, values[0]);
      const after = formatValue(field, values[1]);
      // 이전 · 이후가 둘 다 「없음」인 줄은 바뀐 것이 없다 — 표 칸 · 시트 · `외 N칸` 개수에서 함께 뺀다(DOM 감사 P3).
      if (before === NONE && after === NONE) continue;
      lines.push({ label: labelFor(field, detail), before, after });
    }
  }
  // 줄 전후(lineChanges)는 문서 칸(changes) 줄 뒤에 둔다. lineChanges 없는 기존 기록은 지금 결과 그대로다.
  lines.push(...lineChangeLines(detail.lineChanges));
  if (!isRecord(detail.changes) && lines.length === 0) return hasFallback(kind, detail) ? fallbackLines(detail) : null;
  return lines.length > 0 ? lines : null;
}
