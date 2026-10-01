import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, certEvents, certPrizes, certSubmissions, notificationLog } from "@/db/schema";
import { pool } from "@/db/client";
import { ForbiddenError } from "@/domain/permissions/can";
import { withTransaction } from "@/lib/db-transaction";
import { lockEventRow } from "@/repositories/cert-events";
import { listPrizesForEvent } from "@/repositories/cert-prizes";
import { appendActionLog } from "@/repositories/action-log";
import { recordAction } from "@/domain/action-log/record";
import { runCertPurge } from "@/domain/certs/purge";
import { deferred, waitForLockWaiter } from "@/test/integration/lock-race";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { cancelRequest, closeEvent, getEventDetail, requestQr, savePrizes } from "@/domain/certs/events";
import { correctSubmission, excludeSubmission, getCertificatePrint, getSubmissionForReview, revealRrn } from "@/domain/certs/review";
import { loadIntake, submitCertificate } from "@/domain/certs/intake";
import { createCertEvent, setCertPrizeValueForTest, signaturePngFixture } from "@/test/e2e/helpers/cert";

// 04.3-17 — I′3 제출 섹션(대조) DTO · I4 파기 대상 표시 · 「링크 닫기」 · 「신청 취소」 · 「대조 제외」 · 경합.
// 매 테스트 전 setup.ts가 TRUNCATE + 시드한다. 권한은 시드 기본값이 아니라 테스트 계급에 직접 켠다(E3-13).

const PHONE = "02-123-4567";

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
  await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, PHONE);
});

type RoleGrant = {
  eventsView?: boolean;
  eventsWrite?: boolean;
  qrWrite?: boolean;
  submissionsView?: boolean;
  submissionsWrite?: boolean;
  prizeValue?: boolean;
  submissionValue?: boolean;
  unmasked?: boolean;
};

async function grant(roleId: string, opts: RoleGrant): Promise<void> {
  const perm = (menu: string, action: "view" | "write", allowed: boolean | undefined) =>
    upsertPermission(SYSTEM_VIEWER, { roleId, menu, action, allowed: allowed ?? false });
  await perm("certs.events", "view", opts.eventsView);
  await perm("certs.events", "write", opts.eventsWrite);
  await perm("certs.qr", "write", opts.qrWrite);
  await perm("certs.submissions", "view", opts.submissionsView);
  await perm("certs.submissions", "write", opts.submissionsWrite);
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_prize.value", visible: opts.prizeValue ?? false });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_submission.value", visible: opts.submissionValue ?? false });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert.rrn_unmasked", visible: opts.unmasked ?? false });
}

async function makeViewer(opts: RoleGrant, name = "통합 사용자", roleId?: string): Promise<Viewer> {
  const id = roleId ?? `role-reconcile-${randomUUID()}`;
  if (!roleId) await insertRole(SYSTEM_VIEWER, { id, name: `통합 ${id.slice(-8)}`, sortOrder: 99 });
  await grant(id, opts);
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `reconcile-${randomUUID()}@example.test`, name, roleId: id });
  return { id: userId, roleId: id };
}

const MANAGER: RoleGrant = {
  eventsView: true,
  qrWrite: true,
  submissionsView: true,
  submissionsWrite: true,
  prizeValue: true,
  submissionValue: true,
  unmasked: true,
};
const PM: RoleGrant = { eventsView: true, eventsWrite: true };

let ipSeq = 0;

