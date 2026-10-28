import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, corpCards, corpCardUsages, evidenceRecords } from "@/db/schema";
import { archive, restore } from "@/domain/archive";
import { createCorpCard, setCorpCardActive } from "@/domain/corp-cards";
import { relinkUnknownCardRecords } from "@/domain/evidence-import/card-relink";
import { setCorpCardActive as repoSetCorpCardActive } from "@/repositories/corp-cards";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { createIntakeViewer, registerFixtureFile } from "./fixtures/evidence";

// 06.1-04 Round 2 G11: 「카드 미등록」 줄은 막다른 길이 아니다 — 카드 마스터 저장(생성 · 활성 변경 · 보관함 복원) 뒤 그 끝 4자리의
// corp_card_id null 카드 서식 줄을 등록 때와 같은 짝 함수로 다시 판정해 잇는다. 이미 이어진 줄 · 끝 4자리 null 줄은 그대로, 대사는 돌지 않는다.
// 롯데 픽스처 카드 번호 9999000011112222 → 끝 4자리 2222.

async function addCard(issuer: string, numberLast4: string): Promise<string> {
  const dto = await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: `${issuer} ${numberLast4}`, kind: "shared" });
  return dto.id;
}

async function recordByApproval(approvalNo: string) {
  const [record] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.approvalNo, approvalNo));
  if (!record) throw new Error(`기록 없음 — ${approvalNo}`);
  return record;
}

