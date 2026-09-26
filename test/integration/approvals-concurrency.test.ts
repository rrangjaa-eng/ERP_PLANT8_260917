import { describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { prepareSubmission } from "@/domain/approvals";
import { submitLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID } from "@/domain/settings/keys";
import { applySettingsImport, upsertSimpleValue } from "@/repositories/settings";
import { makePerson, NOW_2026 } from "./approvals-fixtures";

// CEO-2: 트랜잭션 안에서는 tx를 받는 리포지토리 호출만 돈다 — 결재선 설정 · 번호
// 서식 · 조직 스냅숏 · 행동 로그 켜짐 여부는 트랜잭션 전에 읽고, 번호 할당이
// 마지막 쓰기다. 그래서 기본 풀(DB_POOL_MAX 5)보다 많은 제출이 겹쳐도 풀
// 고갈 교착 없이 전부 끝난다.
describe("연차 동시 제출 — 풀 5에서 6건(CEO-2)", () => {
  it("서로 다른 기안자 여섯 명의 동시 제출이 전부 끝나고 번호 여섯 개가 서로 다르다", async () => {
    expect(pool.options.max).toBe(5);
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const drafters = [];
    for (let i = 0; i < 6; i++) drafters.push(await makePerson(`기안자${i}`, DEFAULT_ROLE_ID, "기획1팀"));

    const results = await Promise.all(
      drafters.map((drafter) =>
        submitLeave(drafter, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "" }, { now: NOW_2026 }),
      ),
    );

    const numbers = results.map((r) => r.number).sort();
    expect(numbers).toEqual(["LV26-0001", "LV26-0002", "LV26-0003", "LV26-0004", "LV26-0005", "LV26-0006"]);
  }, 20000);
});

// EXP-04 concurrency(Codex HIGH 스냅숏): 결재선 17키는 SELECT 한 문장으로 읽혀 한
// 제출의 단계 행은 한 커밋 시점의 설정 한 벌에서만 나온다.
describe("결재선 설정 스냅숏 — 한 제출 = 한 커밋 시점의 설정", () => {
  const STEP1 = APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID.key;
  const STEP2 = APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID.key;

  async function roles12(drafterId: string) {
    const prepared = await prepareSubmission({ id: drafterId, roleId: DEFAULT_ROLE_ID }, { kind: LEAVE_DOCUMENT_KIND, drafterId }, { now: NOW_2026 });
    const byIndex = new Map(prepared.steps.map((step) => [step.stepIndex, step.roleId]));
    return [byIndex.get(1), byIndex.get(2)];
  }

  it("결정적 — 두 키를 바꾸고 커밋 전에 멈춘 트랜잭션 동안은 둘 다 옛 값, 커밋 뒤에는 둘 다 새 값", async () => {
    const drafter = await makePerson("기안자", DEFAULT_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let written!: () => void;
    const wrote = new Promise<void>((resolve) => {
      written = resolve;
    });
    const tx = db.transaction(async (t) => {
      await upsertSimpleValue(SYSTEM_VIEWER, STEP1, DEFAULT_ROLE_ID, null, t);
      await upsertSimpleValue(SYSTEM_VIEWER, STEP2, DEFAULT_ROLE_ID, null, t);
      written();
      await held;
    });
    await wrote;
    expect(await roles12(drafter.id)).toEqual([TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]);
    release();
    await tx;
    expect(await roles12(drafter.id)).toEqual([DEFAULT_ROLE_ID, DEFAULT_ROLE_ID]);
  });

  it("경주 — 두 키를 한 트랜잭션으로 번갈아 쓰는 가져오기와 30회 겹쳐도 섞인 쌍이 한 번도 없다", async () => {
    const drafter = await makePerson("기안자", DEFAULT_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const X = TEAM_LEAD_ROLE_ID;
    const Y = DEFAULT_ROLE_ID;
    await applySettingsImport(SYSTEM_VIEWER, {
      simple: [
        { key: STEP1, value: X, by: null },
        { key: STEP2, value: X, by: null },
      ],
      historized: [],
    });

    const pairs: (string | null | undefined)[][] = [];
    for (let i = 0; i < 30; i++) {
      const value = i % 2 === 0 ? Y : X;
      const [, pair] = await Promise.all([
        applySettingsImport(SYSTEM_VIEWER, {
          simple: [
            { key: STEP1, value, by: null },
            { key: STEP2, value, by: null },
          ],
          historized: [],
        }),
        roles12(drafter.id),
      ]);
      pairs.push(pair);
    }
    expect(pairs.filter(([a, b]) => a !== b)).toEqual([]);
  }, 30000);
});
