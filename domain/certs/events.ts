import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { withTransaction } from "@/lib/db-transaction";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { isUniqueViolation } from "@/lib/pg-errors";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_LINK_EXPIRE_HOURS } from "@/domain/settings/keys";
import { isCertFeatureEnabled } from "@/domain/certs/feature";
import { formatPhone, maskName, normalizeName } from "@/domain/certs/format";
import { publicShape } from "@/domain/certs/roster-display";
import { validateWinnerRows, type WinnerCellError } from "@/domain/certs/winner-rules";
import { isCalendarDate } from "@/domain/projects/period";
import { renderQrSvg } from "@/domain/certs/qr";
import {
  findEventByCreateRequest,
  insertEvent,
  listEventSummaries,
  type CertEventScope,
  type CertEventSummaryRow,
} from "@/repositories/cert-events";
import { insertWinners, listWinnersForIntake } from "@/repositories/cert-winners";

export class ForbiddenError extends UserFacingError {}

const CERT_EVENTS_MENU = "certs.events";
const CERT_SUBMISSIONS_MENU = "certs.submissions";
const CREATE_REQUEST_UNIQUE = "cert_events_create_request_id_unique";
export const CERT_EVENT_NAME_MAX = 80;
export const CERT_EVENT_MAX_WINNERS = 500;

// 04.3-04(E3-21 · E3-22) — zod는 줄 모양만 본다. 칸 내용(이름 · 전화 · 경품 ·
// 수량 · 전달 · 구별 표시 · 길이)은 validateWinnerRows가 셀 오류로 판정한다 —
// zod가 먼저 거부하면 serverError라 어느 칸인지 알 수 없다. 전달 · 수량은
// 화면 글자(현장 · "1")와 04.3-02 헬퍼 값(onsite · 1)을 둘 다 받는다.
const createEventInputSchema = z.object({
  name: z.string(),
  wonOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  requestId: z.string().uuid().optional(),
  winners: z
    .array(
      z.object({
        name: z.string(),
        phone: z.string(),
        distinguishLabel: z.string().optional(),
        prizeName: z.string(),
        quantity: z.union([z.string(), z.number()]),
        delivery: z.string(),
      }),
    )
    .max(CERT_EVENT_MAX_WINNERS),
});

export type CreateEventInput = z.input<typeof createEventInputSchema>;

export type CreateEventFieldErrors = { name?: "required" | "tooLong"; wonOn?: "required" | "format" };

// link는 행사가 열려 있을 때만 싣는다 — 닫힌(기한 지난) 행사의 재전송은 eventId만.
export type CreateEventResult =
  | { kind: "ok"; eventId: string; link?: string }
  | { kind: "contactMissing" }
  | { kind: "notFound" }
  | { kind: "invalid"; cellErrors: WinnerCellError[]; fieldErrors: CreateEventFieldErrors; noWinners?: true };

export type CreateEventDeps = { can: typeof defaultCan; recordAction: typeof defaultRecordAction };

function linkOf(token: string): string {
  return `${env.BETTER_AUTH_URL}/c/${token}`;
}

async function findByRequest(viewer: Viewer, requestId: string): Promise<{ kind: "ok"; eventId: string; link?: string } | null> {
  const row = await findEventByCreateRequest(viewer, { requestId, createdBy: createdByOf(viewer) });
  if (!row) return null;
  const open = row.closedAt === null && row.expiresAt.getTime() > Date.now();
  return open ? { kind: "ok", eventId: row.id, link: linkOf(decrypt(row.tokenEncrypted)) } : { kind: "ok", eventId: row.id };
}

function createdByOf(viewer: Viewer): string | null {
  return viewer.id === "system" ? null : viewer.id;
}

