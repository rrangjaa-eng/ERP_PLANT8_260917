import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { getEventDetail } from "@/domain/certs/events";
import { getSubmissionForReview } from "@/domain/certs/review";
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
