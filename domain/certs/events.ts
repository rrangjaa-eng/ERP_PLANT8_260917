import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { project, projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { withTransaction } from "@/lib/db-transaction";
import { isUniqueViolation } from "@/lib/pg-errors";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { kstDayStart, kstToday } from "@/lib/kst-date";
import { getSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_LINK_EXPIRE_HOURS } from "@/domain/settings/keys";
import { isCertFeatureEnabled } from "@/domain/certs/feature";
import { renderQrSvg } from "@/domain/certs/qr";
import { certPrizeListed, certRrnPurgeTarget } from "@/domain/certs/prize-value";
import { certLinkExpiresAt } from "@/domain/certs/link-window";
import { validatePrizeRows, type PrizeCellError, type PrizeRowInput } from "@/domain/certs/prize-rules";
import { isCalendarDate } from "@/domain/projects/period";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  findEventByCreateRequest,
  insertEvent,
  listEventSummaries,
  lockEventRow,
  setQrGenerated,
  type CertEventRow,
  type CertEventScope,
  type CertEventSummaryRow,
} from "@/repositories/cert-events";
import { applyPrizeRows, listPrizeSummaries, type CertPrizeSummaryRow, type PrizeRowValues } from "@/repositories/cert-prizes";
import { insertEventNotifications } from "@/repositories/notifications";
import { listActiveUserIdsAllowed } from "@/repositories/permissions";
import { findUserById } from "@/repositories/users";

const CERT_EVENTS_MENU = "certs.events";
const CERT_SUBMISSIONS_MENU = "certs.submissions";
// 04.3-10(5909578685) — QR 생성 · 경품 목록 편집. 판정은 이 메뉴 키 하나다(역할 이름을 코드에 두지 않는다).
const CERT_QR_MENU = "certs.qr";
const CREATE_REQUEST_UNIQUE = "cert_events_create_request_id_unique";
// ForbiddenError 문장 — 화면이 `저장 안 됨 · 권한 없음`(G10 a)으로 옮긴다.
export const CERT_FORBIDDEN_MESSAGE = "권한 없음";
// 행사 이름 최대 길이 — 04.3-10 「QR 생성 신청」(I′2) 이름 칸 · 인쇄 E2E가 쓴다.
export const CERT_EVENT_NAME_MAX = 80;

function linkOf(token: string): string {
  return `${env.BETTER_AUTH_URL}/c/${token}`;
}

function createdByOf(viewer: Viewer): string | null {
  return viewer.id === "system" ? null : viewer.id;
}

// 「QR 생성 신청」(I′2) · 「QR 생성」(I′3) 막힘 판정 재료 — 문의 전화가 비었는지 · 설정 화면을 열 수 있는지 ·
// 계산 줄(열림 · 마감)의 설정 시간.
export async function getCreateGate(
  viewer: Viewer,
): Promise<{ contactMissing: boolean; canOpenSettings: boolean; linkExpireHours: number }> {
  const [contactPhone, canOpenSettings, linkExpireHours] = await Promise.all([
    getSettingValue(CERT_CONTACT_PHONE),
    defaultCan(viewer, "admin.settings", "view"),
    getSettingValue(CERT_LINK_EXPIRE_HOURS),
  ]);
  return { contactMissing: contactPhone === "", canOpenSettings, linkExpireHours };
}

// ── 목록 · 상세 DTO ─────────────────────────────────────────────────────

// 04.3-15 — 상태 셋: 신청됨(토큰 없음 — QR 생성 전) · 접수 중 · 닫힘(담당자가 닫음 · 기한).
export type CertEventStatus = "requested" | "open" | "closed";
export type CertEventClosedReason = "manual" | "expired";

export type CertEventListDto = {
  id: string;
  name: string;
  wonOn: string;
  ownerName: string | null;
  submittedCount: number;
  status: CertEventStatus;
  closedReason: CertEventClosedReason | null;
  closedAt: string | null;
  closerName: string | null;
  // 04.3-10(UD-1 b) — 파생 표시 `접수 전`: QR이 있고 지금 < 당첨일 00:00 KST. 저장 상태(status)는 그대로 open.
  beforeOpen: boolean;
};

