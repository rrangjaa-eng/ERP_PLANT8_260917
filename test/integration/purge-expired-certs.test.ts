import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, certEvents, certPrizes, certSignatureUploads, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { certPurgeDeadline, runCertPurge } from "@/domain/certs/purge";
import { getSubmissionForReview, revealRrn } from "@/domain/certs/review";
import { withTransaction } from "@/lib/db-transaction";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import { appendActionLog } from "@/repositories/action-log";
import { clearSubmissionPersonalFields } from "@/repositories/cert-purge";
import { insertSignatureUploadIntent } from "@/repositories/cert-submissions";
import { setCertPrizeValueForTest, seedSubmittedCert, signaturePngFixture, withCertFeatureOff } from "@/test/e2e/helpers/cert";
import { FULL_GRANT, decryptSpy, makeReviewer, submissionRow } from "@/test/integration/cert-review-fixtures";

// 04.3-12 Task 1 — 확인증 파기(CERT-02): 기한 경계 · 행 보존 · IP 가명 · 파일 대기 재시도 · 멱등 · 미리 보기 ·
// 로그(한 트랜잭션) · 고아 서명(C3) · 파기 대상 주민등록번호(CS-2 a) · 전체 보기와의 직렬화(실제 Postgres).
// 표본은 seedSubmittedCert()로만 만든다(E3-32) — 제출 시각 · 보존 연수 · 가액 · 마감만 DB에서 직접 맞춘다.

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