// 수령자 제출 한 건(domain) — 이름 · 연락처를 고른다. IP는 매번 달리해 속도 제한과 무관하게.
async function submitAs(token: string, prizeId: string, name: string, phone: string): Promise<string> {
  const intake = await loadIntake(token);
  if (intake.kind !== "open") throw new Error(`loadIntake ${intake.kind}`);
  ipSeq += 1;
  const result = await submitCertificate(
    token,
    {
      prizeId,
      idempotencyKey: randomUUID(),
      consentVersion: intake.terms.consentVersion,
      retentionYears: intake.terms.retentionYears,
      name,
      rrnFront6: "930412",
      rrnBack7: "2123458",
      phone,
      consent: true,
      signaturePngBase64: signaturePngFixture().toString("base64"),
      rrnRecheckConfirmed: true,
    },
    `198.51.100.${ipSeq % 250}`,
  );
  if (result.kind !== "saved") throw new Error(`submitCertificate ${result.kind}`);
  const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.prizeId, prizeId));
  const row = rows.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
  if (!row) throw new Error("제출 행 없음");
  return row.id;
}

// 경품 둘(A 73,519 · 당첨 2 / B — 제출을 받은 뒤 30,000으로 내림) · 제출 넷(A 셋 중 둘은 같은 연락처 · 같은 이름 정규형, B 하나).
async function reconcileFixture(createdBy: string | null = null) {
  const event = await createCertEvent({
    name: "대조",
    createdBy,
    prizes: [
      { name: "A 갤럭시 탭", unitValueKrw: 73_519, winnerCount: 2 },
      { name: "B 스타벅스 카드", unitValueKrw: 73_519, winnerCount: 1 },
    ],
  });
  const [prizeA, prizeB] = event.prizeIds;
  if (!event.token || !prizeA || !prizeB) throw new Error("fixture");
  const a1 = await submitAs(event.token, prizeA, "김하늘", "010-4821-7730");
  const a2 = await submitAs(event.token, prizeA, "김 하늘", "010-4821-7730");
  const a3 = await submitAs(event.token, prizeA, "이도윤", "010-1111-2222");
  const b1 = await submitAs(event.token, prizeB, "박민수", "010-3333-4444");
  await setCertPrizeValueForTest(prizeB, 30_000);
  return { ...event, prizeA, prizeB, a1, a2, a3, b1 };
}

const ROW_KEYS = [
  "excluded",
  "id",
  "name",
  "phoneMasked",
  "prizeId",
  "purgeTarget",
  "quantity",
  "sameNameCount",
  "samePhoneCount",
  "submittedAt",
].sort();

