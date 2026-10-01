import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, certSubmissions, privacySessionActivity, sessions } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED, CERT_PRIVACY_IDLE_MINUTES } from "@/domain/settings/keys";
import { project } from "@/domain/permissions/project";
import {
  CERT_SUBMISSION_REVIEW_DTO_SPEC,
  type CertSubmissionReviewRow,
  correctSubmission,
  getSubmissionForReview,
  isCertPrivacyBarredRole,
  recordRrnReopen,
  revealRrn,
} from "@/domain/certs/review";
import { touchPrivacySession } from "@/domain/certs/privacy-session";
import { updateSubmissionIfVersion } from "@/repositories/cert-review";
import { seedSubmittedCert } from "@/test/e2e/helpers/cert";
import {
  FULL_GRANT,
  countLogs,
  decryptSpy,
  grantCertReview,
  makeReviewer,
  makeUser,
  submissionRow,
} from "@/test/integration/cert-review-fixtures";

// 04.3-07 Task 1 — I4 조회(project 투영) · 정정(버전 · 칸 이름만 로그 · 한 트랜잭션) ·
// 대표 차단 · 기능 게이트 · 개인정보취급자 비활동 세션(실제 Postgres). 표본은
// seedSubmittedCert()로만 만든다(/review RB-P2b).

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

const NEW_RRN = "9304121234560";

function unchangedFields(row: Awaited<ReturnType<typeof submissionRow>>) {
  return {
    name: row.name,
    phone: row.phone,
    address: row.address,
    rrnEncrypted: row.rrnEncrypted,
    rrnMasked: row.rrnMasked,
    version: row.version,
    updatedBy: row.updatedBy,
    signatureKey: row.signatureKey,
  };
}

describe("getSubmissionForReview — 투영 · 404", () => {
  it("권한 있는 viewer는 가린 번호 · 값 칸을 받고 DTO 어디에도 전체 번호가 없다", async () => {
    const seeded = await seedSubmittedCert({ delivery: "parcel", address: "서울시 마포구 월드컵로 1" });
    const viewer = await makeReviewer(FULL_GRANT);

    const result = await getSubmissionForReview(viewer, seeded.submissionId);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.submission.rrnMasked).toBe("930412-2******");
    expect(result.submission.address).toBe("서울시 마포구 월드컵로 1");
    expect(result.submission.delivery).toBe("parcel");
    expect(result.canReveal).toBe(true);
    expect(result.canCorrect).toBe(true);
    expect(result.idleMinutes).toBe(120);
    expect(JSON.stringify(result)).not.toContain("2123458");
  });

  it("현장 수령 확인증은 주소가 null이다", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const result = await getSubmissionForReview(viewer, seeded.submissionId);
    expect(result.kind === "ok" && result.submission.address).toBeNull();
  });

  it("cert_submission.value를 끈 viewer → notFound · 정정 거부 · 투영은 {}(켜면 스펙의 모든 키)(codex r2 C3)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer({ view: true, write: true, value: false, unmasked: true });
    const before = unchangedFields(await submissionRow(seeded.submissionId));

    expect(await getSubmissionForReview(viewer, seeded.submissionId)).toEqual({ kind: "notFound" });
    expect(
      await correctSubmission(viewer, seeded.submissionId, { version: 1, name: "김하늘", phone: "010-9999-0000" }),
    ).toEqual({ kind: "denied" });
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(before);

    const sample: CertSubmissionReviewRow = {
      id: seeded.submissionId,
      certNo: seeded.certNo,
      eventName: seeded.eventName,
      submittedAt: "2026-09-20T09:42:00.000Z",
      name: "김하늘",
      rrnMasked: "930412-2******",
      phone: "010-4821-7730",
      address: null,
      delivery: "onsite",
      prizeName: "갤럭시 탭 S10",
      quantity: 1,
      consentAt: "2026-09-20T09:42:00.000Z",
      signatureDataUrl: null,
      version: 1,
    };
    expect(await project(viewer, sample, CERT_SUBMISSION_REVIEW_DTO_SPEC)).toEqual({});
    const allowed = await makeReviewer(FULL_GRANT);
    const projected = await project(allowed, sample, CERT_SUBMISSION_REVIEW_DTO_SPEC);
    expect(Object.keys(projected).sort()).toEqual(CERT_SUBMISSION_REVIEW_DTO_SPEC.fields.map((f) => f.key).sort());
  });

  it("메뉴 보기 없음 · 파기됨 · 없는 id → notFound", async () => {
    const seeded = await seedSubmittedCert();
    const noView = await makeReviewer({ view: false, write: true, value: true, unmasked: true });
    expect(await getSubmissionForReview(noView, seeded.submissionId)).toEqual({ kind: "notFound" });

    const viewer = await makeReviewer(FULL_GRANT);
    expect(await getSubmissionForReview(viewer, randomUUID())).toEqual({ kind: "notFound" });
    expect(await getSubmissionForReview(viewer, "not-a-uuid")).toEqual({ kind: "notFound" });
    await db.update(certSubmissions).set({ purgedAt: new Date() }).where(eq(certSubmissions.id, seeded.submissionId));
    expect(await getSubmissionForReview(viewer, seeded.submissionId)).toEqual({ kind: "notFound" });
  });
});