const kst = (iso: string): Date => new Date(`${iso}+09:00`);
const FAR_FUTURE = new Date("2100-01-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

type SeedOptions = {
  submittedAt: Date;
  retentionYears?: number;
  quantity?: number;
  unitValueKrw?: number; // 제출 때 가액(목록에 오르려면 50,000 초과)
  valueNow?: number; // 제출 뒤 내린(또는 올린) 가액
  expiresAt?: Date;
  closedAt?: Date;
};

async function seed(options: SeedOptions) {
  const seeded = await seedSubmittedCert({ unitValueKrw: options.unitValueKrw ?? 1_290_000 });
  await db
    .update(certSubmissions)
    .set({
      submittedAt: options.submittedAt,
      retentionYears: options.retentionYears ?? 5,
      quantity: options.quantity ?? 1,
    })
    .where(eq(certSubmissions.id, seeded.submissionId));
  await db
    .update(certEvents)
    .set({ expiresAt: options.expiresAt ?? FAR_FUTURE, closedAt: options.closedAt ?? null })
    .where(eq(certEvents.id, seeded.eventId));
  if (options.valueNow !== undefined) await setCertPrizeValueForTest(seeded.prizeId, options.valueNow);
  const row = await submissionRow(seeded.submissionId);
  return { ...seeded, row };
}

async function rowCounts() {
  return {
    events: (await db.select().from(certEvents)).length,
    prizes: (await db.select().from(certPrizes)).length,
    submissions: (await db.select().from(certSubmissions)).length,
  };
}

async function purgeLogs() {
  return db.select().from(actionLog).where(eq(actionLog.actionType, "cert_purge"));
}

function failingDeleteStore(): { store: SignatureStore; deleteCalls: number } {
  const real = getSignatureStore();
  const spy = {
    deleteCalls: 0,
    store: {
      put: (key, png) => real.put(key, png),
      get: (key) => real.get(key),
      delete: () => {
        spy.deleteCalls += 1;
        return Promise.reject(new Error("저장소 삭제 실패(주입)"));
      },
    } satisfies SignatureStore,
  };
  return spy;
}

function countingStore(): { store: SignatureStore; deleteCalls: number } {
  const real = getSignatureStore();
  const spy = {
    deleteCalls: 0,
    store: {
      put: (key, png) => real.put(key, png),
      get: (key) => real.get(key),
      delete: (key) => {
        spy.deleteCalls += 1;
        return real.delete(key);
      },
    } satisfies SignatureStore,
  };
  return spy;
}

describe("기한 경계 — 제출 KST 연도 + 1 + 보존 연수의 4월 1일 00:00 KST", () => {
  it("기한 1ms 전에는 그대로 · 기한 정각에는 비워지고 행과 세무 칸은 남는다", async () => {
    const submittedAt = kst("2020-06-01T10:00:00");
    const sample = await seed({ submittedAt });
    const deadline = certPurgeDeadline(submittedAt, 5);
    expect(deadline.getTime()).toBe(kst("2026-04-01T00:00:00").getTime());
    const before = await rowCounts();

    const early = await runCertPurge({ now: new Date(deadline.getTime() - 1), apply: true });
    expect(early.submissions).toBe(0);
    expect(await submissionRow(sample.submissionId)).toEqual(sample.row);

    const result = await runCertPurge({ now: deadline, apply: true });
    expect(result.submissions).toBe(1);

    const after = await submissionRow(sample.submissionId);
    for (const field of ["name", "rrnEncrypted", "rrnMasked", "phone", "address", "submitIpHash"] as const) {
      expect(after[field], field).toBeNull();
    }
    expect(after.purgedAt?.getTime()).toBe(deadline.getTime());
    expect(after.certNo).toBe(sample.row.certNo);
    expect(after.eventId).toBe(sample.row.eventId);
    expect(after.prizeId).toBe(sample.row.prizeId);
    expect(after.quantity).toBe(sample.row.quantity);
    expect(after.submittedAt.getTime()).toBe(sample.row.submittedAt.getTime());
    expect(await rowCounts()).toEqual(before);
  });

  it("KST 연도 경계 — 2020-12-31 23:30 KST 제출은 2026-04-01에 비워지고 2021-01-01 00:10 KST 제출은 남는다", async () => {
    const lastOfYear = await seed({ submittedAt: new Date("2020-12-31T14:30:00Z") });
    const firstOfYear = await seed({ submittedAt: new Date("2020-12-31T15:10:00Z") });

    const result = await runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true });

    expect(result.submissions).toBe(1);
    expect((await submissionRow(lastOfYear.submissionId)).purgedAt).not.toBeNull();
    expect((await submissionRow(firstOfYear.submissionId)).purgedAt).toBeNull();
    expect((await submissionRow(firstOfYear.submissionId)).name).toBe(firstOfYear.row.name);
  });

  it("보존 연수는 확인증에 저장된 값이다 — 설정을 나중에 7로 바꿔도 이미 제출된 확인증의 기한은 그대로다", async () => {
    const early = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    expect(early.row.retentionYears).toBe(5);

    await setSettingValue(SYSTEM_VIEWER, CERT_RETENTION_YEARS, 7);
    const later = await seedSubmittedCert();
    const laterRow = await submissionRow(later.submissionId);
    expect(laterRow.retentionYears).toBe(7);
    await db
      .update(certSubmissions)
      .set({ submittedAt: kst("2020-06-01T10:00:00") })
      .where(eq(certSubmissions.id, later.submissionId));

    const result = await runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true });

    expect(result.submissions).toBe(1);
    expect((await submissionRow(early.submissionId)).purgedAt).not.toBeNull();
    expect((await submissionRow(later.submissionId)).purgedAt).toBeNull();
  });

  it("보존 기한 파기는 가액을 보지 않는다 — 가액을 내린 제출의 이름 · 연락처 · 주소 · 서명은 기한 전에 남고 기한에 똑같이 비워진다", async () => {
    const lowered = await seed({
      submittedAt: kst("2020-06-01T10:00:00"),
      valueNow: 30_000,
    });
    const normal = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const deadline = certPurgeDeadline(kst("2020-06-01T10:00:00"), 5);

    await runCertPurge({ now: new Date(deadline.getTime() - 1), apply: true });
    const kept = await submissionRow(lowered.submissionId);
    expect(kept.name).toBe(lowered.row.name);
    expect(kept.phone).toBe(lowered.row.phone);
    expect(kept.address).toBe(lowered.row.address);
    expect(kept.signatureKey).toBe(lowered.row.signatureKey);
    expect(kept.purgedAt).toBeNull();

    await runCertPurge({ now: deadline, apply: true });
    for (const id of [lowered.submissionId, normal.submissionId]) {
      const row = await submissionRow(id);
      expect(row.name).toBeNull();
      expect(row.phone).toBeNull();
      expect(row.signatureKey).toBeNull();
      expect(row.purgedAt?.getTime()).toBe(deadline.getTime());
    }
  });
});