// 04.3-10 — I′3 경품 줄. 가액 · 수량별 제출 수 · 파기 대상 수는 certs.qr 쓰기 ∧ cert_prize.value인 사람의 DTO에만
// 싣는다(키 자체가 없다 — N7 a · E12). locked = 제출(대조 제외 포함)이 있어 경품명 · 전달을 못 고치고 지울 수 없다(N5 a).
export type CertPrizeDto = {
  id: string;
  name: string;
  delivery: "onsite" | "parcel";
  winnerCount: number;
  submittedCount: number;
  locked: boolean;
  version: number;
  unitValueKrw: number;
  quantityCounts: Array<{ quantity: number; count: number }>;
  purgeTargetCount: number;
};

export type CertEventDetailDto = CertEventListDto & {
  expiresAt: string | null;
  link: string;
  qrSvg: string;
  requestedAt: string;
  canManagePrizes: boolean;
  prizes: Partial<CertPrizeDto>[];
};

const EVENT_ITEM = "cert_event.value";
const PRIZE_VALUE_ITEM = "cert_prize.value";

const LIST_FIELDS = [
  "id",
  "name",
  "wonOn",
  "ownerName",
  "submittedCount",
  "status",
  "closedReason",
  "closedAt",
  "closerName",
  "beforeOpen",
] as const satisfies ReadonlyArray<keyof CertEventListDto>;

export const CERT_EVENT_LIST_DTO_SPEC: DtoSpec<CertEventListDto, CertEventListDto> = {
  fields: LIST_FIELDS.map((key) => ({ key, from: key, infoItem: EVENT_ITEM })),
};

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  "expiresAt",
  "link",
  "qrSvg",
  "requestedAt",
  "canManagePrizes",
  "prizes",
] as const satisfies ReadonlyArray<keyof CertEventDetailDto>;

export const CERT_EVENT_DETAIL_DTO_SPEC: DtoSpec<CertEventDetailDto, CertEventDetailDto> = {
  fields: DETAIL_FIELDS.map((key) => ({ key, from: key, infoItem: EVENT_ITEM })),
};

const PRIZE_EVENT_FIELDS = ["id", "name", "delivery", "winnerCount", "submittedCount", "locked", "version"] as const;
const PRIZE_VALUE_FIELDS = ["unitValueKrw", "quantityCounts", "purgeTargetCount"] as const;

// 가액 세 키는 cert_prize.value(staffDefault false)에 등록한다 — 다른 액션 · 내보내기가 이 DTO를 재사용해도 누수 스캔이
// 잡는다(E12). 나머지는 행사 칸(cert_event.value).
export const CERT_PRIZE_DTO_SPEC: DtoSpec<CertPrizeDto, CertPrizeDto> = {
  fields: [
    ...PRIZE_EVENT_FIELDS.map((key) => ({ key, from: key, infoItem: EVENT_ITEM })),
    ...PRIZE_VALUE_FIELDS.map((key) => ({ key, from: key, infoItem: PRIZE_VALUE_ITEM })),
  ],
};