describe("correctSubmission — D-1106 정정", () => {
  it("연락처만, 맞는 version → 저장 · 버전 +1 · cert_correct 1줄 detail {fields: [연락처]}(값 없음)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);

    const result = await correctSubmission(viewer, seeded.submissionId, {
      version: 1,
      name: "김하늘",
      phone: "010-5555-6666",
    });

    expect(result).toMatchObject({ kind: "saved", fields: ["연락처"], version: 2, rrnMasked: "930412-2******" });
    const row = await submissionRow(seeded.submissionId);
    expect(row.phone).toBe("01055556666");
    expect(row.version).toBe(2);
    expect(row.updatedBy).toBe(viewer.id);
    const logs = (await db.select().from(actionLog)).filter((r) => r.actionType === "cert_correct");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.entityId).toBe(seeded.submissionId);
    expect(logs[0]?.detail).toEqual({ fields: ["연락처"] });
  });

  it("주민등록번호 정정 → v1: 새 암호문 · rrn_masked 갱신 · 행동 로그 어느 칸에도 새 13자리 · 뒤 7자리 없음", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const before = await submissionRow(seeded.submissionId);

    const result = await correctSubmission(viewer, seeded.submissionId, {
      version: 1,
      name: "김하늘",
      phone: "010-4821-7730",
      rrn: "930412-1234560",
    });

    expect(result).toMatchObject({ kind: "saved", fields: ["주민등록번호"], rrnMasked: "930412-1******" });
    const row = await submissionRow(seeded.submissionId);
    expect(row.rrnEncrypted).toMatch(/^v1:/);
    expect(row.rrnEncrypted).not.toBe(before.rrnEncrypted);
    expect(row.rrnMasked).toBe("930412-1******");
    for (const log of await db.select().from(actionLog)) {
      const text = JSON.stringify(log);
      expect(text).not.toContain(NEW_RRN);
      expect(text).not.toContain(NEW_RRN.slice(6));
      expect(text).not.toContain("2123458");
    }
  });

  it("주민등록번호 정정을 cert.rrn_unmasked가 안 보이는 viewer가 보냄 → 거부 · 아무것도 안 바뀜", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer({ view: true, write: true, value: true, unmasked: false });
    const before = unchangedFields(await submissionRow(seeded.submissionId));

    expect(
      await correctSubmission(viewer, seeded.submissionId, { version: 1, name: "김하늘", phone: "010-4821-7730", rrn: NEW_RRN }),
    ).toEqual({ kind: "denied" });
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(before);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(0);
  });

  it("보기만 거두고 쓰기 · 값 · 전체 보기를 남긴 viewer의 주민등록번호 정정 → 거부 · 무변경 · 로그 0줄(codex final C1)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer({ view: false, write: true, value: true, unmasked: true });
    const before = unchangedFields(await submissionRow(seeded.submissionId));

    expect(
      await correctSubmission(viewer, seeded.submissionId, { version: 1, name: "김하늘", phone: "010-4821-7730", rrn: NEW_RRN }),
    ).toEqual({ kind: "denied" });
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(before);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(0);
  });

  it("보기만 거둔 viewer의 이름 · 연락처만 고치는 정정도 거부 · 무변경 · 로그 0줄(검토 R-L4)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer({ view: false, write: true, value: true, unmasked: true });
    const before = unchangedFields(await submissionRow(seeded.submissionId));

    expect(
      await correctSubmission(viewer, seeded.submissionId, { version: 1, name: "김하나", phone: "010-5555-6666" }),
    ).toEqual({ kind: "denied" });
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(before);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(0);
  });

  it("틀린 version → conflict(먼저 고친 사람 이름 · 시각) · 아무것도 안 바뀜", async () => {
    const seeded = await seedSubmittedCert();
    const first = await makeReviewer(FULL_GRANT, "이수아");
    const second = await makeReviewer(FULL_GRANT, "박서연");

    const saved = await correctSubmission(first, seeded.submissionId, { version: 1, name: "김하늘", phone: "010-1111-2222" });
    expect(saved.kind).toBe("saved");
    const afterFirst = unchangedFields(await submissionRow(seeded.submissionId));

    const result = await correctSubmission(second, seeded.submissionId, { version: 1, name: "김하나", phone: "010-4821-7730" });

    expect(result).toMatchObject({ kind: "conflict", byName: "이수아" });
    expect(result.kind === "conflict" && typeof result.at).toBe("string");
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(afterFirst);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(1);
  });

  it("현장 수령 확인증에 주소를 보냄 → 칸 오류 · 택배는 주소 1~200자", async () => {
    const onsite = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);

    expect(
      await correctSubmission(viewer, onsite.submissionId, { version: 1, name: "김하늘", phone: "010-4821-7730", address: "서울" }),
    ).toEqual({ kind: "invalid", fields: { address: "notAllowed" } });

    const parcel = await seedSubmittedCert({ delivery: "parcel" });
    expect(
      await correctSubmission(viewer, parcel.submissionId, { version: 1, name: "김하늘", phone: "010-4821-7730", address: "  " }),
    ).toEqual({ kind: "invalid", fields: { address: "empty" } });
    expect(
      await correctSubmission(viewer, parcel.submissionId, {
        version: 1,
        name: "김하늘",
        phone: "010-4821-7730",
        address: "가".repeat(201),
      }),
    ).toEqual({ kind: "invalid", fields: { address: "tooLong" } });
    expect(
      await correctSubmission(viewer, parcel.submissionId, {
        version: 1,
        name: "김하늘",
        phone: "010-4821-7730",
        address: "부산시 해운대구 1",
      }),
    ).toMatchObject({ kind: "saved", fields: ["주소"] });
  });

  it("이름 · 연락처 · 주민등록번호 형식 오류 → 칸 오류(여러 칸 함께) · 무변경", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const before = unchangedFields(await submissionRow(seeded.submissionId));

    expect(
      await correctSubmission(viewer, seeded.submissionId, { version: 1, name: " ", phone: "02-123-4567", rrn: "931312-1234567" }),
    ).toEqual({ kind: "invalid", fields: { name: "empty", phone: "format", rrn: "invalid" } });
    expect(
      await correctSubmission(viewer, seeded.submissionId, { version: 1, name: "가".repeat(41), phone: "010-4821-7730" }),
    ).toEqual({ kind: "invalid", fields: { name: "tooLong" } });
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(before);
  });

  it("바뀐 칸이 없으면 unchanged · 버전 · 로그 그대로", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    expect(
      await correctSubmission(viewer, seeded.submissionId, { version: 1, name: "김하늘", phone: "010-4821-7730" }),
    ).toEqual({ kind: "unchanged" });
    expect((await submissionRow(seeded.submissionId)).version).toBe(1);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(0);
  });

  it("updateSubmissionIfVersion은 파기된 행을 버전이 맞아도 고치지 않는다(0행 · 검토 R-L6)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    await db.update(certSubmissions).set({ purgedAt: new Date() }).where(eq(certSubmissions.id, seeded.submissionId));
    const before = await submissionRow(seeded.submissionId);

    const count = await db.transaction((tx) =>
      updateSubmissionIfVersion(viewer, seeded.submissionId, 1, { phone: "01055556666" }, new Date(), tx),
    );

    expect(count).toBe(0);
    const row = await submissionRow(seeded.submissionId);
    expect(row.phone).toBe(before.phone);
    expect(row.version).toBe(1);
  });

  it("정정 로그 INSERT가 던지면 correctSubmission도 던지고 확인증 칸 · version · updated_by가 그대로 · cert_correct 0줄(C6)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const before = unchangedFields(await submissionRow(seeded.submissionId));

    await expect(
      correctSubmission(
        viewer,
        seeded.submissionId,
        { version: 1, name: "김하나", phone: "010-5555-6666", rrn: NEW_RRN },
        { appendActionLog: () => Promise.reject(new Error("로그 실패(주입)")) },
      ),
    ).rejects.toThrow("로그 실패(주입)");
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(before);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(0);
  });

  it("서명은 입력에 없다 — 서명 키를 실어 보내도 signature_key는 그대로", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const before = await submissionRow(seeded.submissionId);
    const input = { version: 1, name: "김하나", phone: "010-4821-7730", signatureKey: "signatures/other.png" };

    await correctSubmission(viewer, seeded.submissionId, input);
    expect((await submissionRow(seeded.submissionId)).signatureKey).toBe(before.signatureKey);
  });
});