describe("파기 대상 주민등록번호 — CS-2 a(제출 연도 다음 해 4월 1일, 그 칸만)", () => {
  const SUBMITTED = kst("2025-06-01T10:00:00");
  const APRIL_1 = kst("2026-04-01T00:00:00");

  async function seedCases() {
    const target = await seed({ submittedAt: SUBMITTED, valueNow: 30_000 });
    const above = await seed({ submittedAt: SUBMITTED, unitValueKrw: 50_001 });
    const aboveMultiple = await seed({ submittedAt: SUBMITTED, quantity: 2, valueNow: 25_001 });
    const atMultiple = await seed({ submittedAt: SUBMITTED, quantity: 2, valueNow: 25_000 });
    const raisedBack = await seed({ submittedAt: SUBMITTED, valueNow: 30_000 });
    await setCertPrizeValueForTest(raisedBack.prizeId, 73_519);
    const excluded = await seed({ submittedAt: SUBMITTED, valueNow: 30_000 });
    await db
      .update(certSubmissions)
      .set({ rrnEncrypted: null, rrnMasked: null, excludedAt: new Date("2025-07-01T00:00:00Z") })
      .where(eq(certSubmissions.id, excluded.submissionId));
    return { target, above, aboveMultiple, atMultiple, raisedBack, excluded };
  }

  it("기한 1ms 전에는 비우지 않고 기한 정각에는 주민등록번호 칸만 비운다(가액 × 수량 · 실행 시점 가액)", async () => {
    const c = await seedCases();

    const early = await runCertPurge({ now: new Date(APRIL_1.getTime() - 1), apply: true });
    expect(early.rrnCleared).toBe(0);
    expect(await submissionRow(c.target.submissionId)).toEqual(c.target.row);

    const result = await runCertPurge({ now: APRIL_1, apply: true });
    expect(result.rrnCleared).toBe(2);
    expect(result.submissions).toBe(0);

    for (const hit of [c.target, c.atMultiple]) {
      const row = await submissionRow(hit.submissionId);
      expect(row.rrnEncrypted).toBeNull();
      expect(row.rrnMasked).toBeNull();
      expect(row.version).toBe(hit.row.version + 1);
      expect(row.name).toBe(hit.row.name);
      expect(row.phone).toBe(hit.row.phone);
      expect(row.address).toBe(hit.row.address);
      expect(row.signatureKey).toBe(hit.row.signatureKey);
      expect(row.submitIpHash).toBe(hit.row.submitIpHash);
      expect(row.purgedAt).toBeNull();
      expect(row.certNo).toBe(hit.row.certNo);
      expect(row.prizeId).toBe(hit.row.prizeId);
      expect(row.quantity).toBe(hit.row.quantity);
    }
    for (const kept of [c.above, c.aboveMultiple, c.raisedBack]) {
      expect(await submissionRow(kept.submissionId)).toEqual(kept.row);
    }

    const logs = await purgeLogs();
    expect(logs.map((log) => log.detail)).toEqual([
      { submissions: 0, filesQueued: 0, rrnCleared: 0 },
      { submissions: 0, filesQueued: 0, rrnCleared: 2 },
    ]);
  });

  it("두 번째 적용은 0이고 미리 보기는 수만 세며 쓰기가 없고 대조 제외 줄은 세지 않는다", async () => {
    const c = await seedCases();

    const preview = await runCertPurge({ now: APRIL_1, apply: false });
    expect(preview.rrnCleared).toBe(2);
    expect(await submissionRow(c.target.submissionId)).toEqual(c.target.row);
    expect(await purgeLogs()).toHaveLength(0);

    expect((await runCertPurge({ now: APRIL_1, apply: true })).rrnCleared).toBe(2);
    expect((await runCertPurge({ now: APRIL_1, apply: true })).rrnCleared).toBe(0);
  });

  it("비운 뒤 전체 보기는 복호화 없이 거부되고 보존 기한(2031-04-01)에 나머지 칸도 비워진다", async () => {
    const c = await seedCases();
    await runCertPurge({ now: APRIL_1, apply: true });
    const reviewer = await makeReviewer(FULL_GRANT);
    const spy = decryptSpy();

    expect(await revealRrn(reviewer, c.target.submissionId, { ip: null }, { decrypt: spy.fn })).toEqual({ kind: "denied" });
    expect(spy.calls).toBe(0);

    const retentionDeadline = kst("2031-04-01T00:00:00");
    const result = await runCertPurge({ now: retentionDeadline, apply: true });
    expect(result.rrnCleared).toBe(0);
    const row = await submissionRow(c.target.submissionId);
    expect(row.purgedAt?.getTime()).toBe(retentionDeadline.getTime());
    expect(row.name).toBeNull();
  });
});