for (const [name, spec] of [
  ["CertEventListDto", CERT_EVENT_LIST_DTO_SPEC],
  ["CertEventDetailDto", CERT_EVENT_DETAIL_DTO_SPEC],
  ["CertPrizeDto", CERT_PRIZE_DTO_SPEC],
] as const) {
  registerDto({ name, fields: spec.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
}

// 범위: certs.events 보기가 없으면 notFound(권한 없음과 범위 밖이 같은 모양) ·
// certs.qr 쓰기 또는 certs.submissions 보기가 있으면 전부 · 아니면 자기가 만든 행사만. 「certs.qr 쓰기면 전부」는
// certs.events 보기 게이트 다음 줄이다 — 게이트 뜻을 넓히지 않는다(eng-review newflow E11).
async function scopeOf(viewer: Viewer): Promise<CertEventScope | null> {
  if (!(await isCertFeatureEnabled())) return null;
  if (!(await defaultCan(viewer, CERT_EVENTS_MENU, "view"))) return null;
  if (await defaultCan(viewer, CERT_QR_MENU, "write")) return {};
  if (await defaultCan(viewer, CERT_SUBMISSIONS_MENU, "view")) return {};
  return { createdBy: createdByOf(viewer) };
}

// 경품 편집 · QR 생성 · 가액 보기의 두 조건 — 화면(canManagePrizes)과 서버(generateQr · savePrizes)가 같다(E12).
async function canManagePrizesOf(viewer: Viewer): Promise<boolean> {
  return (await defaultCan(viewer, CERT_QR_MENU, "write")) && (await defaultVisible(viewer, PRIZE_VALUE_ITEM));
}

// 토큰이 없으면 신청됨, 닫힌 시각이 있거나 마감이 지났으면 닫힘(마감이 NULL이면 기한으로 닫히지 않는다 —
// 공개 쪽 resolveEventState와 같은 규칙), 그 밖은 접수 중.
function toListDto(row: CertEventSummaryRow, now: Date): CertEventListDto {
  const expired = row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime();
  let status: CertEventStatus = "open";
  if (row.tokenEncrypted === null) status = "requested";
  else if (row.closedAt || expired) status = "closed";
  let closedReason: CertEventClosedReason | null = null;
  if (status === "closed") closedReason = row.closedAt ? "manual" : "expired";
  const closedAt = status === "closed" ? (row.closedAt ?? row.expiresAt) : null;
  return {
    id: row.id,
    name: row.name,
    wonOn: row.wonOn,
    ownerName: row.ownerName,
    submittedCount: row.submittedCount,
    status,
    closedReason,
    closedAt: closedAt ? closedAt.toISOString() : null,
    closerName: closedReason === "manual" ? row.closerName : null,
    beforeOpen: status === "open" && now.getTime() < kstDayStart(row.wonOn).getTime(),
  };
}

// 신청됨 → 접수 전 → 접수 중 → 닫힘(UD-1 b — 그룹 넷), 그룹 안 당첨일 내림차순(같으면 이름).
function groupRank(event: CertEventListDto): number {
  if (event.status === "requested") return 0;
  if (event.status === "closed") return 3;
  return event.beforeOpen ? 1 : 2;
}

function byListOrder(a: CertEventListDto, b: CertEventListDto): number {
  if (groupRank(a) !== groupRank(b)) return groupRank(a) - groupRank(b);
  return b.wonOn.localeCompare(a.wonOn) || a.name.localeCompare(b.name, "ko");
}

export async function listEvents(
  viewer: Viewer,
  now: Date = new Date(),
): Promise<{ kind: "ok"; events: Partial<CertEventListDto>[] } | { kind: "notFound" }> {
  const scope = await scopeOf(viewer);
  if (!scope) return { kind: "notFound" };
  const rows = await listEventSummaries(viewer, scope);
  const dtos = rows.map((row) => toListDto(row, now)).sort(byListOrder);
  return { kind: "ok", events: await projectMany(viewer, dtos, CERT_EVENT_LIST_DTO_SPEC) };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getEventDetail(
  viewer: Viewer,
  eventId: string,
  now: Date = new Date(),
): Promise<{ kind: "ok"; event: Partial<CertEventDetailDto> } | { kind: "notFound" }> {
  if (!UUID_PATTERN.test(eventId)) return { kind: "notFound" };
  const scope = await scopeOf(viewer);
  if (!scope) return { kind: "notFound" };
  const [row] = await listEventSummaries(viewer, scope, eventId);
  if (!row) return { kind: "notFound" };

  const head = toListDto(row, now);
  const canManagePrizes = await canManagePrizesOf(viewer);
  const detail: Omit<CertEventDetailDto, "link" | "qrSvg"> & Partial<Pick<CertEventDetailDto, "link" | "qrSvg">> = {
    ...head,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    requestedAt: row.createdAt.toISOString(),
    canManagePrizes,
    prizes: await prizeDtos(viewer, await listPrizeSummaries(viewer, eventId), canManagePrizes),
  };
  // 접수 중에만 link · qrSvg를 싣는다 — 닫힌 행사(T-04.3-12a — 닫힌 QR이 다시 퍼지지 않게) · 신청됨(QR 없음)에는
  // 키 자체가 없다.
  if (head.status === "open" && row.tokenEncrypted) {
    const link = linkOf(decrypt(row.tokenEncrypted));
    detail.link = link;
    detail.qrSvg = await renderQrSvg(link);
  }
  return { kind: "ok", event: await project(viewer, detail as CertEventDetailDto, CERT_EVENT_DETAIL_DTO_SPEC) };
}

// 경품 줄 DTO — 가액 세 키는 경영관리(canManagePrizes)일 때만 만들고, 투영이 cert_prize.value로 한 번 더 거른다.
async function prizeDtos(viewer: Viewer, rows: CertPrizeSummaryRow[], canManagePrizes: boolean): Promise<Partial<CertPrizeDto>[]> {
  const dtos = rows.map((row) => {
    const base = {
      id: row.id,
      name: row.name,
      delivery: row.delivery === "parcel" ? ("parcel" as const) : ("onsite" as const),
      winnerCount: row.winnerCount,
      submittedCount: row.submittedCount,
      locked: row.locked,
      version: row.version,
    };
    if (!canManagePrizes) return base;
    const purgeTargetCount = row.quantityCounts
      .filter((q) => certRrnPurgeTarget(row.unitValueKrw, q.quantity))
      .reduce((sum, q) => sum + q.count, 0);
    return { ...base, unitValueKrw: row.unitValueKrw, quantityCounts: row.quantityCounts, purgeTargetCount };
  });
  // 가액 키가 없는 줄도 같은 spec으로 투영한다 — project는 원본에 없는 키를 건너뛴다.
  return projectMany(viewer, dtos as CertPrizeDto[], CERT_PRIZE_DTO_SPEC);
}

// ── 「QR 생성 신청」(I′2 — N1 a) ─────────────────────────────────────────

const requestQrSchema = z.object({
  name: z.string(),
  wonOn: z.string(),
  requestId: z.string().uuid(),
});

export type RequestQrInput = z.input<typeof requestQrSchema>;
export type RequestQrFieldErrors = { name?: "required" | "tooLong"; wonOn?: "required" | "format" | "past" };
export type RequestQrResult =
  | { kind: "ok"; eventId: string }
  | { kind: "contactMissing" }
  | { kind: "invalid"; fieldErrors: RequestQrFieldErrors }
  | { kind: "notFound" };

export type CertEventDeps = { now: () => Date; recordAction: typeof defaultRecordAction };

const QR_REQUEST_RECIPIENTS = [
  { menu: CERT_QR_MENU, action: "write" },
  { menu: CERT_EVENTS_MENU, action: "view" },
] as const;

// 게이트 → certs.events 쓰기 → 같은 요청 키면 그 행사 → 칸 오류(화면 막힘과 같은 판정 — UD-4 a) → 문의 전화 →
// 설정 · 신청자 이름 · 받는 사람을 트랜잭션 전에 읽고(E27) → 행사(신청됨 — 토큰 · 마감 없음) + 받는 사람마다 알림 한
// 트랜잭션 → 커밋 뒤 document_create.
export async function requestQr(viewer: Viewer, input: RequestQrInput, deps?: Partial<CertEventDeps>): Promise<RequestQrResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (!(await defaultCan(viewer, CERT_EVENTS_MENU, "write"))) throw new ForbiddenError(CERT_FORBIDDEN_MESSAGE);

  const parsed = requestQrSchema.parse(input);
  const createdBy = createdByOf(viewer);
  const existing = await findEventByCreateRequest(viewer, { requestId: parsed.requestId, createdBy });
  if (existing) return { kind: "ok", eventId: existing.id };

  const now = deps?.now?.() ?? new Date();
  const name = parsed.name.normalize("NFC").trim();
  const fieldErrors: RequestQrFieldErrors = {};
  if (name === "") fieldErrors.name = "required";
  else if (name.length > CERT_EVENT_NAME_MAX) fieldErrors.name = "tooLong";
  if (parsed.wonOn === "") fieldErrors.wonOn = "required";
  else if (!isCalendarDate(parsed.wonOn)) fieldErrors.wonOn = "format";
  else if (parsed.wonOn < kstToday(now)) fieldErrors.wonOn = "past";
  if (fieldErrors.name || fieldErrors.wonOn) return { kind: "invalid", fieldErrors };

  const contactPhone = await getSettingValue(CERT_CONTACT_PHONE);
  if (contactPhone === "") return { kind: "contactMissing" };
  const requester = createdBy ? await findUserById(viewer, createdBy) : null;
  const recipients = (await listActiveUserIdsAllowed(viewer, QR_REQUEST_RECIPIENTS, undefined, [PRIZE_VALUE_ITEM])).filter(
    (id) => id !== createdBy,
  );
  const message = `QR 생성 신청 · ${name} · ${parsed.wonOn} · ${requester?.name ?? "—"}`;

  let eventId: string;
  try {
    eventId = await withTransaction(async (tx) => {
      const row = await insertEvent(
        viewer,
        { name, wonOn: parsed.wonOn, contactPhone, createdBy, createRequestId: parsed.requestId },
        tx,
      );
      await insertEventNotifications(
        viewer,
        recipients.map((recipientId) => ({
          conditionKind: "cert_qr_request",
          entity: "cert_event",
          entityId: row.id,
          recipientId,
          round: 1,
          referenceDate: kstToday(now),
          message,
        })),
        tx,
      );
      return row.id;
    });
  } catch (error) {
    // 같은 요청 키 동시 둘 — 이 트랜잭션은 되돌려졌다. 먼저 만든 행사를 돌려준다(없으면 다른 사람의 키 — 던진다).
    if (isUniqueViolation(error, CREATE_REQUEST_UNIQUE)) {
      const raced = await findEventByCreateRequest(viewer, { requestId: parsed.requestId, createdBy });
      if (raced) return { kind: "ok", eventId: raced.id };
    }
    throw error;
  }

  // 받는 사람 0명 — 신청은 그대로 성공(목록 신청됨 그룹), 운영이 알 수 있게 경고 한 줄(E22).
  if (recipients.length === 0) log.warn("cert.qr_request_no_recipient", { eventId });
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "cert_event", entityId: eventId });
  return { kind: "ok", eventId };
}