describe("C1 기능 게이트 · 대표 차단", () => {
  it("게이트를 끈 상태 → 네 함수 모두 notFound · 복호화 0번 · 로그 0줄 · 칸 · 버전 그대로", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const before = unchangedFields(await submissionRow(seeded.submissionId));
    const spy = decryptSpy();
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, false);

    expect(await getSubmissionForReview(viewer, seeded.submissionId)).toEqual({ kind: "notFound" });
    expect(await revealRrn(viewer, seeded.submissionId, { decrypt: spy.fn })).toEqual({ kind: "notFound" });
    expect(await recordRrnReopen(viewer, seeded.submissionId)).toEqual({ kind: "notFound" });
    expect(
      await correctSubmission(viewer, seeded.submissionId, { version: 1, name: "김하나", phone: "010-5555-6666", rrn: NEW_RRN }),
    ).toEqual({ kind: "notFound" });

    expect(spy.calls).toBe(0);
    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(0);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(0);
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(before);
  });

  it("대표 계급(role-ceo)에 권한 · 정보 항목을 켜도 네 함수 모두 거부 · 복호화 0번 · 로그 0줄 · 무변경(codex #5)", async () => {
    const seeded = await seedSubmittedCert();
    await grantCertReview("role-ceo", FULL_GRANT);
    const ceo = await makeUser("role-ceo", "대표");
    const before = unchangedFields(await submissionRow(seeded.submissionId));
    const spy = decryptSpy();

    expect(isCertPrivacyBarredRole(ceo)).toBe(true);
    expect(await getSubmissionForReview(ceo, seeded.submissionId)).toEqual({ kind: "notFound" });
    expect(await revealRrn(ceo, seeded.submissionId, { decrypt: spy.fn })).toEqual({ kind: "denied" });
    expect(await recordRrnReopen(ceo, seeded.submissionId)).toEqual({ kind: "denied" });
    expect(
      await correctSubmission(ceo, seeded.submissionId, { version: 1, name: "김하나", phone: "010-5555-6666" }),
    ).toEqual({ kind: "denied" });

    expect(spy.calls).toBe(0);
    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(0);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(0);
    expect(unchangedFields(await submissionRow(seeded.submissionId))).toEqual(before);
  });
});

