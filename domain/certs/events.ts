import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE } from "@/domain/settings/keys";
import { isCertFeatureEnabled } from "@/domain/certs/feature";
import { renderQrSvg } from "@/domain/certs/qr";
import { listEventSummaries, type CertEventScope, type CertEventSummaryRow } from "@/repositories/cert-events";

const CERT_EVENTS_MENU = "certs.events";
const CERT_SUBMISSIONS_MENU = "certs.submissions";
// 행사 이름 최대 길이 — 04.3-10 「QR 생성 신청」(I′2) 이름 칸 · 인쇄 E2E가 쓴다.
export const CERT_EVENT_NAME_MAX = 80;

function linkOf(token: string): string {
  return `${env.BETTER_AUTH_URL}/c/${token}`;
}

function createdByOf(viewer: Viewer): string | null {
  return viewer.id === "system" ? null : viewer.id;
}

// 「QR 생성 신청」(04.3-10 I′2) 1차 막힘 판정 재료 — 문의 전화가 비었는지 · 설정 화면을 열 수 있는지.
export async function getCreateGate(viewer: Viewer): Promise<{ contactMissing: boolean; canOpenSettings: boolean }> {
  const [contactPhone, canOpenSettings] = await Promise.all([
    getSettingValue(CERT_CONTACT_PHONE),
    defaultCan(viewer, "admin.settings", "view"),
  ]);
  return { contactMissing: contactPhone === "", canOpenSettings };
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
};

export type CertEventDetailDto = CertEventListDto & {
  expiresAt: string | null;
  link: string;
  qrSvg: string;
};

const EVENT_ITEM = "cert_event.value";

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
] as const satisfies ReadonlyArray<keyof CertEventListDto>;

export const CERT_EVENT_LIST_DTO_SPEC: DtoSpec<CertEventListDto, CertEventListDto> = {
  fields: LIST_FIELDS.map((key) => ({ key, from: key, infoItem: EVENT_ITEM })),
};

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  "expiresAt",
  "link",
  "qrSvg",
] as const satisfies ReadonlyArray<keyof CertEventDetailDto>;

export const CERT_EVENT_DETAIL_DTO_SPEC: DtoSpec<CertEventDetailDto, CertEventDetailDto> = {
  fields: DETAIL_FIELDS.map((key) => ({ key, from: key, infoItem: EVENT_ITEM })),
};

for (const [name, spec] of [
  ["CertEventListDto", CERT_EVENT_LIST_DTO_SPEC],
  ["CertEventDetailDto", CERT_EVENT_DETAIL_DTO_SPEC],
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
  };
}

const STATUS_ORDER: Record<CertEventStatus, number> = { requested: 0, open: 1, closed: 2 };

// 신청됨 → 접수 중 → 닫힘, 그룹 안 당첨일 내림차순(같으면 이름).
function byListOrder(a: CertEventListDto, b: CertEventListDto): number {
  if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
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
  const detail: Omit<CertEventDetailDto, "link" | "qrSvg"> & Partial<Pick<CertEventDetailDto, "link" | "qrSvg">> = {
    ...head,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
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