// ── 경품 줄 적용(generateQr · savePrizes 공용) ────────────────────────────

const amountInput = z.union([z.string(), z.number()]);
// 한 번에 보내는 줄 상한 — 잠근 tx 안에서 도는 줄 수를 막는다(독립 검토 W6).
const PRIZE_CHANGES_MAX = 500;

export const prizeChangesSchema = z
  .object({
    updates: z
      .array(
        z.object({
          id: z.string().uuid(),
          version: z.number().int(),
          name: z.string().optional(),
          unitValue: amountInput.optional(),
          delivery: z.string().optional(),
          winnerCount: amountInput.optional(),
        }),
      )
      .max(PRIZE_CHANGES_MAX)
      .optional(),
    inserts: z
      .array(
        z.object({
          key: z.string().min(1).max(64),
          name: z.string(),
          unitValue: amountInput,
          delivery: z.string(),
          winnerCount: amountInput.optional(),
        }),
      )
      .max(PRIZE_CHANGES_MAX)
      .optional(),
    deletes: z.array(z.object({ id: z.string().uuid(), version: z.number().int() })).max(PRIZE_CHANGES_MAX).optional(),
  })
  // 같은 줄 id가 고치기 ∪ 지우기에 두 번이면 입력 오류 — 둘째 쓰기가 0행이 되어 500이 나지 않게(W6).
  .superRefine((changes, ctx) => {
    const ids = [...(changes.updates ?? []), ...(changes.deletes ?? [])].map((row) => row.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate prize id" });
  });

export type PrizeChanges = z.input<typeof prizeChangesSchema>;

type ApplyResult =
  | { kind: "ok"; rows: Array<{ unitValueKrw: number }>; counts: { updated: number; inserted: number; deleted: number } }
  | { kind: "invalid"; cellErrors: PrizeCellError[] }
  | { kind: "readOnly" }
  | PrizeRowsInTx;

// 잠근 트랜잭션은 원시 줄(summaries)만 돌려준다 — 권한 투영(projectMany는 전역 풀로 노출표를 읽는다)은 커밋 · 롤백
// 뒤(ARCHITECTURE §4-8(3) · 플랜 E27, 독립 검토 W1).
type PrizeRowsInTx = { kind: "conflict"; summaries: CertPrizeSummaryRow[] };

function sameValues(row: CertPrizeSummaryRow, values: PrizeRowValues): boolean {
  return (
    row.name === values.name &&
    row.unitValueKrw === values.unitValueKrw &&
    row.delivery === values.delivery &&
    row.winnerCount === values.winnerCount
  );
}

// 잠근 행사 행(호출자가 lockEventRow를 먼저 잡았다) · 저장된 줄 · 줄마다 제출로 셀 판정 → 읽기 전용 → 버전 → 적용 →
// 가액이 바뀐 줄 · 새 줄(from null) · 지운 줄(to null)마다 같은 tx로 끌 수 없는 cert_prize_value(E7 a · /cso NF-4).
// 경품명만 바뀐 줄은 0이다. 가액 숫자가 들어가는 로그는 이 종류뿐이다.
async function applyPrizeChanges(
  viewer: Viewer,
  event: CertEventRow,
  input: PrizeChanges,
  opts: { closed: boolean; tx: DbOrTx },
): Promise<ApplyResult> {
  const changes = prizeChangesSchema.parse(input);
  const saved = await listPrizeSummaries(viewer, event.id, opts.tx);
  const savedById = new Map(saved.map((row) => [row.id, row]));
  const updates = changes.updates ?? [];
  const inserts = changes.inserts ?? [];
  const deletes = changes.deletes ?? [];
  const updateById = new Map(updates.map((u) => [u.id, u]));
  const deleteIds = new Set(deletes.map((d) => d.id));

  const conflictIds = [...updates, ...deletes]
    .filter((target) => savedById.get(target.id)?.version !== target.version)
    .map((target) => target.id);

  const rows: PrizeRowInput[] = [
    ...saved
      .filter((row) => !deleteIds.has(row.id))
      .map((row) => {
        const patch = updateById.get(row.id);
        return {
          key: row.id,
          id: row.id,
          name: patch?.name ?? row.name,
          unitValue: patch?.unitValue ?? row.unitValueKrw,
          delivery: patch?.delivery ?? row.delivery,
          winnerCount: patch?.winnerCount ?? row.winnerCount,
        };
      }),
    ...inserts.map((row) => ({ ...row, winnerCount: row.winnerCount ?? 1 })),
  ];
  const checked = validatePrizeRows(rows, {
    saved: saved.map((row) => ({ id: row.id, name: row.name, delivery: row.delivery === "parcel" ? "parcel" : "onsite" })),
    lockedIds: saved.filter((row) => row.locked).map((row) => row.id),
    closed: opts.closed,
    deletedIds: [...deleteIds],
  });
  if (checked.kind !== "ok") return checked;
  if (conflictIds.length > 0) return { kind: "conflict", summaries: saved };

  const maxSort = saved.reduce((max, row) => Math.max(max, row.sortOrder), -1);
  const values = (row: { name: string; unitValueKrw: number; delivery: "onsite" | "parcel"; winnerCount: number }) => ({
    name: row.name,
    unitValueKrw: row.unitValueKrw,
    delivery: row.delivery,
    winnerCount: row.winnerCount,
  });
  const updateRows = checked.rows.flatMap((row) => {
    const before = row.id ? savedById.get(row.id) : undefined;
    if (!before || !updateById.has(before.id) || sameValues(before, values(row))) return [];
    return [{ id: before.id, version: before.version, values: values(row) }];
  });
  const insertRows = checked.rows.filter((row) => !row.id).map((row, i) => ({ ...values(row), sortOrder: maxSort + 1 + i }));
  const userId = createdByOf(viewer);
  const applied = await applyPrizeRows(
    viewer,
    event.id,
    { inserts: insertRows, updates: updateRows, deletes: deletes.map((d) => ({ id: d.id, version: d.version })) },
    userId,
    opts.tx,
  );

  const valueLogs = [
    ...applied.updated.flatMap((row) => {
      const from = savedById.get(row.id)?.unitValueKrw ?? null;
      return from === row.unitValueKrw ? [] : [{ row, from, to: row.unitValueKrw }];
    }),
    ...applied.inserted.map((row) => ({ row, from: null, to: row.unitValueKrw })),
    ...applied.deleted.map((row) => ({ row, from: row.unitValueKrw, to: null })),
  ];
  for (const entry of valueLogs) {
    await defaultRecordAction(
      viewer,
      {
        actionType: "cert_prize_value",
        entity: "cert_prize",
        entityId: entry.row.id,
        detail: { eventId: event.id, prizeId: entry.row.id, name: entry.row.name, from: entry.from, to: entry.to },
      },
      { tx: opts.tx },
    );
  }

  return {
    kind: "ok",
    rows: checked.rows,
    counts: { updated: applied.updated.length, inserted: applied.inserted.length, deleted: applied.deleted.length },
  };
}

// ── 「QR 생성」(I′3 신청됨 1차) ──────────────────────────────────────────

const generateQrSchema = z.object({ requestId: z.string().uuid(), changes: prizeChangesSchema });

export type GenerateQrInput = z.input<typeof generateQrSchema>;
export type GenerateQrResult =
  | { kind: "ok" }
  | { kind: "alreadyGenerated" }
  | { kind: "blocked"; reason: "contactMissing" | "noPrize" | "noListedPrize" }
  | { kind: "invalid"; cellErrors: PrizeCellError[] }
  | { kind: "readOnly" }
  | { kind: "conflict"; prizes: Partial<CertPrizeDto>[] }
  | { kind: "notFound" };

// 트랜잭션 콜백에서 이미 쓴 경품 줄을 되돌리며 결과를 밖으로 나른다(막힘 — 경품 없음 · 50,000 넘는 경품 없음).
class RollbackWith<T> extends Error {
  constructor(readonly result: T) {
    super("rollback");
  }
}

async function inScope(viewer: Viewer, eventId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(eventId)) return false;
  const scope = await scopeOf(viewer);
  if (!scope) return false;
  const [row] = await listEventSummaries(viewer, scope, eventId);
  return row !== undefined;
}

