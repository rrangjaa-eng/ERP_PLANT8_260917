import { randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { createEvent } from "@/domain/certs/events";
import { normalizePhone } from "@/domain/certs/format";
import { selectWinner, submitCertificate, verifyLast4 } from "@/domain/certs/intake";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { findSubmissionByWinnerId } from "@/repositories/cert-submissions";
import { listWinnersForIntake } from "@/repositories/cert-winners";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 규약 C4(04.3-02) — 확인증 E2E·통합 공용 도우미. Playwright 테스트
// 러너 패키지를 import하지 않는다(04.3-12 Vitest 통합 테스트도 이
// 파일을 import한다).

export const CERT_E2E_CONTACT_PHONE = "02-123-4567";

export type CreateCertEventWinnerInput = {
  name: string;
  phone: string;
  distinguishLabel?: string;
  prizeName?: string;
  quantity?: number;
  delivery?: "onsite" | "parcel";
};

export type CreateCertEventResult = { eventId: string; eventName: string; link: string; token: string };

// 이름 끝에 호출마다 다른 접미사를 붙여 겹치지 않게 한다(Playwright testId
// 앞자리가 파일 해시로 고정돼 그 용도로 못 쓴다).
export async function createCertEvent(opts: {
  winners: CreateCertEventWinnerInput[];
  name?: string;
  wonOn?: string;
}): Promise<CreateCertEventResult> {
  await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, CERT_E2E_CONTACT_PHONE);

  const eventName = `${opts.name ?? "확인증 테스트"}-${randomUUID().slice(0, 8)}`;
  const result = await createEvent(SYSTEM_VIEWER, {
    name: eventName,
    wonOn: opts.wonOn ?? "2026-01-01",
    winners: opts.winners.map((w) => ({
      name: w.name,
      phone: w.phone,
      distinguishLabel: w.distinguishLabel,
      prizeName: w.prizeName ?? "갤럭시 탭 S10",
      quantity: w.quantity ?? 1,
      delivery: w.delivery ?? "onsite",
    })),
  });

  if (result.kind !== "ok") throw new Error(`createCertEvent 실패: ${result.kind}`);

  const token = result.link.split("/c/").pop();
  if (!token) throw new Error("createCertEvent: 링크에서 토큰을 찾지 못했습니다.");

  return { eventId: result.eventId, eventName, link: result.link, token };
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
  prize?: string;
  quantity?: number;
  extraWinners?: CreateCertEventWinnerInput[];
};

export type SeedSubmittedCertResult = {
  eventId: string;
  eventName: string;
  link: string;
  token: string;
  winnerId: string;
  submissionId: string;
  certNo: string;
  name: string;
  phone: string;
  rrnMasked: string;
  extraWinnerIds: string[];
};

// E3-32 — domain(createEvent → selectWinner → verifyLast4 →
// submitCertificate)을 직접 불러 제출 표본 하나를 만든다. E4 폼을
// 조작하지 않아 04.3-06의 폼 변경에 깨지지 않는다.
export async function seedSubmittedCert(opts: SeedSubmittedCertOptions = {}): Promise<SeedSubmittedCertResult> {
  const delivery = opts.delivery ?? "onsite";
  const name = opts.name ?? "김하늘";
  const phone = opts.phone ?? "010-4821-7730";
  const rrn = opts.rrn ?? "9304122123458";
  const prize = opts.prize ?? "갤럭시 탭 S10";
  const quantity = opts.quantity ?? 1;
  const address = opts.address ?? (delivery === "parcel" ? "서울시 강남구 테헤란로 1" : undefined);

  const winners: CreateCertEventWinnerInput[] = [
    { name, phone, prizeName: prize, quantity, delivery },
    ...(opts.extraWinners ?? []),
  ];

  const { eventId, eventName, link, token } = await createCertEvent({ winners });

  const rows = await listWinnersForIntake(SYSTEM_VIEWER, eventId);
  const winnerRow = rows.find((r) => r.name === name);
  if (!winnerRow) throw new Error("seedSubmittedCert: 방금 만든 당첨자를 찾지 못했다.");
  const winnerId = winnerRow.id;
  const extraWinnerIds = rows.filter((r) => r.id !== winnerId).map((r) => r.id);

  const selected = await selectWinner(token, winnerId);
  if (selected.kind !== "ok") throw new Error(`seedSubmittedCert selectWinner 실패: ${selected.kind}`);

  const last4 = normalizePhone(phone)!.slice(-4);
  const verified = await verifyLast4(token, winnerId, last4, randomUUID(), null);
  if (verified.kind !== "ok") throw new Error(`seedSubmittedCert verifyLast4 실패: ${verified.kind}`);

  const submitted = await submitCertificate(token, {
    rowId: winnerId,
    proof: verified.proof,
    name,
    rrnFront6: rrn.slice(0, 6),
    rrnBack7: rrn.slice(6),
    phone,
    address,
    consent: true,
    signaturePngBase64: signaturePngFixture().toString("base64"),
    idempotencyKey: randomUUID(),
    consentVersion: verified.consent.version,
    retentionYears: verified.consent.retentionYears,
    rrnRecheckConfirmed: true,
  });
  if (submitted.kind !== "submitted") throw new Error(`seedSubmittedCert submitCertificate 실패: ${submitted.kind}`);

  const submissionRow = await findSubmissionByWinnerId(SYSTEM_VIEWER, winnerId);
  if (!submissionRow) throw new Error("seedSubmittedCert: 제출 행을 찾지 못했다.");

  return {
    eventId,
    eventName,
    link,
    token,
    winnerId,
    submissionId: submissionRow.id,
    certNo: submissionRow.certNo,
    name,
    phone,
    rrnMasked: submissionRow.rrnMasked ?? "",
    extraWinnerIds,
  };
}
