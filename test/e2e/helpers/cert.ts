import { createHash, randomBytes, randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { certEvents, certPrizes, certSubmissions } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { kstToday } from "@/lib/kst-date";
import { loadIntake, submitCertificate } from "@/domain/certs/intake";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED, CERT_LINK_EXPIRE_HOURS } from "@/domain/settings/keys";
import { insertEvent } from "@/repositories/cert-events";
import { insertPrizes } from "@/repositories/cert-prizes";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 규약 C4(04.3-02) — 확인증 E2E·통합 공용 도우미. Playwright 테스트
// 러너 패키지를 import하지 않는다(04.3-12 Vitest 통합 테스트도 이
// 파일을 import한다). 04.3-15 — 명단이 없어 행사는 경품 목록과 상태로 만든다
// (04.3-10 · 12 · 16 · 17이 고치지 않고 쓴다).

export const CERT_E2E_CONTACT_PHONE = "02-123-4567";

export type CertPrizeInput = {
  name?: string;
  unitValueKrw?: number;
  delivery?: "onsite" | "parcel";
  winnerCount?: number;
};

export type CreateCertEventOptions = {
  name?: string;
  wonOn?: string; // YYYY-MM-DD, 기본 오늘(KST) — 열리기 전 행사는 내일 날짜를 넘긴다(E8 b)
  status?: "requested" | "open" | "closed";
  prizes?: CertPrizeInput[];
  createdBy?: string | null;
};

export type CreateCertEventResult = {
  eventId: string;
  eventName: string;
  link?: string;
  token?: string;
  prizeIds: string[];
};

const DEFAULT_PRIZE: Required<CertPrizeInput> = {
  name: "갤럭시 탭 S10",
  unitValueKrw: 1_290_000,
  delivery: "onsite",
  winnerCount: 1,
};

function linkOf(token: string): string {
  return `${env.BETTER_AUTH_URL}/c/${token}`;
}

// 리포지토리(insertEvent · insertPrizes)로 행사를 만든다. 열린 · 닫힌 행사는 토큰 · 해시 · 암호문 ·
// 마감(지금 + 설정 시간) · QR 생성 시각을 채우고, 신청됨은 토큰 없이(경품 없음이 기본) 둔다.
// 이름 끝에 호출마다 다른 접미사를 붙여 겹치지 않게 한다.
export async function createCertEvent(opts: CreateCertEventOptions = {}): Promise<CreateCertEventResult> {
  await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, CERT_E2E_CONTACT_PHONE);
  const status = opts.status ?? "open";
  const eventName = `${opts.name ?? "확인증 테스트"}-${randomUUID().slice(0, 8)}`;
  const now = new Date();

  let token: string | undefined;
  let qr: { tokenHash: string; tokenEncrypted: string; expiresAt: Date; qrCreatedAt: Date } | null = null;
  if (status !== "requested") {
    token = randomBytes(32).toString("base64url");
    const hours = await getSettingValue(CERT_LINK_EXPIRE_HOURS);
    qr = {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenEncrypted: encrypt(token),
      expiresAt: new Date(now.getTime() + hours * 60 * 60 * 1000),
      qrCreatedAt: now,
    };
  }

  const event = await insertEvent(SYSTEM_VIEWER, {
    name: eventName,
    wonOn: opts.wonOn ?? kstToday(now),
    contactPhone: await getSettingValue(CERT_CONTACT_PHONE),
    createdBy: opts.createdBy ?? null,
    ...(qr ?? {}),
  });
  if (status === "closed") {
    await db.update(certEvents).set({ closedAt: now, closedReason: "manual" }).where(eq(certEvents.id, event.id));
  }

  const prizes = opts.prizes ?? (status === "requested" ? [] : [{}]);
  const rows = await insertPrizes(
    SYSTEM_VIEWER,
    prizes.map((p, i) => ({
      eventId: event.id,
      name: p.name ?? DEFAULT_PRIZE.name,
      unitValueKrw: p.unitValueKrw ?? DEFAULT_PRIZE.unitValueKrw,
      delivery: p.delivery ?? DEFAULT_PRIZE.delivery,
      winnerCount: p.winnerCount ?? DEFAULT_PRIZE.winnerCount,
      sortOrder: i,
    })),
  );

  return {
    eventId: event.id,
    eventName,
    ...(token ? { token, link: linkOf(token) } : {}),
    prizeIds: rows.map((r) => r.id),
  };
}