// 게이트 · 범위(notFound) → certs.qr 쓰기 ∧ cert_prize.value(E12 — 아니면 Forbidden) → 설정 · 문의 전화를 트랜잭션 전에
// (E27) → 트랜잭션: 행사 행 잠금 먼저(null이면 notFound — E13) → 이미 QR이면 같은 요청 키 ok · 다른 키 alreadyGenerated →
// 경품 줄 적용 → 막힘 둘(롤백) → 토큰 · 해시 · 암호문 · 마감(N15 a) · 문의 전화 재찍기(E28) → status_change → 신청자 알림.
export async function generateQr(
  viewer: Viewer,
  eventId: string,
  input: GenerateQrInput,
  deps?: Partial<CertEventDeps>,
): Promise<GenerateQrResult> {
  if (!(await inScope(viewer, eventId))) return { kind: "notFound" };
  if (!(await canManagePrizesOf(viewer))) throw new ForbiddenError(CERT_FORBIDDEN_MESSAGE);
  const parsed = generateQrSchema.parse(input);
  const now = deps?.now?.() ?? new Date();
  const [expireHours, contactPhone] = await Promise.all([
    getSettingValue(CERT_LINK_EXPIRE_HOURS),
    getSettingValue(CERT_CONTACT_PHONE),
  ]);
  if (contactPhone === "") return { kind: "blocked", reason: "contactMissing" };
  const by = createdByOf(viewer);
  const recordAction = deps?.recordAction ?? defaultRecordAction;

  type InTx = Exclude<GenerateQrResult, { kind: "conflict" }> | PrizeRowsInTx;
  let result: InTx;
  try {
    result = await withTransaction(async (tx): Promise<InTx> => {
      const locked = await lockEventRow(viewer, eventId, tx);
      if (!locked) return { kind: "notFound" };
      if (locked.tokenHash) return locked.qrRequestId === parsed.requestId ? { kind: "ok" } : { kind: "alreadyGenerated" };

      const applied = await applyPrizeChanges(viewer, locked, parsed.changes, { closed: false, tx });
      if (applied.kind !== "ok") return applied;
      if (applied.rows.length === 0) throw new RollbackWith<GenerateQrResult>({ kind: "blocked", reason: "noPrize" });
      if (!applied.rows.some((row) => certPrizeListed(row.unitValueKrw))) {
        throw new RollbackWith<GenerateQrResult>({ kind: "blocked", reason: "noListedPrize" });
      }

      const token = randomBytes(32).toString("base64url");
      await setQrGenerated(
        viewer,
        eventId,
        {
          tokenHash: createHash("sha256").update(token).digest("hex"),
          tokenEncrypted: encrypt(token),
          expiresAt: certLinkExpiresAt(locked.wonOn, now, expireHours),
          at: now,
          by,
          requestId: parsed.requestId,
          contactPhone,
        },
        tx,
      );
      await recordAction(
        viewer,
        { actionType: "status_change", entity: "cert_event", entityId: eventId, detail: { from: "requested", to: "open" } },
        { tx },
      );
      if (locked.createdBy && locked.createdBy !== by) {
        await insertEventNotifications(
          viewer,
          [
            {
              conditionKind: "cert_qr_created",
              entity: "cert_event",
              entityId: eventId,
              recipientId: locked.createdBy,
              round: 1,
              referenceDate: kstToday(now),
              message: `QR 생성 · ${locked.name}`,
            },
          ],
          tx,
        );
      }
      return { kind: "ok" };
    });
  } catch (error) {
    if (error instanceof RollbackWith) return error.result as GenerateQrResult;
    throw error;
  }
  if (result.kind !== "conflict") return result;
  return { kind: "conflict", prizes: await prizeDtos(viewer, result.summaries, true) };
}