// 04.3-02 트레이서 + 04.3-04: 기능 게이트 · 셀 오류(전부 거부) · 멱등(requestId).
// 성공 반환은 행이 아니라 {eventId, link}다 — 개인정보를 싣지 않는다.
export async function createEvent(
  viewer: Viewer,
  input: CreateEventInput,
  deps?: Partial<CreateEventDeps>,
): Promise<CreateEventResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };

  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, CERT_EVENTS_MENU, "write"))) {
    throw new ForbiddenError("확인증 행사 등록 권한 없음");
  }

  const parsed = createEventInputSchema.parse(input);

  if (parsed.requestId) {
    const existing = await findByRequest(viewer, parsed.requestId);
    if (existing) return existing;
  }

  const name = parsed.name.normalize("NFC").trim();
  const fieldErrors: CreateEventFieldErrors = {};
  if (name === "") fieldErrors.name = "required";
  else if (name.length > CERT_EVENT_NAME_MAX) fieldErrors.name = "tooLong";
  if (parsed.wonOn === "") fieldErrors.wonOn = "required";
  else if (!isCalendarDate(parsed.wonOn)) fieldErrors.wonOn = "format";

  const checked = validateWinnerRows(parsed.winners.map((w, i) => ({ ...w, key: String(i) })));
  if (!checked.ok || Object.keys(fieldErrors).length > 0) {
    const cellErrors = checked.ok ? [] : checked.cellErrors;
    const noWinners = !checked.ok && checked.noWinners ? { noWinners: true as const } : {};
    return { kind: "invalid", cellErrors, fieldErrors, ...noWinners };
  }

  // 트랜잭션 기준 순서(E3-28) — 설정은 tx를 열기 전에 읽는다.
  const [contactPhoneSetting, linkExpireHours] = await Promise.all([
    getSettingValue(CERT_CONTACT_PHONE),
    getSettingValue(CERT_LINK_EXPIRE_HOURS),
  ]);
  if (contactPhoneSetting === "") return { kind: "contactMissing" };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const tokenEncrypted = encrypt(token);
  const expiresAt = new Date(Date.now() + linkExpireHours * 60 * 60 * 1000);

  let eventId: string;
  try {
    ({ eventId } = await withTransaction(async (tx) => {
      const eventRow = await insertEvent(
        viewer,
        {
          name,
          wonOn: parsed.wonOn,
          tokenHash,
          tokenEncrypted,
          expiresAt,
          contactPhone: contactPhoneSetting,
          createdBy: createdByOf(viewer),
          createRequestId: parsed.requestId ?? null,
        },
        tx,
      );

      await insertWinners(
        viewer,
        checked.rows.map((w, i) => ({
          eventId: eventRow.id,
          name: w.name,
          phone: w.phone,
          distinguishLabel: w.distinguishLabel,
          prizeName: w.prizeName,
          quantity: w.quantity,
          delivery: w.delivery,
          sortOrder: i,
        })),
        tx,
      );

      return { eventId: eventRow.id };
    }));
  } catch (error) {
    // 같은 requestId 동시 요청 — 이 트랜잭션은 되돌려졌다. 밖에서 다시 찾아
    // 먼저 만든 행사를 돌려준다(없으면 다른 사람의 같은 키 — 그대로 던진다).
    if (parsed.requestId && isUniqueViolation(error, CREATE_REQUEST_UNIQUE)) {
      const existing = await findByRequest(viewer, parsed.requestId);
      if (existing) return existing;
    }
    throw error;
  }

  // 이 트랜잭션은 행 잠금을 쥐지 않는다 — 커밋 뒤 기록이 가장 단순하다.
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "cert_event", entityId: eventId });

  return { kind: "ok", eventId, link: linkOf(token) };
}

// I2 1차 막힘 판정 재료 — 문의 전화가 비었는지 · 설정 화면을 열 수 있는지.
export async function getCreateGate(viewer: Viewer): Promise<{ contactMissing: boolean; canOpenSettings: boolean }> {
  const [contactPhone, canOpenSettings] = await Promise.all([
    getSettingValue(CERT_CONTACT_PHONE),
    defaultCan(viewer, "admin.settings", "view"),
  ]);
  return { contactMissing: contactPhone === "", canOpenSettings };
}