describe("서명 파일 — DB 먼저 · 파일 나중, 실패분은 다음 실행이 지운다", () => {
  it("적용 뒤 저장소에 객체가 없고 signature_key가 비워진다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const key = sample.row.signatureKey;
    expect(key).not.toBeNull();
    expect(await getSignatureStore().get(key ?? "")).not.toBeNull();

    const result = await runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true });

    expect(result).toMatchObject({ submissions: 1, filesDeleted: 1, filesPending: 0 });
    expect(await getSignatureStore().get(key ?? "")).toBeNull();
    expect((await submissionRow(sample.submissionId)).signatureKey).toBeNull();
  });

  it("삭제 실패 — 칸은 비워지고 signature_key는 남고 filesPending 1 · 정상 저장소로 다시 실행하면 지워지고 새 파기 수는 0", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const key = sample.row.signatureKey ?? "";
    const now = kst("2026-04-01T00:00:00");

    const failed = await runCertPurge({ now, apply: true }, { signatureStore: failingDeleteStore().store });
    expect(failed).toMatchObject({ submissions: 1, filesDeleted: 0, filesPending: 1 });
    const pending = await submissionRow(sample.submissionId);
    expect(pending.name).toBeNull();
    expect(pending.purgedAt).not.toBeNull();
    expect(pending.signatureKey).toBe(key);
    expect(await getSignatureStore().get(key)).not.toBeNull();

    const retry = await runCertPurge({ now, apply: true });
    expect(retry).toMatchObject({ submissions: 0, filesDeleted: 1, filesPending: 0 });
    expect(await getSignatureStore().get(key)).toBeNull();
    expect((await submissionRow(sample.submissionId)).signatureKey).toBeNull();
  });

  it("이미 없는 객체는 지워진 것으로 친다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    await getSignatureStore().delete(sample.row.signatureKey ?? "");

    const result = await runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true });

    expect(result).toMatchObject({ filesDeleted: 1, filesPending: 0 });
    expect((await submissionRow(sample.submissionId)).signatureKey).toBeNull();
  });
});

describe("멱등 · 미리 보기 · 파기 뒤 화면 · 기능 플래그", () => {
  it("적용을 두 번 돌리면 두 번째 새 파기 수는 0이다", async () => {
    await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const now = kst("2026-04-01T00:00:00");

    expect((await runCertPurge({ now, apply: true })).submissions).toBe(1);
    expect(await runCertPurge({ now, apply: true })).toMatchObject({ submissions: 0, filesDeleted: 0 });
  });

  it("미리 보기는 대상 수만 돌려주고 DB · 저장소 · 행동 로그가 그대로다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const store = countingStore();

    const preview = await runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: false }, { signatureStore: store.store });

    expect(preview.submissions).toBe(1);
    expect(await submissionRow(sample.submissionId)).toEqual(sample.row);
    expect(await getSignatureStore().get(sample.row.signatureKey ?? "")).not.toBeNull();
    expect(store.deleteCalls).toBe(0);
    expect(await purgeLogs()).toHaveLength(0);
  });

  it("파기 뒤 경영관리 화면은 notFound이고 전체 보기는 복호화 없이 거부된다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const reviewer = await makeReviewer(FULL_GRANT);
    await runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true });
    const spy = decryptSpy();

    expect(await getSubmissionForReview(reviewer, sample.submissionId, { ip: null })).toEqual({ kind: "notFound" });
    expect(await revealRrn(reviewer, sample.submissionId, { ip: null }, { decrypt: spy.fn })).toEqual({ kind: "denied" });
    expect(spy.calls).toBe(0);
  });

  it("기능 플래그를 꺼도 파기가 돈다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });

    await withCertFeatureOff(() => runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true }));

    expect((await submissionRow(sample.submissionId)).purgedAt).not.toBeNull();
  });
});