describe("I′3 제출 섹션 DTO — 경품별 그룹 · 가린 연락처 · 색 글자 판정(Task 1)", () => {
  it("경영관리: 경품별 그룹 · 시각 오름차순 · 당첨 수 · 줄 칸은 정해진 열뿐 · 같은 연락처 · 같은 이름 · 파기 대상", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");

    const detail = await getEventDetail(manager, f.eventId);
    expect(detail.kind).toBe("ok");
    if (detail.kind !== "ok") return;
    const groups = detail.event.submissions;
    expect(groups).toBeDefined();
    if (!groups) return;

    expect(groups.map((g) => [g.prizeId, g.prizeName, g.winnerCount, g.submittedCount])).toEqual([
      [f.prizeA, "A 갤럭시 탭", 2, 3],
      [f.prizeB, "B 스타벅스 카드", 1, 1],
    ]);
    const [groupA, groupB] = groups;
    expect(groupA?.rows.map((r) => r.id)).toEqual([f.a1, f.a2, f.a3]);
    for (const row of [...(groupA?.rows ?? []), ...(groupB?.rows ?? [])]) {
      expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
    }
    const [r1, r2, r3] = groupA?.rows ?? [];
    expect(r1).toMatchObject({ name: "김하늘", phoneMasked: "010-****-7730", quantity: 1, samePhoneCount: 2, sameNameCount: 2 });
    expect(r2).toMatchObject({ name: "김 하늘", samePhoneCount: 2, sameNameCount: 2, purgeTarget: false, excluded: false });
    expect(r3).toMatchObject({ name: "이도윤", phoneMasked: "010-****-2222", samePhoneCount: 1, sameNameCount: 1 });
    expect(groupB?.rows[0]).toMatchObject({ id: f.b1, purgeTarget: true });

    // 주민등록번호(가린 값 포함) · 주소 · 서명 · 전체 연락처 · 가액은 응답 어디에도 없다.
    const json = JSON.stringify(groups);
    for (const leak of ["930412", "4821-7730", "01048217730", "signature", "address", "rrn", "73519", "73,519", "30000"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("대조 제외된 제출은 제자리에 excluded로 남고 그룹 N · 같은 연락처 · 같은 이름 셈에서 빠진다 · 파기된 제출은 없다", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    await db.update(certSubmissions).set({ excludedAt: new Date(), excludedBy: manager.id }).where(eq(certSubmissions.id, f.a2));
    await db
      .update(certSubmissions)
      .set({ purgedAt: new Date(), name: null, phone: null, rrnEncrypted: null, rrnMasked: null })
      .where(eq(certSubmissions.id, f.a3));

    const detail = await getEventDetail(manager, f.eventId);
    if (detail.kind !== "ok") throw new Error(detail.kind);
    const groupA = detail.event.submissions?.[0];
    expect(groupA?.submittedCount).toBe(1);
    expect(groupA?.rows.map((r) => r.id)).toEqual([f.a1, f.a2]);
    expect(groupA?.rows[0]).toMatchObject({ samePhoneCount: 1, sameNameCount: 1, excluded: false });
    expect(groupA?.rows[1]).toMatchObject({ excluded: true, phoneMasked: null, samePhoneCount: 0, sameNameCount: 0, purgeTarget: false });
  });

  it("기획본부 · 대표 계급 · 제출 값 항목이 꺼진 계급의 DTO에는 submissions 키 자체가 없다(N7 a)", async () => {
    const pm = await makeViewer(PM, "기획 PM");
    const f = await reconcileFixture(pm.id);
    const ceo = await makeViewer({ ...MANAGER, eventsWrite: true }, "대표", "role-ceo");
    const noValue = await makeViewer({ ...MANAGER, submissionValue: false }, "값 꺼짐");

    for (const viewer of [pm, ceo, noValue]) {
      const detail = await getEventDetail(viewer, f.eventId);
      expect(detail.kind).toBe("ok");
      if (detail.kind !== "ok") continue;
      expect(Object.keys(detail.event)).not.toContain("submissions");
      expect(JSON.stringify(detail)).not.toContain("****");
    }
  });
});

describe("I4 파기 대상 표시(Task 1 — 가액 × 수량 ≤ 50,000, 가액 숫자는 DTO에 없다)", () => {
  it("B 제출 true · A 제출 false · A 가액을 49,000으로 내리면 true · 73,519로 되돌리면 false", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    const purgeOf = async (id: string) => {
      const result = await getSubmissionForReview(manager, id);
      if (result.kind !== "ok") throw new Error(result.kind);
      expect(JSON.stringify(result)).not.toMatch(/73,?519|30,?000|49,?000/);
      return result.purgeTarget;
    };
    expect(await purgeOf(f.b1)).toBe(true);
    expect(await purgeOf(f.a1)).toBe(false);
    await setCertPrizeValueForTest(f.prizeA, 49_000);
    expect(await purgeOf(f.a1)).toBe(true);
    await setCertPrizeValueForTest(f.prizeA, 73_519);
    expect(await purgeOf(f.a1)).toBe(false);
  });
});

// ── Task 2 — 「링크 닫기」 · 「신청 취소」 · 경합 · 「대조 제외」 ─────────────────────────────────────

async function eventRow(eventId: string) {
  const [row] = await db.select().from(certEvents).where(eq(certEvents.id, eventId));
  return row ?? null;
}

async function logsOf(entityId: string, actionType: string) {
  const rows = await db.select().from(actionLog).where(and(eq(actionLog.entityId, entityId), eq(actionLog.actionType, actionType)));
  return rows;
}

const throwingLog: typeof appendActionLog = () => Promise.reject(new Error("로그 실패 주입"));

// 첫 트랜잭션만 「행사 행 잠금」 뒤에 멈춘다 — 상대가 잠금 대기자인지 확인한 뒤 푼다(04.3-10 W7 선례).
function pausingAfterLock(eventId: string) {
  const locked = deferred();
  const release = deferred();
  let calls = 0;
  const run: typeof withTransaction = (fn) =>
    calls++ > 0
      ? withTransaction(fn)
      : withTransaction(async (tx) => {
          await lockEventRow(SYSTEM_VIEWER, eventId, tx);
          await listPrizesForEvent(SYSTEM_VIEWER, eventId, tx);
          locked.resolve();
          await release.promise;
          return fn(tx);
        });
  return { run, locked, release };
}

describe("closeEvent — 「링크 닫기」(같은 tx 로그 · IP 가명 비움 · 다시 여는 함수 없음)", () => {
  it("닫힘 칸 셋 · submit_ip_hash 전부 NULL · closed{submitted} · status_change 1줄 · 두 번째 alreadyClosed · loadIntake closed manual", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    await db.update(certSubmissions).set({ excludedAt: new Date(), excludedBy: manager.id }).where(eq(certSubmissions.id, f.a3));

    const result = await closeEvent(manager, f.eventId);
    expect(result).toEqual({ kind: "closed", submitted: 3 });
    const row = await eventRow(f.eventId);
    expect(row?.closedAt).not.toBeNull();
    expect(row?.closedReason).toBe("manual");
    expect(row?.closedBy).toBe(manager.id);
    const hashes = await db.select({ h: certSubmissions.submitIpHash }).from(certSubmissions).where(eq(certSubmissions.eventId, f.eventId));
    expect(hashes.map((r) => r.h)).toEqual([null, null, null, null]);
    const logs = await logsOf(f.eventId, "status_change");
    expect(logs.map((l) => l.detail)).toEqual([{ from: "open", to: "closed", reason: "manual" }]);

    expect(await closeEvent(manager, f.eventId)).toEqual({ kind: "alreadyClosed" });
    expect(await logsOf(f.eventId, "status_change")).toHaveLength(1);
    const intake = await loadIntake(f.token ?? "");
    expect(intake.kind === "closed" && intake.reason).toBe("manual");
  });

  it("마감이 이미 지난 행사 → alreadyClosed(쓰기 0 — E38)", async () => {
    const manager = await makeViewer(MANAGER, "경영관리");
    const ev = await createCertEvent({ name: "마감 지남" });
    await db.update(certEvents).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(certEvents.id, ev.eventId));
    expect(await closeEvent(manager, ev.eventId)).toEqual({ kind: "alreadyClosed" });
    expect((await eventRow(ev.eventId))?.closedAt).toBeNull();
    expect(await logsOf(ev.eventId, "status_change")).toHaveLength(0);
  });

  it("로그 INSERT가 던지면 closeEvent가 던지고 닫힘 칸 · IP 가명이 그대로 — 정상 재시도는 닫힘 · 로그 1줄", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    await expect(closeEvent(manager, f.eventId, { appendActionLog: throwingLog })).rejects.toThrow("로그 실패 주입");
    expect((await eventRow(f.eventId))?.closedAt).toBeNull();
    const [one] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a1));
    expect(one?.submitIpHash).not.toBeNull();

    expect((await closeEvent(manager, f.eventId)).kind).toBe("closed");
    expect(await logsOf(f.eventId, "status_change")).toHaveLength(1);
  });

  it("신청됨 → notFound · PM → Forbidden · 게이트 꺼짐 → notFound(쓰기 0)", async () => {
    const manager = await makeViewer(MANAGER, "경영관리");
    const pm = await makeViewer(PM, "기획 PM");
    const requested = await createCertEvent({ name: "신청됨", status: "requested", createdBy: pm.id });
    expect(await closeEvent(manager, requested.eventId)).toEqual({ kind: "notFound" });

    const ev = await createCertEvent({ name: "열림", createdBy: pm.id });
    await expect(closeEvent(pm, ev.eventId)).rejects.toBeInstanceOf(ForbiddenError);
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, false);
    expect(await closeEvent(manager, ev.eventId)).toEqual({ kind: "notFound" });
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
    expect((await eventRow(ev.eventId))?.closedAt).toBeNull();
  });
});

