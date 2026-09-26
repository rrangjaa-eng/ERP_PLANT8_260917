import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { withTransaction } from "@/lib/db-transaction";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_LINK_EXPIRE_HOURS } from "@/domain/settings/keys";
import { normalizeName, normalizePhone } from "@/domain/certs/format";
import { insertEvent } from "@/repositories/cert-events";
import { insertWinners } from "@/repositories/cert-winners";

export class ForbiddenError extends UserFacingError {}

const CERT_EVENTS_MENU = "certs.events";

const createEventInputSchema = z.object({
  name: z.string().min(1).max(80),
  wonOn: z.string().min(1), // YYYY-MM-DD
  winners: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        phone: z.string().refine((v) => normalizePhone(v) !== null, "휴대전화 형식이 아닙니다"),
        distinguishLabel: z.string().max(10).optional(),
        prizeName: z.string().min(1).max(80),
        quantity: z.coerce.number().int().min(1),
        delivery: z.enum(["onsite", "parcel"]),
      }),
    )
    .min(1),
});

export type CreateEventInput = z.infer<typeof createEventInputSchema>;

export type CreateEventResult =
  | { kind: "ok"; eventId: string; link: string }
  | { kind: "contactMissing" };

export type CreateEventDeps = { can: typeof defaultCan; recordAction: typeof defaultRecordAction };

// 04.3-02 Task 2 ⑧ — 행사 만들기 트레이서. 겹침·구별 표시 검사(04.3-04)와
// 멱등(create_request_id, 04.3-04)은 이 플랜 몫이 아니다.
export async function createEvent(
  viewer: Viewer,
  input: CreateEventInput,
  deps?: Partial<CreateEventDeps>,
): Promise<CreateEventResult> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, CERT_EVENTS_MENU, "write"))) {
    throw new ForbiddenError("확인증 행사 등록 권한이 없습니다.");
  }

  const parsed = createEventInputSchema.parse(input);

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

  const { eventId } = await withTransaction(async (tx) => {
    const eventRow = await insertEvent(
      viewer,
      {
        name: parsed.name,
        wonOn: parsed.wonOn,
        tokenHash,
        tokenEncrypted,
        expiresAt,
        contactPhone: contactPhoneSetting,
        createdBy: viewer.id === "system" ? null : viewer.id,
      },
      tx,
    );

    await insertWinners(
      viewer,
      parsed.winners.map((w, i) => ({
        eventId: eventRow.id,
        name: normalizeName(w.name),
        phone: normalizePhone(w.phone)!,
        distinguishLabel: w.distinguishLabel ?? null,
        prizeName: w.prizeName,
        quantity: w.quantity,
        delivery: w.delivery,
        sortOrder: i,
      })),
      tx,
    );

    return { eventId: eventRow.id };
  });

  // 이 트랜잭션은 행 잠금을 쥐지 않는다 — 커밋 뒤 기록이 가장 단순하다.
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "cert_event", entityId: eventId });

  const link = `${env.BETTER_AUTH_URL}/c/${token}`;
  return { kind: "ok", eventId, link };
}