// ── 경품 표 저장(I′3 「일괄 저장 Ctrl+S N」 · 신청됨 Ctrl+S) ─────────────────────────

const savePrizesSchema = z.object({ changes: prizeChangesSchema });

export type SavePrizesInput = z.input<typeof savePrizesSchema>;
export type SavePrizesResult =
  | { kind: "saved"; rows: number; prizes: Partial<CertPrizeDto>[] }
  | { kind: "invalid"; cellErrors: PrizeCellError[] }
  | { kind: "readOnly" }
  | { kind: "conflict"; prizes: Partial<CertPrizeDto>[] }
  | { kind: "notFound" };

// 게이트 · 범위(notFound) → certs.qr 쓰기 ∧ cert_prize.value(E12 — 아니면 Forbidden) → 트랜잭션: 행사 행 잠금 먼저(null이면
// notFound — E13 · 04.3-15 규약, 수령자 제출과 직렬화) → 경품 줄 적용(닫힌 행사면 가액 · 당첨 수만) → document_update(줄 수만 —
// 가액 숫자 없음). QR은 만들지 않는다(신청됨 Ctrl+S는 저장만). 결과의 가액은 새 DTO 줄(권한자)뿐이다.
export async function savePrizes(
  viewer: Viewer,
  eventId: string,
  input: SavePrizesInput,
  deps?: Partial<CertEventDeps>,
): Promise<SavePrizesResult> {
  if (!(await inScope(viewer, eventId))) return { kind: "notFound" };
  if (!(await canManagePrizesOf(viewer))) throw new ForbiddenError(CERT_FORBIDDEN_MESSAGE);
  const parsed = savePrizesSchema.parse(input);
  const now = deps?.now?.() ?? new Date();
  const recordAction = deps?.recordAction ?? defaultRecordAction;

  type InTx =
    | Exclude<SavePrizesResult, { kind: "saved" | "conflict" }>
    | PrizeRowsInTx
    | { kind: "saved"; rows: number; summaries: CertPrizeSummaryRow[] };
  const result = await withTransaction(async (tx): Promise<InTx> => {
    const locked = await lockEventRow(viewer, eventId, tx);
    if (!locked) return { kind: "notFound" };
    const closed = locked.closedAt !== null || (locked.expiresAt !== null && locked.expiresAt.getTime() <= now.getTime());
    const applied = await applyPrizeChanges(viewer, locked, parsed.changes, { closed, tx });
    if (applied.kind !== "ok") return applied;
    const rows = applied.counts.updated + applied.counts.inserted + applied.counts.deleted;
    if (rows > 0) {
      await recordAction(
        viewer,
        { actionType: "document_update", entity: "cert_event", entityId: eventId, detail: applied.counts },
        { tx },
      );
    }
    return { kind: "saved", rows, summaries: await listPrizeSummaries(viewer, eventId, tx) };
  });
  if (result.kind === "saved") return { kind: "saved", rows: result.rows, prizes: await prizeDtos(viewer, result.summaries, true) };
  if (result.kind === "conflict") return { kind: "conflict", prizes: await prizeDtos(viewer, result.summaries, true) };
  return result;
}