describe("cancelRequest — 「신청 취소」(경품 0일 때만 · 행 삭제 · document_delete 같은 tx)", () => {
  it("신청자 · 경영관리 → 경품 0이면 cancelled(행 없음 · document_delete 1줄 · 알림함 행은 남음)", async () => {
    const pm = await makeViewer(PM, "기획 PM");
    const manager = await makeViewer(MANAGER, "경영관리");
    for (const actor of [pm, manager]) {
      const requested = await requestQr(pm, { name: `취소 ${actor.id.slice(0, 4)}`, wonOn: "2099-01-01", requestId: randomUUID() });
      if (requested.kind !== "ok") throw new Error(requested.kind);
      const notified = await db.select().from(notificationLog).where(eq(notificationLog.entityId, requested.eventId));
      const result = await cancelRequest(actor, requested.eventId);
      expect(result).toEqual({ kind: "cancelled", name: `취소 ${actor.id.slice(0, 4)}` });
      expect(await eventRow(requested.eventId)).toBeNull();
      const logs = await logsOf(requested.eventId, "document_delete");
      expect(logs.map((l) => l.detail)).toEqual([{ name: `취소 ${actor.id.slice(0, 4)}` }]);
      expect(await db.select().from(notificationLog).where(eq(notificationLog.entityId, requested.eventId))).toHaveLength(notified.length);
    }
  });

  it("경품 1줄 → hasPrizes{count: 1}(쓰기 0) · QR 생성 뒤 → notFound", async () => {
    const pm = await makeViewer(PM, "기획 PM");
    const manager = await makeViewer(MANAGER, "경영관리");
    const withPrize = await createCertEvent({ name: "경품 있음", status: "requested", createdBy: pm.id, prizes: [{ name: "경품" }] });
    expect(await cancelRequest(manager, withPrize.eventId)).toEqual({ kind: "hasPrizes", count: 1 });
    expect(await cancelRequest(pm, withPrize.eventId)).toEqual({ kind: "hasPrizes", count: 1 });
    expect(await eventRow(withPrize.eventId)).not.toBeNull();
    expect(await logsOf(withPrize.eventId, "document_delete")).toHaveLength(0);

    const open = await createCertEvent({ name: "열림", createdBy: pm.id, prizes: [] });
    expect(await cancelRequest(manager, open.eventId)).toEqual({ kind: "notFound" });
    expect(await eventRow(open.eventId)).not.toBeNull();
  });

  it("신청자도 경영관리도 아닌 PM → Forbidden · 신청자였으나 계급에서 certs.events 쓰기를 뺀 계정 → Forbidden(H-2)", async () => {
    const pm = await makeViewer(PM, "기획 PM");
    const otherPm = await makeViewer(PM, "다른 PM");
    const requested = await createCertEvent({ name: "남의 신청", status: "requested", createdBy: pm.id });
    await expect(cancelRequest(otherPm, requested.eventId)).rejects.toBeInstanceOf(ForbiddenError);

    await upsertPermission(SYSTEM_VIEWER, { roleId: pm.roleId ?? "", menu: "certs.events", action: "write", allowed: false });
    await expect(cancelRequest(pm, requested.eventId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await eventRow(requested.eventId)).not.toBeNull();
  });
});

describe("경합(E13) — 잠금을 거치는 실제 함수끼리 겹쳐도 500 없음", () => {
  it("cancelRequest가 잠근 사이 savePrizes(새 줄)는 잠금을 기다리고 cancelled + notFound — 순서가 반대면 saved + hasPrizes", async () => {
    const pm = await makeViewer(PM, "기획 PM");
    const manager = await makeViewer(MANAGER, "경영관리");
    const NEW_ROW = { inserts: [{ key: "n1", name: "새 경품", unitValue: "73,519", delivery: "현장" }] };

    const first = await createCertEvent({ name: "경합 취소", status: "requested", createdBy: pm.id });
    const pause = pausingAfterLock(first.eventId);
    const cancel = cancelRequest(manager, first.eventId, { withTransaction: pause.run });
    await pause.locked.promise;
    const save = savePrizes(manager, first.eventId, { changes: NEW_ROW });
    await waitForLockWaiter(pool);
    pause.release.resolve();
    expect(await cancel).toEqual({ kind: "cancelled", name: first.eventName });
    expect(await save).toEqual({ kind: "notFound" });
    expect(await db.select().from(certPrizes).where(eq(certPrizes.eventId, first.eventId))).toHaveLength(0);

    const second = await createCertEvent({ name: "경합 저장", status: "requested", createdBy: pm.id });
    expect((await savePrizes(manager, second.eventId, { changes: NEW_ROW })).kind).toBe("saved");
    expect(await cancelRequest(manager, second.eventId)).toEqual({ kind: "hasPrizes", count: 1 });
  });

  it("submitCertificate가 잠근 사이 closeEvent는 기다리고 saved + closed(제출 시각 < 닫힌 시각) — closeEvent가 먼저 잠그면 closed + closed", async () => {
    const manager = await makeViewer(MANAGER, "경영관리");
    const submitInput = async (token: string, prizeId: string) => {
      const intake = await loadIntake(token);
      if (intake.kind !== "open") throw new Error(intake.kind);
      return {
        prizeId,
        idempotencyKey: randomUUID(),
        consentVersion: intake.terms.consentVersion,
        retentionYears: intake.terms.retentionYears,
        name: "김하늘",
        rrnFront6: "930412",
        rrnBack7: "2123458",
        phone: "010-4821-7730",
        consent: true,
        signaturePngBase64: signaturePngFixture().toString("base64"),
        rrnRecheckConfirmed: true,
      };
    };

    const a = await createCertEvent({ name: "제출 먼저" });
    const pa = pausingAfterLock(a.eventId);
    const submitted = submitCertificate(a.token ?? "", await submitInput(a.token ?? "", a.prizeIds[0] ?? ""), "198.51.100.201", {
      withTransaction: pa.run,
    });
    await pa.locked.promise;
    const closed = closeEvent(manager, a.eventId);
    await waitForLockWaiter(pool);
    pa.release.resolve();
    expect((await submitted).kind).toBe("saved");
    expect(await closed).toEqual({ kind: "closed", submitted: 1 });
    const [sub] = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, a.eventId));
    const closedAt = (await eventRow(a.eventId))?.closedAt;
    expect(sub && closedAt && sub.submittedAt.getTime() <= closedAt.getTime()).toBe(true);

    const b = await createCertEvent({ name: "닫기 먼저" });
    const input = await submitInput(b.token ?? "", b.prizeIds[0] ?? "");
    const pb = pausingAfterLock(b.eventId);
    const closing = closeEvent(manager, b.eventId, { withTransaction: pb.run });
    await pb.locked.promise;
    const late = submitCertificate(b.token ?? "", input, "198.51.100.202");
    await waitForLockWaiter(pool);
    pb.release.resolve();
    expect(await closing).toEqual({ kind: "closed", submitted: 0 });
    expect((await late).kind).toBe("closed");
    expect(await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, b.eventId))).toHaveLength(0);
  });

  // 04.3-17 독립 검토 X6 — 아래 셋은 멈춘 쪽이 실제 함수(또는 실제 함수의 잠금)이고, 기다리는 쪽이 이 플랜의 잠금이다:
  // 기다리는 함수가 행사 행 잠금을 빼면 셋 다 실패한다(①은 DELETE가 FK에 걸려 던지고, ② ③은 잠금 대기자가 생기지 않는다).
  it("① savePrizes가 잠근 채(새 줄 INSERT 뒤 로그 직전) 멈춘 사이 cancelRequest는 잠금을 기다리고 saved + hasPrizes", async () => {
    const pm = await makeViewer(PM, "기획 PM");
    const manager = await makeViewer(MANAGER, "경영관리");
    const ev = await createCertEvent({ name: "경합 저장 먼저", status: "requested", createdBy: pm.id });
    const locked = deferred();
    const release = deferred();
    const pausingRecord: typeof recordAction = async (...args) => {
      locked.resolve();
      await release.promise;
      return recordAction(...args);
    };
    const save = savePrizes(
      manager,
      ev.eventId,
      { changes: { inserts: [{ key: "n1", name: "새 경품", unitValue: "73,519", delivery: "현장" }] } },
      { recordAction: pausingRecord },
    );
    await locked.promise;
    const cancel = cancelRequest(manager, ev.eventId);
    await waitForLockWaiter(pool);
    release.resolve();
    expect((await save).kind).toBe("saved");
    expect(await cancel).toEqual({ kind: "hasPrizes", count: 1 });
    expect(await db.select().from(certPrizes).where(eq(certPrizes.eventId, ev.eventId))).toHaveLength(1);
    expect(await eventRow(ev.eventId)).not.toBeNull();
    expect(await logsOf(ev.eventId, "document_delete")).toHaveLength(0);
  });

  it("② closeEvent가 잠근 사이 excludeSubmission은 잠금을 기다리고 closed + excluded", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    const [before] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a2));
    const pause = pausingAfterLock(f.eventId);
    const closing = closeEvent(manager, f.eventId, { withTransaction: pause.run });
    await pause.locked.promise;
    const excluding = excludeSubmission(manager, f.a2, { version: before?.version ?? 0 });
    await waitForLockWaiter(pool);
    pause.release.resolve();
    expect(await closing).toEqual({ kind: "closed", submitted: 4 });
    expect(await excluding).toEqual({ kind: "excluded", eventId: f.eventId, name: "김 하늘" });
  });

  it("③ closeEvent가 잠근 사이 correctSubmission(수량)은 잠금을 기다리고 closed + saved", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    const [before] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a3));
    const pause = pausingAfterLock(f.eventId);
    const closing = closeEvent(manager, f.eventId, { withTransaction: pause.run });
    await pause.locked.promise;
    const correcting = correctSubmission(manager, f.a3, {
      version: before?.version ?? 0,
      name: "이도윤",
      phone: "010-1111-2222",
      quantity: "2",
    });
    await waitForLockWaiter(pool);
    pause.release.resolve();
    expect(await closing).toEqual({ kind: "closed", submitted: 4 });
    expect((await correcting).kind).toBe("saved");
  });
});

