import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, evidenceRecords } from "@/db/schema";
import { archive, restore } from "@/domain/archive";
import { createCorpCard, setCorpCardActive } from "@/domain/corp-cards";
import { relinkUnknownCardRecords } from "@/domain/evidence-import/card-relink";
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
});