// 테스트 전용 — 관리 화면 저장(04.3-10) 없이 경품 1개 가액을 바로 바꾼다.
export async function setCertPrizeValueForTest(prizeId: string, unitValueKrw: number): Promise<void> {
  await db.update(certPrizes).set({ unitValueKrw, updatedAt: new Date() }).where(eq(certPrizes.id, prizeId));
}

// 테스트 전용 — 담당자가 닫은 것처럼(manual).
export async function closeCertEventForTest(eventId: string): Promise<void> {
  await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, eventId));
}

async function tokenOf(eventId: string): Promise<string> {
  const [row] = await db.select({ tokenEncrypted: certEvents.tokenEncrypted }).from(certEvents).where(eq(certEvents.id, eventId));
  if (!row?.tokenEncrypted) throw new Error("토큰이 없는 행사다(신청됨).");
  return decrypt(row.tokenEncrypted);
}

// 테스트 전용 — 같은 IP로 제출 count건(domain submitCertificate — IP 가명은 서버와 같은 certIpHash).
// 속도 제한을 실제로 일으키는 데 쓴다(04.3-16 E2E · 04.3-15 Task 2 몰림 케이스).
export async function seedIpSubmissionsForTest(
  eventId: string,
  opts: { ip: string; count: number; prizeId?: string },
): Promise<void> {
  const token = await tokenOf(eventId);
  const intake = await loadIntake(token);
  if (intake.kind !== "open") throw new Error(`seedIpSubmissionsForTest: 열린 행사가 아니다(${intake.kind})`);
  const prizeId = opts.prizeId ?? intake.prizes[0]?.id;
  if (!prizeId) throw new Error("seedIpSubmissionsForTest: 목록에 오른 경품이 없다");
  for (let i = 0; i < opts.count; i++) {
    const result = await submitCertificate(
      token,
      {
        prizeId,
        idempotencyKey: randomUUID(),
        consentVersion: intake.terms.consentVersion,
        retentionYears: intake.terms.retentionYears,
        name: "김하늘",
        rrnFront6: "930412",
        rrnBack7: "2123458",
        phone: "010-4821-7730",
        address: "서울시 강남구 테헤란로 1",
        consent: true,
        signaturePngBase64: signaturePngFixture().toString("base64"),
        rrnRecheckConfirmed: true,
      },
      opts.ip,
    );
    if (result.kind !== "saved") throw new Error(`seedIpSubmissionsForTest: ${i + 1}번째 제출이 ${result.kind}`);
  }
}

// 테스트 전용 — 가장 이른 count건의 submitted_at을 minutes분 앞으로(창 밖으로) 민다.
export async function ageSubmissionsForTest(eventId: string, opts: { count: number; minutes: number }): Promise<void> {
  const earliest = await db
    .select({ id: certSubmissions.id })
    .from(certSubmissions)
    .where(eq(certSubmissions.eventId, eventId))
    .orderBy(asc(certSubmissions.submittedAt))
    .limit(opts.count);
  if (earliest.length === 0) return;
  await db
    .update(certSubmissions)
    .set({ submittedAt: sql`${certSubmissions.submittedAt} - make_interval(mins => ${opts.minutes})` })
    .where(
      inArray(
        certSubmissions.id,
        earliest.map((r) => r.id),
      ),
    );
}

// 기능을 끄고 fn을 돌린 뒤 되돌린다(끄기 전 값으로 복원 — finally).
export async function withCertFeatureOff<T>(fn: () => Promise<T>): Promise<T> {
  const before = await getSettingValue(CERT_ENABLED);
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, false);
  try {
    return await fn();
  } finally {
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, before);
  }
}

const SIGNATURE_WIDTH = 1040;
const SIGNATURE_HEIGHT = 400;
const SIGNATURE_STROKE_START = 500;
const SIGNATURE_STROKE_WIDTH = 3;

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