describe("excludeSubmission — 「대조 제외」(E1 b · 게이트 = 쓰기, NF-2)", () => {
  it("같은 tx에서 excluded_at/by · 주민 암호문 · 가린 값 · 연락처 · 주소 · IP 가명 NULL · 이름 · purged_at 그대로 · cert_purge 1줄 · 두 번째 alreadyExcluded", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    const before = (await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a2)))[0];
    const result = await excludeSubmission(manager, f.a2, { version: before?.version ?? 0 });
    expect(result).toEqual({ kind: "excluded", eventId: f.eventId, name: "김 하늘" });
    const [row] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a2));
    expect(row).toMatchObject({
      excludedBy: manager.id,
      rrnEncrypted: null,
      rrnMasked: null,
      phone: null,
      address: null,
      submitIpHash: null,
      name: "김 하늘",
      purgedAt: null,
    });
    expect(row?.excludedAt).not.toBeNull();
    const logs = await logsOf(f.a2, "cert_purge");
    expect(logs.map((l) => l.detail)).toEqual([{ submissions: 1, reason: "excluded" }]);

    expect(await excludeSubmission(manager, f.a2, { version: row?.version ?? 0 })).toEqual({ kind: "alreadyExcluded" });
    expect(await logsOf(f.a2, "cert_purge")).toHaveLength(1);

    // 다음 파기 적용 실행이 그 서명 객체를 지운다(04.3-12 삭제 대기).
    expect(row?.signatureKey).not.toBeNull();
    await runCertPurge({ now: new Date(), apply: true });
    const [after] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a2));
    expect(after?.signatureKey).toBeNull();
  });

  it("로그가 던지면 전부 롤백 · 옛 버전 → conflict(쓰기 0)", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    const [before] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a1));
    await expect(excludeSubmission(manager, f.a1, { version: before?.version ?? 0 }, { appendActionLog: throwingLog })).rejects.toThrow(
      "로그 실패 주입",
    );
    const [rolled] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a1));
    expect(rolled).toEqual(before);

    // 화면이 본 버전과 다르다(그새 정정됨) — 첫 버전이 1이라 다음 값으로 어긋나게 한다.
    const stale = await excludeSubmission(manager, f.a1, { version: (before?.version ?? 1) + 1 });
    expect(stale.kind).toBe("conflict");
    const [unchanged] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a1));
    expect(unchanged).toEqual(before);
  });

  it("PM · 대표 계급 · 보기 + 값만(쓰기 없음) → denied(쓰기 0) · 그 계급의 I4에는 canExclude가 없다(NF-2)", async () => {
    const f = await reconcileFixture();
    const pm = await makeViewer(PM, "기획 PM");
    const ceo = await makeViewer(MANAGER, "대표", "role-ceo");
    const viewOnly = await makeViewer({ ...MANAGER, submissionsWrite: false }, "보기 전용");
    const [before] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a1));
    for (const viewer of [pm, ceo, viewOnly]) {
      expect(await excludeSubmission(viewer, f.a1, { version: before?.version ?? 0 })).toEqual({ kind: "denied" });
    }
    const [after] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a1));
    expect(after).toEqual(before);
    const review = await getSubmissionForReview(viewOnly, f.a1);
    expect(review.kind === "ok" && review.canExclude).toBe(false);
    const managerReview = await getSubmissionForReview(await makeViewer(MANAGER, "경영관리"), f.a1);
    expect(managerReview.kind === "ok" && managerReview.canExclude).toBe(true);
  });

  it("제외된 제출 — I4는 열리고(제외 표시 · 정정 · 전체 보기 · 제외 없음) 전체 보기 · 정정 · 인쇄 조회는 거부", async () => {
    const f = await reconcileFixture();
    const manager = await makeViewer(MANAGER, "경영관리");
    const [before] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a1));
    await excludeSubmission(manager, f.a1, { version: before?.version ?? 0 });
    const [row] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, f.a1));

    const review = await getSubmissionForReview(manager, f.a1);
    expect(review.kind).toBe("ok");
    if (review.kind !== "ok") return;
    expect(review.excluded).toMatchObject({ byName: "경영관리" });
    expect(review.canCorrect).toBe(false);
    expect(review.canReveal).toBe(false);
    expect(review.canExclude).toBe(false);
    expect(review.submission.phone).toBeNull();
    expect(review.submission.rrnMasked).toBeNull();
    expect(review.submission.signatureDataUrl).toBeNull();

    expect(await revealRrn(manager, f.a1)).toEqual({ kind: "denied" });
    expect(await correctSubmission(manager, f.a1, { version: row?.version ?? 0, name: "김하늘", phone: "010-9999-0000" })).toEqual({
      kind: "denied",
    });
    expect(await getCertificatePrint(manager, f.a1)).toEqual({ kind: "notFound" });
  });
});