describe("파기와 전체 보기 직렬화(codex #13)", () => {
  it("전체 보기가 행을 잠근 동안 파기는 기다렸다가 그 뒤에 칸을 비운다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const reviewer = await makeReviewer(FULL_GRANT);
    const spy = decryptSpy();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const enteredLog = new Promise<void>((resolve) => (entered = resolve));

    const reveal = revealRrn(reviewer, sample.submissionId, { ip: null }, {
      decrypt: spy.fn,
      appendActionLog: async (viewer, entry, tx) => {
        entered();
        await gate;
        return appendActionLog(viewer, entry, tx);
      },
    });
    await enteredLog;

    let purgeDone = false;
    const purge = runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true }).then((result) => {
      purgeDone = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(purgeDone).toBe(false);

    release();
    const revealed = await reveal;
    expect(revealed.kind).toBe("revealed");
    expect(spy.calls).toBe(1);
    await purge;
    expect((await submissionRow(sample.submissionId)).rrnEncrypted).toBeNull();

    expect(await revealRrn(reviewer, sample.submissionId, { ip: null }, { decrypt: spy.fn })).toEqual({ kind: "denied" });
    expect(spy.calls).toBe(1);
  });

  it("파기가 먼저 커밋되면 전체 보기는 복호화 호출 0번으로 거부된다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const reviewer = await makeReviewer(FULL_GRANT);
    const spy = decryptSpy();

    await runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true });

    expect(await revealRrn(reviewer, sample.submissionId, { ip: null }, { decrypt: spy.fn })).toEqual({ kind: "denied" });
    expect(spy.calls).toBe(0);
  });
});

describe("속도 제한 IP 가명 — E21", () => {
  it("마감이 2일 전에 지난 행사의 제출은 보존 기한 전이어도 IP 가명만 비운다(1일 안 · 열린 행사는 그대로)", async () => {
    const now = kst("2026-10-01T12:00:00");
    const submittedAt = new Date(now.getTime() - 3 * DAY);
    const closedTwoDays = await seed({ submittedAt, expiresAt: new Date(now.getTime() - 2 * DAY) });
    const closedHours = await seed({ submittedAt, expiresAt: new Date(now.getTime() - 12 * 60 * 60 * 1000) });
    const open = await seed({ submittedAt });
    const closedManually = await seed({ submittedAt, closedAt: new Date(now.getTime() - 2 * DAY) });
    expect(closedTwoDays.row.submitIpHash).not.toBeNull();

    const preview = await runCertPurge({ now, apply: false });
    expect(preview.ipCleared).toBe(2);
    expect((await submissionRow(closedTwoDays.submissionId)).submitIpHash).not.toBeNull();

    const result = await runCertPurge({ now, apply: true });

    expect(result.ipCleared).toBe(2);
    expect(result.submissions).toBe(0);
    for (const cleared of [closedTwoDays, closedManually]) {
      const row = await submissionRow(cleared.submissionId);
      expect(row.submitIpHash).toBeNull();
      expect(row.name).toBe(cleared.row.name);
      expect(row.rrnEncrypted).toBe(cleared.row.rrnEncrypted);
      expect(row.phone).toBe(cleared.row.phone);
      expect(row.purgedAt).toBeNull();
    }
    for (const kept of [closedHours, open]) {
      expect((await submissionRow(kept.submissionId)).submitIpHash).toBe(kept.row.submitIpHash);
    }
  });
});

describe("칸 비우기 함수 재사용 — mode: exclude (E1 b)", () => {
  it("주민 암호문 · 가린 값 · 연락처 · 주소 · IP 가명만 비우고 서명은 삭제 대기가 되어 다음 적용 실행이 지운다", async () => {
    const sample = await seed({ submittedAt: kst("2025-06-01T10:00:00") });
    const key = sample.row.signatureKey ?? "";
    const at = kst("2025-07-01T00:00:00");

    await withTransaction(async (tx) => {
      await clearSubmissionPersonalFields(SYSTEM_VIEWER, [sample.submissionId], { mode: "exclude", at }, tx);
    });
    await db.update(certSubmissions).set({ excludedAt: at }).where(eq(certSubmissions.id, sample.submissionId));

    const excluded = await submissionRow(sample.submissionId);
    for (const field of ["rrnEncrypted", "rrnMasked", "phone", "address", "submitIpHash"] as const) {
      expect(excluded[field], field).toBeNull();
    }
    expect(excluded.name).toBe(sample.row.name);
    expect(excluded.purgedAt).toBeNull();
    expect(excluded.signatureKey).toBe(key);
    expect(excluded.version).toBe(sample.row.version + 1);

    const next = await runCertPurge({ now: kst("2025-07-02T00:00:00"), apply: true });
    expect(next).toMatchObject({ submissions: 0, filesDeleted: 1, filesPending: 0 });
    expect(await getSignatureStore().get(key)).toBeNull();
    expect((await submissionRow(sample.submissionId)).signatureKey).toBeNull();

    const retentionDeadline = kst("2031-04-01T00:00:00");
    await runCertPurge({ now: retentionDeadline, apply: true });
    const purged = await submissionRow(sample.submissionId);
    expect(purged.name).toBeNull();
    expect(purged.purgedAt?.getTime()).toBe(retentionDeadline.getTime());
  });
});