// E3-32 — 04.3-06 inspectSignaturePng·countInkPixels(288 이상)를 통과하는
// 고정 PNG. 1040×400 투명 바탕 + 세로 획 3px × 400px = 잉크 1,200픽셀.
// node:zlib(deflateSync·crc32)만 쓴다(새 의존성 없음).
export function signaturePngFixture(): Buffer {
  const rowBytes = 1 + SIGNATURE_WIDTH * 4;
  const raw = Buffer.alloc(SIGNATURE_HEIGHT * rowBytes);
  for (let y = 0; y < SIGNATURE_HEIGHT; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // 필터 없음
    for (let x = 0; x < SIGNATURE_WIDTH; x++) {
      const pixelStart = rowStart + 1 + x * 4;
      const isInk = x >= SIGNATURE_STROKE_START && x < SIGNATURE_STROKE_START + SIGNATURE_STROKE_WIDTH;
      raw[pixelStart + 3] = isInk ? 255 : 0; // 나머지 RGB는 0(Buffer.alloc 기본값)
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIGNATURE_WIDTH, 0);
  ihdr.writeUInt32BE(SIGNATURE_HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0; // interlace 없음

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export type SeedSubmittedCertOptions = {
  delivery?: "onsite" | "parcel";
  name?: string;
  phone?: string;
  rrn?: string;
  address?: string;
  prizeName?: string;
  unitValueKrw?: number;
};

export type SeedSubmittedCertResult = {
  eventId: string;
  eventName: string;
  link: string;
  token: string;
  prizeId: string;
  submissionId: string;
  certNo: string;
  name: string;
  phone: string;
  rrnMasked: string;
};

// E3-32 — 경품 하나 행사 + domain(loadIntake → submitCertificate)으로 제출 표본 하나를 만든다.
// 폼을 조작하지 않아 화면 변경에 깨지지 않는다.
export async function seedSubmittedCert(opts: SeedSubmittedCertOptions = {}): Promise<SeedSubmittedCertResult> {
  const delivery = opts.delivery ?? "onsite";
  const name = opts.name ?? "김하늘";
  const phone = opts.phone ?? "010-4821-7730";
  const rrn = opts.rrn ?? "9304122123458";
  const address = opts.address ?? (delivery === "parcel" ? "서울시 강남구 테헤란로 1" : undefined);

  // 당첨일은 옛 표본과 같은 지난 날짜(늘 열림 — E8 b) — 인쇄 · I4 스펙이 이 값을 단언한다.
  const event = await createCertEvent({
    wonOn: "2026-01-01",
    prizes: [
      {
        name: opts.prizeName ?? DEFAULT_PRIZE.name,
        unitValueKrw: opts.unitValueKrw ?? DEFAULT_PRIZE.unitValueKrw,
        delivery,
      },
    ],
  });
  const { eventId, eventName, link, token } = event;
  const prizeId = event.prizeIds[0];
  if (!link || !token || !prizeId) throw new Error("seedSubmittedCert: 열린 행사를 만들지 못했다.");

  const intake = await loadIntake(token);
  if (intake.kind !== "open") throw new Error(`seedSubmittedCert loadIntake 실패: ${intake.kind}`);

  const submitted = await submitCertificate(
    token,
    {
      prizeId,
      idempotencyKey: randomUUID(),
      consentVersion: intake.terms.consentVersion,
      retentionYears: intake.terms.retentionYears,
      name,
      rrnFront6: rrn.slice(0, 6),
      rrnBack7: rrn.slice(6),
      phone,
      address,
      consent: true,
      signaturePngBase64: signaturePngFixture().toString("base64"),
      rrnRecheckConfirmed: true,
    },
    "203.0.113.9",
  );

  // 성공 판정은 결과 kind 이름이 아니라 행사 id로 읽은 제출 행이다.
  const [submissionRow] = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
  if (!submissionRow) throw new Error(`seedSubmittedCert: 제출 행을 찾지 못했다(${submitted.kind}).`);

  return {
    eventId,
    eventName,
    link,
    token,
    prizeId,
    submissionId: submissionRow.id,
    certNo: submissionRow.certNo,
    name,
    phone,
    rrnMasked: submissionRow.rrnMasked ?? "",
  };
}