// ── 목록 · 상세 DTO ─────────────────────────────────────────────────────

export type CertEventStatus = "open" | "closed";
export type CertEventClosedReason = "manual" | "allSubmitted" | "expired";

export type CertEventListDto = {
  id: string;
  name: string;
  wonOn: string;
  ownerName: string | null;
  submittedCount: number;
  totalCount: number;
  status: CertEventStatus;
  closedReason: CertEventClosedReason | null;
  closedAt: string | null;
  closerName: string | null;
};

export type CertWinnerSubmitState =
  | { kind: "submitted"; at: string }
  | { kind: "pending" }
  | { kind: "shortLocked"; until: string }
  | { kind: "hardLocked" };

export type CertWinnerDto = {
  id: string;
  name: string;
  phone: string;
  recipientName: string;
  recipientSecondLine: string | null;
  prizeName: string;
  quantity: number;
  delivery: "onsite" | "parcel";
  distinguishLabel: string | null;
  submit: CertWinnerSubmitState;
  version: number;
};

export type CertEventDetailDto = CertEventListDto & {
  expiresAt: string;
  link: string;
  qrSvg: string;
  winners: Partial<CertWinnerDto>[];
};

const EVENT_ITEM = "cert_event.value";
const WINNER_ITEM = "cert_winner.value";

const LIST_FIELDS = [
  "id",
  "name",
  "wonOn",
  "ownerName",
  "submittedCount",
  "totalCount",
  "status",
  "closedReason",
  "closedAt",
  "closerName",
] as const satisfies ReadonlyArray<keyof CertEventListDto>;

export const CERT_EVENT_LIST_DTO_SPEC: DtoSpec<CertEventListDto, CertEventListDto> = {
  fields: LIST_FIELDS.map((key) => ({ key, from: key, infoItem: EVENT_ITEM })),
};

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  "expiresAt",
  "link",
  "qrSvg",
  "winners",
] as const satisfies ReadonlyArray<keyof CertEventDetailDto>;

export const CERT_EVENT_DETAIL_DTO_SPEC: DtoSpec<CertEventDetailDto, CertEventDetailDto> = {
  fields: DETAIL_FIELDS.map((key) => ({ key, from: key, infoItem: EVENT_ITEM })),
};

// 이름 · 전화와 그것에서 계산한 가린 이름은 cert_winner.value, 나머지는 행사 칸.
export const CERT_WINNER_DTO_SPEC: DtoSpec<CertWinnerDto, CertWinnerDto> = {
  fields: [
    { key: "id", from: "id", infoItem: EVENT_ITEM },
    { key: "name", from: "name", infoItem: WINNER_ITEM },
    { key: "phone", from: "phone", infoItem: WINNER_ITEM },
    { key: "recipientName", from: "recipientName", infoItem: WINNER_ITEM },
    { key: "recipientSecondLine", from: "recipientSecondLine", infoItem: WINNER_ITEM },
    { key: "prizeName", from: "prizeName", infoItem: EVENT_ITEM },
    { key: "quantity", from: "quantity", infoItem: EVENT_ITEM },
    { key: "delivery", from: "delivery", infoItem: EVENT_ITEM },
    { key: "distinguishLabel", from: "distinguishLabel", infoItem: EVENT_ITEM },
    { key: "submit", from: "submit", infoItem: EVENT_ITEM },
    { key: "version", from: "version", infoItem: EVENT_ITEM },
  ],
};