describe("카드 미등록 줄 다시 잇기 (06.1-04 G11)", () => {
  it("짝 카드가 없어 카드 미등록인 롯데 줄은 그 끝 4자리 롯데 카드를 만들면 그 카드로 이어지고 version이 1 오른다", async () => {
    const viewer = await createIntakeViewer();
    const result = await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "10000001" }]));
    expect(result.cardUnknown).toBe(1);

    const cardId = await addCard("롯데카드", "2222");

    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: cardId, version: 2 });
  });

  it("별칭이 맞는 활성 카드 둘이라 미등록이던 줄은 하나를 비활성으로 바꾸면 남은 활성 카드로 이어지고, 같은 값으로 다시 부르면 다시 잇기를 부르지 않는다", async () => {
    const first = await addCard("롯데", "2222");
    const second = await addCard("롯데카드", "2222");
    const viewer = await createIntakeViewer();
    expect((await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "10000001" }]))).cardUnknown).toBe(1);

    await setCorpCardActive(SYSTEM_VIEWER, first, false);

    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: second, version: 2 });
    const relink = vi.fn(relinkUnknownCardRecords);
    await setCorpCardActive(SYSTEM_VIEWER, first, false, { relinkUnknownCardRecords: relink });
    expect(relink).not.toHaveBeenCalled();
  });

  it("별칭이 맞는 카드가 보관된 것뿐이라 미등록이던 줄은 보관함에서 그 카드를 되살리면 이어진다", async () => {
    const cardId = await addCard("롯데카드", "2222");
    await archive(SYSTEM_VIEWER, "corp_card", cardId);
    const viewer = await createIntakeViewer();
    expect((await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "10000001" }]))).cardUnknown).toBe(1);

    await restore(SYSTEM_VIEWER, "corp_card", cardId);

    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: cardId, version: 2 });
  });

  it("이미 이어진 줄 · 끝 4자리 null 줄 · 다른 서식 별칭 카드(신한 카드에 롯데 줄)는 그대로이고 카드 사용 행 수가 바뀌지 않는다", async () => {
    const lotteCard = await addCard("롯데카드", "2222");
    const viewer = await createIntakeViewer();
    await registerFixtureFile(
      viewer,
      lotteFixture([{ 승인번호: "10000001" }, { 승인번호: "10000002", 카드번호: "9999-****-****-****" }, { 승인번호: "10000003", 카드번호: "9999000011113333" }]),
    );
    const usagesBefore = (await db.select().from(corpCardUsages)).length;

    const shinhanOn2222 = await addCard("신한카드", "2222");
    const shinhanOn3333 = await addCard("신한카드", "3333");

    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: lotteCard, version: 1 });
    expect(await recordByApproval("10000002")).toMatchObject({ cardLast4: null, corpCardId: null, version: 1 });
    expect(await recordByApproval("10000003")).toMatchObject({ cardLast4: "3333", corpCardId: null, version: 1 });
    expect(await relinkUnknownCardRecords(SYSTEM_VIEWER, shinhanOn2222)).toEqual({ linked: 0 });
    expect(await relinkUnknownCardRecords(SYSTEM_VIEWER, shinhanOn3333)).toEqual({ linked: 0 });
    expect((await db.select().from(corpCardUsages)).length).toBe(usagesBefore);
  });

  it("(/review P3-6) 카드 저장 뒤 다시 잇기가 실패하면 카드도 남지 않는다 — 다시 저장하면 「이미 등록된 카드」 없이 저장되고 미등록 줄이 이어진다", async () => {
    const viewer = await createIntakeViewer();
    expect((await registerFixtureFile(viewer, lotteFixture([{ 카드번호: "9999000011116606", 승인번호: "66060001" }]))).cardUnknown).toBe(1);
    const input = { issuer: "롯데카드", numberLast4: "6606", label: "롯데 6606", kind: "shared" as const };

    await expect(
      createCorpCard(SYSTEM_VIEWER, input, {
        relinkUnknownCardRecords: () => Promise.reject(new Error("다시 잇기 실패")),
      }),
    ).rejects.toThrow("다시 잇기 실패");
    expect(await db.select().from(corpCards).where(eq(corpCards.numberLast4, "6606"))).toEqual([]);

    const card = await createCorpCard(SYSTEM_VIEWER, input);
    expect(await recordByApproval("66060001")).toMatchObject({ corpCardId: card.id, version: 2 });
  });

  it("(PE12) 카드 켜기 중 다시 잇기가 실패하면 켜기도 되돌아간다 · 정상이면 미등록 줄이 이어진다", async () => {
    // 별칭이 맞는 카드 둘이 다 꺼져 있으면 미등록 — 하나를 켜면 활성 하나로 정해진다.
    const cardId = await addCard("롯데카드", "2222");
    const otherId = await addCard("롯데", "2222");
    await setCorpCardActive(SYSTEM_VIEWER, cardId, false);
    await setCorpCardActive(SYSTEM_VIEWER, otherId, false);
    const viewer = await createIntakeViewer();
    expect((await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "10000001" }]))).cardUnknown).toBe(1);

    await expect(setCorpCardActive(SYSTEM_VIEWER, cardId, true, { relinkUnknownCardRecords: () => Promise.reject(new Error("다시 잇기 실패")) })).rejects.toThrow("다시 잇기 실패");
    expect((await db.select({ active: corpCards.active }).from(corpCards).where(eq(corpCards.id, cardId)))[0]?.active).toBe(false);
    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: null, version: 1 });

    await setCorpCardActive(SYSTEM_VIEWER, cardId, true);
    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: cardId, version: 2 });
  });

  async function restoreLogsOf(cardId: string) {
    return db
      .select({ seq: actionLog.seq })
      .from(actionLog)
      .where(and(eq(actionLog.entity, "corp_card"), eq(actionLog.entityId, cardId), eq(actionLog.actionType, "restore")));
  }

  it("(PE12 · E-P2-37) 보관 복원 중 다시 잇기가 실패하면 복원도 되돌아간다(보관 그대로 · 복원 로그 0) · 정상이면 복원 · 이어짐 · 로그 1", async () => {
    const cardId = await addCard("롯데카드", "2222");
    await archive(SYSTEM_VIEWER, "corp_card", cardId);
    const viewer = await createIntakeViewer();
    expect((await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "10000001" }]))).cardUnknown).toBe(1);

    await expect(restore(SYSTEM_VIEWER, "corp_card", cardId, { relinkUnknownCardRecords: () => Promise.reject(new Error("다시 잇기 실패")) })).rejects.toThrow("다시 잇기 실패");
    expect((await db.select({ archivedAt: corpCards.archivedAt }).from(corpCards).where(eq(corpCards.id, cardId)))[0]?.archivedAt).not.toBeNull();
    expect(await restoreLogsOf(cardId)).toEqual([]);
    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: null, version: 1 });

    expect(await restore(SYSTEM_VIEWER, "corp_card", cardId)).toEqual({ restored: true });
    expect((await db.select({ archivedAt: corpCards.archivedAt }).from(corpCards).where(eq(corpCards.id, cardId)))[0]?.archivedAt).toBeNull();
    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: cardId, version: 2 });
    expect(await restoreLogsOf(cardId)).toHaveLength(1);
  });

  it("(CG-07) 카드 명세 가져오기가 잠금을 쥐고 미등록 줄을 넣은 채 커밋 전이면 카드 켜기는 기다리고, 커밋 뒤 그 줄까지 잇는다", async () => {
    // 별칭이 맞는 카드 둘이 다 꺼져 있으면 미등록 — 하나를 켜면 활성 하나로 정해진다.
    const cardId = await addCard("롯데카드", "2222");
    const otherId = await addCard("롯데", "2222");
    await setCorpCardActive(SYSTEM_VIEWER, cardId, false);
    await setCorpCardActive(SYSTEM_VIEWER, otherId, false);
    const viewer = await createIntakeViewer();
    expect((await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "10000001" }]))).cardUnknown).toBe(1);
    const seed = await recordByApproval("10000001");

    // 가져오기 tx 흉내 — 같은 잠금을 잡고 같은 끝 4자리 「카드 미등록」 줄 하나를 더 넣은 채 커밋하지 않는다.
    const holder = await pool.connect();
    let settled = false;
    let activation: Promise<unknown> = Promise.resolve();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('evidence_card_import', 0))");
      await holder.query("CREATE TEMP TABLE relink_copy ON COMMIT DROP AS SELECT * FROM evidence_records WHERE id = $1", [seed.id]);
      await holder.query("UPDATE relink_copy SET id = gen_random_uuid(), approval_no = '10000009', dedupe_key = dedupe_key || '#cg07'");
      await holder.query("INSERT INTO evidence_records SELECT * FROM relink_copy");

      activation = setCorpCardActive(SYSTEM_VIEWER, cardId, true).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(settled, "켜기가 가져오기 잠금을 기다리지 않았다").toBe(false);
      await holder.query("COMMIT");
    } catch (error) {
      await holder.query("ROLLBACK");
      throw error;
    } finally {
      holder.release();
    }
    await activation;

    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: cardId });
    expect(await recordByApproval("10000009")).toMatchObject({ corpCardId: cardId });
  });

  it("(#318 P3) 보관된 카드는 켜지지 않는다 — 활성 그대로 · 미등록 줄 그대로 · 응답은 없는 카드와 같은 null", async () => {
    const cardId = await addCard("롯데카드", "2222");
    await setCorpCardActive(SYSTEM_VIEWER, cardId, false);
    await archive(SYSTEM_VIEWER, "corp_card", cardId);
    const viewer = await createIntakeViewer();
    expect((await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "10000001" }]))).cardUnknown).toBe(1);
    const before = (await db.select().from(corpCards).where(eq(corpCards.id, cardId)))[0];

    expect(await setCorpCardActive(SYSTEM_VIEWER, cardId, true)).toBeNull();
    // 읽은 뒤 보관된 경합도 막는다 — 저장소 UPDATE 조건 자체가 보관 카드를 건드리지 않는다.
    expect(await repoSetCorpCardActive(SYSTEM_VIEWER, cardId, true)).toBe(false);

    expect((await db.select().from(corpCards).where(eq(corpCards.id, cardId)))[0]).toEqual(before);
    expect(await recordByApproval("10000001")).toMatchObject({ corpCardId: null, version: 1 });
  });
});

