import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED } from "@/domain/settings/keys";
import { getCertificatePrint, getSubmissionForReview } from "@/domain/certs/review";
import type { RecordActionDeps } from "@/domain/action-log/record";
import { seedSubmittedCert } from "@/test/e2e/helpers/cert";
import { FULL_GRANT, grantCertReview, makeReviewer, makeUser } from "@/test/integration/cert-review-fixtures";

// 04.3-14 Task 1(사용자 결정 ⑤ · U3 a) — I4 · 인쇄를 열 때마다 끌 수 없는 cert_view 한 줄(누가 · 언제 · 어디서 · 어느 확인증).
// 판정을 지나 투영이 비지 않았을 때만 남고, 기록이 실패하면 데이터를 돌려주지 않는다(fail-closed).

const IP = "203.0.113.7";
const SAMPLE = { name: "김하늘", phone: "010-4821-7730", rrn: "9304122123458" };

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

async function viewLogs(submissionId: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "cert_view"), eq(actionLog.entityId, submissionId)));
}

function failingAppend(): RecordActionDeps["appendActionLog"] {
  return () => Promise.reject(new Error("action_log 쓰기 실패"));
}

function expectNoPersonalValues(detail: unknown): void {
  const text = JSON.stringify(detail);
  expect(text).not.toContain(SAMPLE.name);
  expect(text).not.toContain(SAMPLE.phone.replace(/-/g, ""));
  expect(text).not.toContain("4821");
  expect(text).not.toContain("7730");
  expect(text).not.toContain(SAMPLE.rrn);
  expect(text).not.toContain(SAMPLE.rrn.slice(6));
}

describe("getSubmissionForReview — cert_view 접속기록(I4)", () => {
  it("볼 수 있는 계급이 열면 cert_view 한 줄 · actor = viewer · entity cert_submission · detail { ip, submissionId } · 개인정보 값 없음", async () => {
    const seeded = await seedSubmittedCert(SAMPLE);
    const viewer = await makeReviewer(FULL_GRANT);

    const result = await getSubmissionForReview(viewer, seeded.submissionId, { ip: IP });

    expect(result.kind).toBe("ok");
    const rows = await viewLogs(seeded.submissionId);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.actorId).toBe(viewer.id);
    expect(row?.entity).toBe("cert_submission");
    expect(row?.detail).toEqual({ ip: IP, submissionId: seeded.submissionId });
    expectNoPersonalValues(row?.detail);
  });

  it("IP를 모르면 detail ip는 null이고 기록은 남는다", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    await getSubmissionForReview(viewer, seeded.submissionId, { ip: null });
    const rows = await viewLogs(seeded.submissionId);
    expect(rows.map((row) => row.detail)).toEqual([{ ip: null, submissionId: seeded.submissionId }]);
  });

  it("두 번 열면 두 줄이다(조회 한 번 = 한 줄)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    await getSubmissionForReview(viewer, seeded.submissionId, { ip: IP });
    await getSubmissionForReview(viewer, seeded.submissionId, { ip: IP });
    expect(await viewLogs(seeded.submissionId)).toHaveLength(2);
  });

  it("권한 없음 · 대표 계급 · uuid 아님 · 없는 id · 파기 · 게이트 꺼짐 · 투영 빔 → notFound이고 cert_view 0줄", async () => {
    const seeded = await seedSubmittedCert();
    const purged = await seedSubmittedCert();
    await db.update(certSubmissions).set({ purgedAt: new Date() }).where(eq(certSubmissions.id, purged.submissionId));
    const viewer = await makeReviewer(FULL_GRANT);
    const noView = await makeReviewer({ view: false, write: false, value: true, unmasked: true });
    await grantCertReview("role-ceo", FULL_GRANT);
    const ceo = await makeUser("role-ceo", "대표");
    // E4-B13 — 메뉴 보기는 있고 정보 항목이 모두 꺼짐(투영 빔 갈래).
    const emptyProjection = await makeReviewer({ view: true, write: true, value: false, unmasked: false });

    const cases: Array<[Viewer, string]> = [
      [noView, seeded.submissionId],
      [ceo, seeded.submissionId],
      [viewer, "not-a-uuid"],
      [viewer, randomUUID()],
      [viewer, purged.submissionId],
      [emptyProjection, seeded.submissionId],
    ];
    for (const [who, id] of cases) {
      expect(await getSubmissionForReview(who, id, { ip: IP })).toEqual({ kind: "notFound" });
    }

    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, false);
    expect(await getSubmissionForReview(viewer, seeded.submissionId, { ip: IP })).toEqual({ kind: "notFound" });

    expect(await viewLogs(seeded.submissionId)).toHaveLength(0);
    expect(await viewLogs(purged.submissionId)).toHaveLength(0);
  });

  it("기록 쓰기가 던지면 getSubmissionForReview도 던지고 제출 데이터가 돌아오지 않는다(fail-closed)", async () => {
    const seeded = await seedSubmittedCert(SAMPLE);
    const viewer = await makeReviewer(FULL_GRANT);

    let returned: unknown = null;
    await expect(
      getSubmissionForReview(viewer, seeded.submissionId, { ip: IP }, { appendActionLog: failingAppend() }).then((value) => {
        returned = value;
        return value;
      }),
    ).rejects.toThrow("action_log 쓰기 실패");
    expect(returned).toBeNull();
    expect(await viewLogs(seeded.submissionId)).toHaveLength(0);
  });
});

describe("getCertificatePrint — cert_view 접속기록(인쇄 · 사용자 결정 U3 a)", () => {
  it("열면 cert_view 한 줄 · detail { ip, submissionId, via: print } · 개인정보 값 없음", async () => {
    const seeded = await seedSubmittedCert(SAMPLE);
    const viewer = await makeReviewer(FULL_GRANT);

    const result = await getCertificatePrint(viewer, seeded.submissionId, { ip: IP });

    expect(result.kind).toBe("ok");
    const rows = await viewLogs(seeded.submissionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(viewer.id);
    expect(rows[0]?.detail).toEqual({ ip: IP, submissionId: seeded.submissionId, via: "print" });
    expectNoPersonalValues(rows[0]?.detail);
  });

  it("권한 없음 · 없는 id → notFound이고 0줄", async () => {
    const seeded = await seedSubmittedCert();
    const noView = await makeReviewer({ view: false, value: true });
    const viewer = await makeReviewer(FULL_GRANT);
    const missing = randomUUID();

    expect(await getCertificatePrint(noView, seeded.submissionId, { ip: IP })).toEqual({ kind: "notFound" });
    expect(await getCertificatePrint(viewer, missing, { ip: IP })).toEqual({ kind: "notFound" });

    expect(await viewLogs(seeded.submissionId)).toHaveLength(0);
    expect(await viewLogs(missing)).toHaveLength(0);
  });

  it("기록 쓰기가 던지면 인쇄 함수도 던지고 인쇄 데이터가 돌아오지 않는다(fail-closed)", async () => {
    const seeded = await seedSubmittedCert(SAMPLE);
    const viewer = await makeReviewer(FULL_GRANT);

    let returned: unknown = null;
    await expect(
      getCertificatePrint(viewer, seeded.submissionId, { ip: IP }, { appendActionLog: failingAppend() }).then((value) => {
        returned = value;
        return value;
      }),
    ).rejects.toThrow("action_log 쓰기 실패");
    expect(returned).toBeNull();
    expect(await viewLogs(seeded.submissionId)).toHaveLength(0);
  });
});