for (const [name, spec] of [
  ["CertEventListDto", CERT_EVENT_LIST_DTO_SPEC],
  ["CertEventDetailDto", CERT_EVENT_DETAIL_DTO_SPEC],
  ["CertWinnerDto", CERT_WINNER_DTO_SPEC],
] as const) {
  registerDto({ name, fields: spec.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
}

// 범위: certs.events 보기가 없으면 notFound(권한 없음과 범위 밖이 같은 모양) ·
// certs.submissions 보기가 있으면 전부 · 아니면 자기가 만든 행사만.
async function scopeOf(viewer: Viewer): Promise<CertEventScope | null> {
  if (!(await isCertFeatureEnabled())) return null;
  if (!(await defaultCan(viewer, CERT_EVENTS_MENU, "view"))) return null;
  if (await defaultCan(viewer, CERT_SUBMISSIONS_MENU, "view")) return {};
  return { createdBy: createdByOf(viewer) };
}

function toListDto(row: CertEventSummaryRow, now: Date): CertEventListDto {
  const expired = row.expiresAt.getTime() <= now.getTime();
  const status: CertEventStatus = row.closedAt || expired ? "closed" : "open";
  let closedReason: CertEventClosedReason | null = null;
  if (row.closedAt) closedReason = row.closedReason === "all_submitted" ? "allSubmitted" : "manual";
  else if (expired) closedReason = "expired";
  const closedAt = row.closedAt ?? (expired ? row.expiresAt : null);
  return {
    id: row.id,
    name: row.name,
    wonOn: row.wonOn,
    ownerName: row.ownerName,
    submittedCount: row.submittedCount,
    totalCount: row.totalCount,
    status,
    closedReason,
    closedAt: closedAt ? closedAt.toISOString() : null,
    closerName: closedReason === "manual" ? row.closerName : null,
  };
}

// 접수 중 → 닫힘, 그룹 안 당첨일 내림차순(같으면 이름).
function byListOrder(a: CertEventListDto, b: CertEventListDto): number {
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
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
  const winnerRows = await listWinnersForIntake(viewer, eventId);
  const display = winnerRows.map((w) => ({
    id: w.id,
    name: w.name,
    prizeName: w.prizeName,
    quantity: w.quantity,
    distinguishLabel: w.distinguishLabel,
    sortOrder: w.sortOrder,
  }));
  const maskedCounts = new Map<string, number>();
  for (const w of display) {
    if (w.name === null) continue;
    const masked = maskName(normalizeName(w.name));
    maskedCounts.set(masked, (maskedCounts.get(masked) ?? 0) + 1);
  }

  const winners: CertWinnerDto[] = winnerRows.map((w, i) => {
    const shape = publicShape(display[i]!, w.name !== null && (maskedCounts.get(maskName(normalizeName(w.name))) ?? 0) > 1);
    let submit: CertWinnerSubmitState = { kind: "pending" };
    if (w.submittedAt) submit = { kind: "submitted", at: w.submittedAt.toISOString() };
    else if (head.status === "open" && w.hardLockedAt) submit = { kind: "hardLocked" };
    else if (head.status === "open" && w.lockedUntil && w.lockedUntil.getTime() > now.getTime()) {
      submit = { kind: "shortLocked", until: w.lockedUntil.toISOString() };
    }
    return {
      id: w.id,
      name: w.name ?? "",
      phone: w.phone ? formatPhone(w.phone) : "",
      recipientName: shape.maskedName,
      recipientSecondLine: shape.secondLine ?? null,
      prizeName: w.prizeName,
      quantity: w.quantity,
      delivery: w.delivery === "parcel" ? "parcel" : "onsite",
      distinguishLabel: w.distinguishLabel,
      submit,
      version: w.version,
    };
  });

  const detail: Omit<CertEventDetailDto, "link" | "qrSvg"> & Partial<Pick<CertEventDetailDto, "link" | "qrSvg">> = {
    ...head,
    expiresAt: row.expiresAt.toISOString(),
    winners: await projectMany(viewer, winners, CERT_WINNER_DTO_SPEC),
  };
  // 닫힌 행사에는 link · qrSvg 키 자체가 없다(T-04.3-12a — 닫힌 QR이 다시 퍼지지 않게).
  if (head.status === "open") {
    const link = linkOf(decrypt(row.tokenEncrypted));
    detail.link = link;
    detail.qrSvg = await renderQrSvg(link);
  }
  return { kind: "ok", event: await project(viewer, detail as CertEventDetailDto, CERT_EVENT_DETAIL_DTO_SPEC) };
}