describe("행동 로그 cert_purge — 비우기와 한 트랜잭션(C6)", () => {
  it("적용 실행 한 번 = 한 줄, detail은 개수 셋뿐 · 반환값은 여섯 · 개인정보가 로그에 없다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });

    const result = await runCertPurge({ now: kst("2026-04-01T00:00:00"), apply: true });

    expect(Object.keys(result).sort()).toEqual(
      ["filesDeleted", "filesPending", "ipCleared", "orphansDeleted", "rrnCleared", "submissions"].sort(),
    );
    const logs = await purgeLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ submissions: 1, filesQueued: 1, rrnCleared: 0 });
    expect(logs[0]?.actorId).toBeNull();
    const dump = JSON.stringify(logs);
    for (const secret of [sample.name, sample.phone, "9304122123458", "2123458", sample.row.signatureKey ?? "x"]) {
      expect(dump).not.toContain(secret);
    }
  });

  it("로그 쓰기가 실패하면 비우기가 되돌아가고 저장소 delete는 한 번도 불리지 않는다", async () => {
    const sample = await seed({ submittedAt: kst("2020-06-01T10:00:00") });
    const store = countingStore();

    await expect(
      runCertPurge(
        { now: kst("2026-04-01T00:00:00"), apply: true },
        {
          signatureStore: store.store,
          appendActionLog: () => Promise.reject(new Error("로그 쓰기 실패(주입)")),
        },
      ),
    ).rejects.toThrow("로그 쓰기 실패");

    expect(await submissionRow(sample.submissionId)).toEqual(sample.row);
    expect(store.deleteCalls).toBe(0);
  });
});

describe("고아 서명 — C3 업로드 의도(codex #12)", () => {
  async function seedIntake(hoursAgo: number, now: Date): Promise<string> {
    const key = `signatures/orphan-${randomUUID()}.png`;
    await getSignatureStore().put(key, signaturePngFixture());
    await insertSignatureUploadIntent(SYSTEM_VIEWER, key);
    await db
      .update(certSignatureUploads)
      .set({ createdAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000) })
      .where(eq(certSignatureUploads.objectKey, key));
    return key;
  }

  async function intakeKeys(): Promise<string[]> {
    return (await db.select().from(certSignatureUploads)).map((row) => row.objectKey);
  }

  it("25시간 전 의도만 객체와 행이 지워지고 23시간 전 의도는 그대로다", async () => {
    const now = new Date();
    const stale = await seedIntake(25, now);
    const fresh = await seedIntake(23, now);

    const result = await runCertPurge({ now, apply: true });

    expect(result.orphansDeleted).toBe(1);
    expect(await getSignatureStore().get(stale)).toBeNull();
    expect(await getSignatureStore().get(fresh)).not.toBeNull();
    expect(await intakeKeys()).toEqual([fresh]);
  });

  it("저장소 delete가 실패하면 의도 행이 남고 filesPending에 센다 — 다음 실행이 다시 지운다", async () => {
    const now = new Date();
    const stale = await seedIntake(25, now);

    const failed = await runCertPurge({ now, apply: true }, { signatureStore: failingDeleteStore().store });
    expect(failed).toMatchObject({ orphansDeleted: 0, filesPending: 1 });
    expect(await intakeKeys()).toEqual([stale]);

    const retry = await runCertPurge({ now, apply: true });
    expect(retry.orphansDeleted).toBe(1);
    expect(await intakeKeys()).toEqual([]);
  });

  it("미리 보기는 수만 센다", async () => {
    const now = new Date();
    const stale = await seedIntake(25, now);
    const store = countingStore();

    const preview = await runCertPurge({ now, apply: false }, { signatureStore: store.store });

    expect(preview.orphansDeleted).toBe(1);
    expect(store.deleteCalls).toBe(0);
    expect(await getSignatureStore().get(stale)).not.toBeNull();
    expect(await intakeKeys()).toEqual([stale]);
  });
});