describe("touchPrivacySession — 개인정보취급자 비활동(E3-10 · RB-5)", () => {
  const MINUTE = 60_000;

  async function makeSession(viewer: Viewer, createdMinutesAgo: number, now: Date): Promise<string> {
    const id = randomUUID();
    await db.insert(sessions).values({
      id,
      userId: viewer.id,
      token: randomUUID(),
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * MINUTE),
      createdAt: new Date(now.getTime() - createdMinutesAgo * MINUTE),
    });
    return id;
  }

  async function sessionExists(id: string): Promise<boolean> {
    return (await db.select().from(sessions).where(eq(sessions.id, id))).length === 1;
  }

  async function activity(id: string) {
    return db.select().from(privacySessionActivity).where(eq(privacySessionActivity.sessionId, id));
  }

  async function setLastSeen(id: string, at: Date): Promise<void> {
    await db.insert(privacySessionActivity).values({ sessionId: id, lastSeenAt: at });
  }

  it("메뉴 보기 없는 viewer · 대표 계급 → notAllowed · 활동 행을 만들지도 고치지도 않고 한도 넘긴 옛 활동이 있어도 세션 그대로(RB-5)", async () => {
    const now = new Date();
    const pm = await makeReviewer({ view: false, write: false, value: false, unmasked: false });
    await grantCertReview("role-ceo", FULL_GRANT);
    const ceo = await makeUser("role-ceo", "대표");

    for (const viewer of [pm, ceo]) {
      const fresh = await makeSession(viewer, 10, now);
      expect(await touchPrivacySession(viewer, fresh, now)).toEqual({ kind: "notAllowed" });
      expect(await activity(fresh)).toHaveLength(0);

      const stale = await makeSession(viewer, 300, now);
      const old = new Date(now.getTime() - 121 * MINUTE);
      await setLastSeen(stale, old);
      expect(await touchPrivacySession(viewer, stale, now)).toEqual({ kind: "notAllowed" });
      expect(await sessionExists(stale)).toBe(true);
      expect((await activity(stale))[0]?.lastSeenAt.getTime()).toBe(old.getTime());
    }
  });

  it("활동 행 없음 + 로그인 119분 전 → ok + 활동 행(마지막 활동 = 지금)", async () => {
    const now = new Date();
    const viewer = await makeReviewer(FULL_GRANT);
    const id = await makeSession(viewer, 119, now);

    expect(await touchPrivacySession(viewer, id, now)).toEqual({ kind: "ok" });
    expect((await activity(id))[0]?.lastSeenAt.getTime()).toBe(now.getTime());
  });

  it("(E3-10) 로그인 3시간 뒤 첫 방문 → ok · 세션 그대로 · 활동 행 생성 → 121분 무활동 → 만료 + 세션 행 삭제", async () => {
    const now = new Date();
    const viewer = await makeReviewer(FULL_GRANT);
    const id = await makeSession(viewer, 180, now);

    expect(await touchPrivacySession(viewer, id, now)).toEqual({ kind: "ok" });
    expect(await sessionExists(id)).toBe(true);
    expect((await activity(id))[0]?.lastSeenAt.getTime()).toBe(now.getTime());

    const later = new Date(now.getTime() + 121 * MINUTE);
    expect(await touchPrivacySession(viewer, id, later)).toEqual({ kind: "expired" });
    expect(await sessionExists(id)).toBe(false);
    expect(await activity(id)).toHaveLength(0);
  });

  it("로그인 29일 전 + 마지막 활동 10분 전 → ok", async () => {
    const now = new Date();
    const viewer = await makeReviewer(FULL_GRANT);
    const id = await makeSession(viewer, 29 * 24 * 60, now);
    await setLastSeen(id, new Date(now.getTime() - 10 * MINUTE));
    expect(await touchPrivacySession(viewer, id, now)).toEqual({ kind: "ok" });
  });

  it("마지막 활동 119분 전(설정 120) → ok + 갱신 · 121분 전 → 만료 + 세션 행 삭제(활동 행은 cascade)", async () => {
    const now = new Date();
    const viewer = await makeReviewer(FULL_GRANT);

    const near = await makeSession(viewer, 200, now);
    await setLastSeen(near, new Date(now.getTime() - 119 * MINUTE));
    expect(await touchPrivacySession(viewer, near, now)).toEqual({ kind: "ok" });
    expect((await activity(near))[0]?.lastSeenAt.getTime()).toBe(now.getTime());

    const over = await makeSession(viewer, 200, now);
    await setLastSeen(over, new Date(now.getTime() - 121 * MINUTE));
    expect(await touchPrivacySession(viewer, over, now)).toEqual({ kind: "expired" });
    expect(await sessionExists(over)).toBe(false);
    expect(await activity(over)).toHaveLength(0);
  });

  it("마지막 활동이 정확히 120분 전(설정 120) → ok(경과 ≤ 한도 · 검토 R-L6)", async () => {
    const now = new Date();
    const viewer = await makeReviewer(FULL_GRANT);
    const id = await makeSession(viewer, 200, now);
    await setLastSeen(id, new Date(now.getTime() - 120 * MINUTE));

    expect(await touchPrivacySession(viewer, id, now)).toEqual({ kind: "ok" });
    expect(await sessionExists(id)).toBe(true);
    expect((await activity(id))[0]?.lastSeenAt.getTime()).toBe(now.getTime());
  });

  it("세션 행이 요청 도중 지워졌으면(만료 경합) FK 오류 대신 expired · 활동 행 없음(검토 R-L3)", async () => {
    const now = new Date();
    const viewer = await makeReviewer(FULL_GRANT);
    const id = await makeSession(viewer, 10, now);
    await db.delete(sessions).where(eq(sessions.id, id));

    expect(await touchPrivacySession(viewer, id, now)).toEqual({ kind: "expired" });
    expect(await activity(id)).toHaveLength(0);
  });

  it("설정을 10분으로 바꾸면 11분 전 → 만료", async () => {
    const now = new Date();
    await setSettingValue(SYSTEM_VIEWER, CERT_PRIVACY_IDLE_MINUTES, 10);
    const viewer = await makeReviewer(FULL_GRANT);
    const id = await makeSession(viewer, 30, now);
    await setLastSeen(id, new Date(now.getTime() - 11 * MINUTE));
    expect(await touchPrivacySession(viewer, id, now)).toEqual({ kind: "expired" });
    expect(await sessionExists(id)).toBe(false);
  });
});

