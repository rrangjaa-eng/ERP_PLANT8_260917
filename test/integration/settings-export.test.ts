import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveAdjustments, settingsSimple, settingsHistorized } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { queryActionLog } from "@/repositories/action-log";
import { seedHistorizedValue, upsertSimpleValue } from "@/repositories/settings";
import { log } from "@/lib/log";
import {
  SETTING_DEFS,
  AUTH_LOCKOUT_THRESHOLD,
  TAX_VAT_RATE,
  LEAVE_ANNUAL_DAYS,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
} from "@/domain/settings/keys";
import { getSettingValue, setSettingValue, addHistorizedValue, listSettingHistory } from "@/domain/settings/registry";
import { exportSettings, importSettings, ImportValidationError } from "@/domain/settings/export";
import { DOCUMENT_NUMBER_PROJECT_SEPARATOR, DOCUMENT_NUMBER_PROJECT_SEQ_START } from "@/domain/settings/keys";
import { allocateDocumentNumber, loadDocumentNumberFormat, SeqStartOverlapError } from "@/domain/document-numbering";
import { kstYear } from "@/lib/kst-date";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "./approvals-fixtures";

async function snapshot(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  for (const def of SETTING_DEFS) {
    state[def.key] = def.kind === "historized" ? await listSettingHistory(def) : await getSettingValue(def);
  }
  return state;
}

describe("설정 JSON 내보내기·가져오기 (ADMN-06, 실제 Postgres)", () => {
  it("(a) 내보내고 빈 환경에 가져오면 모든 키의 조회 결과가 원래 환경과 같다", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 9);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.12 });

    const before = await snapshot();
    const exported = await exportSettings(SYSTEM_VIEWER);

    // 빈 환경 시뮬레이션 — 설정 두 표를 완전히 비운다.
    await db.delete(settingsHistorized);
    await db.delete(settingsSimple);

    await importSettings(SYSTEM_VIEWER, exported);
    const after = await snapshot();

    expect(after).toEqual(before);
  });

  it("(b) 같은 JSON을 두 번 가져오면 두 번째가 상태를 바꾸지 않는다(멱등)", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 8);
    const exported = await exportSettings(SYSTEM_VIEWER);

    await importSettings(SYSTEM_VIEWER, exported);
    const afterFirst = await snapshot();
    await importSettings(SYSTEM_VIEWER, exported);
    const afterSecond = await snapshot();

    expect(afterSecond).toEqual(afterFirst);
  });

  it("(c) 가져오기 항목 중 하나라도 검증에 실패하면 아무것도 적용되지 않는다", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 7);
    const before = await snapshot();

    const badPayload = {
      schemaVersion: "1",
      exportedAt: new Date().toISOString(),
      settings: {
        [AUTH_LOCKOUT_THRESHOLD.key]: 3, // 유효한 값
        "action_log.optional_types": "이건 배열이 아니라 문자열이다", // 스키마 위반
      },
    };

    await expect(importSettings(SYSTEM_VIEWER, badPayload)).rejects.toBeInstanceOf(ImportValidationError);

    const after = await snapshot();
    expect(after).toEqual(before);
  });

  it("(d) 내보내기가 excel_export 행동 로그 행 하나를 남긴다", async () => {
    const beforeLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    await exportSettings(SYSTEM_VIEWER);
    const afterLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    expect(afterLogs.length).toBe(beforeLogs.length + 1);
  });

  it("(e) 허용 목록 밖 구분자(#)를 가져오면 거부되고 값은 그대로다", async () => {
    const badPayload = {
      schemaVersion: "1",
      exportedAt: new Date().toISOString(),
      settings: { [DOCUMENT_NUMBER_PROJECT_SEPARATOR.key]: "#" },
    };

    await expect(importSettings(SYSTEM_VIEWER, badPayload)).rejects.toBeInstanceOf(ImportValidationError);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEPARATOR)).toBe("");
  });

  describe("저장된 구분자가 허용 목록 밖일 때 (PR #104 /review 2차 A(2))", () => {
    afterEach(() => vi.restoreAllMocks());

    it("(j) 허용 밖 구분자(#)가 저장돼 있으면 내보내기는 기본값(빈 값)을 담고 log.error를 남기며, 그 파일은 다시 가져올 수 있다", async () => {
      const spy = vi.spyOn(log, "error").mockImplementation(() => {});
      await upsertSimpleValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEPARATOR.key, "#", null);

      const exported = await exportSettings(SYSTEM_VIEWER);

      expect(exported.settings[DOCUMENT_NUMBER_PROJECT_SEPARATOR.key]).toBe("");
      expect(spy).toHaveBeenCalledWith(
        "settings.invalid_stored_value",
        expect.objectContaining({ key: DOCUMENT_NUMBER_PROJECT_SEPARATOR.key }),
      );
      await expect(importSettings(SYSTEM_VIEWER, exported)).resolves.toBeUndefined();
    });
  });

  // 04.1-04(ENG-5 · B-NEW02): 가져오기도 적용 시작일 공통 검증을 거친다 — 지난 연도는
  // 그날 이미 유효한 값과 같은 무변화 행만 통과. 서울 2026-09-24 12:00 기준.
  const importDeps = { now: new Date("2026-09-24T03:00:00Z") };

  function payload(settings: Record<string, unknown>) {
    return { schemaVersion: "1", exportedAt: new Date().toISOString(), settings };
  }

  async function annualAndThreshold() {
    return { annual: await listSettingHistory(LEAVE_ANNUAL_DAYS), threshold: await getSettingValue(AUTH_LOCKOUT_THRESHOLD) };
  }

  // quick 261001-85g(ADMN-06) — 지난 연도 비교는 「설정된」 키(기본값과 다른 이력이 한 행이라도 있는 키)에만 걸린다.
  // 이 묶음은 leave.annual_days 행을 바꾸므로 테스트마다 시작 전 행을 그대로 되돌린다(뒤 (f) · (h)가 이어 쓴다).
  describe("지난 연도 이력 가져오기 — 설정된 키 · 미설정 키", () => {
    let savedRows: Array<{ key: string; effectiveFrom: string; value: unknown; createdBy: string | null }> = [];

    beforeEach(async () => {
      savedRows = (await db.select().from(settingsHistorized).where(eq(settingsHistorized.key, LEAVE_ANNUAL_DAYS.key))).map(
        (row) => ({ key: row.key, effectiveFrom: row.effectiveFrom, value: row.value, createdBy: row.createdBy }),
      );
    });

    afterEach(async () => {
      await db.delete(settingsHistorized).where(eq(settingsHistorized.key, LEAVE_ANNUAL_DAYS.key));
      if (savedRows.length > 0) await db.insert(settingsHistorized).values(savedRows);
    });

    // 빈 새 환경에는 올해 전 업무 기록이 없다 — 통합 DB는 다른 파일이 남긴 기록을 공유하므로 이 확인만 주입한다((n)이 실제 조회를 덮는다).
    const noPastRecords = { ...importDeps, hasPastBusinessRecords: () => Promise.resolve(false) };

    // 대상 환경을 「시드 행 하나」(배포 시드 2000-01-01 = 기본값)로 맞춘다.
    async function onlySeedRow(): Promise<void> {
      await db.delete(settingsHistorized).where(eq(settingsHistorized.key, LEAVE_ANNUAL_DAYS.key));
      await seedHistorizedValue(SYSTEM_VIEWER, LEAVE_ANNUAL_DAYS.key, "2000-01-01", LEAVE_ANNUAL_DAYS.default);
    }

    // 기본값과 다른 이력이 이미 있는 「설정된 환경」(2024-01-01 = 17).
    async function configured(): Promise<void> {
      await onlySeedRow();
      await seedHistorizedValue(SYSTEM_VIEWER, LEAVE_ANNUAL_DAYS.key, "2024-01-01", 17);
    }

    it("(e) 설정된 환경(2024 = 17)에 값이 다른 지난 연도 항목은 전체 거부 — 함께 넣은 단순 키도 그대로", async () => {
      await configured();
      const before = await annualAndThreshold();
      const error = await importSettings(
        SYSTEM_VIEWER,
        payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2025-01-01", value: 20 }], [AUTH_LOCKOUT_THRESHOLD.key]: 3 }),
        importDeps,
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ImportValidationError);
      expect((error as ImportValidationError).issues.join("\n")).toContain("지난 연도");
      expect(await annualAndThreshold()).toEqual(before);
    });

    it("(e2) 설정된 환경(2024 = 17)에서 지난 연도 비교 조회가 DB 오류로 실패하면 검증 오류로 바꾸지 않고 그 오류를 그대로 올린다", async () => {
      await configured();
      const before = await annualAndThreshold();
      const outage = new Error("connection terminated");
      const error = await importSettings(
        SYSTEM_VIEWER,
        payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2025-01-01", value: 20 }] }),
        { ...importDeps, getSettingValue: () => Promise.reject(outage) },
      ).catch((caught: unknown) => caught);
      expect(error).toBe(outage);
      expect(await annualAndThreshold()).toEqual(before);
    });

    it("(k) 시드 행뿐인(미설정) 환경에 비기본값 지난 연도 + 미래 행을 가져오면 그대로 들어간다", async () => {
      await onlySeedRow();
      await importSettings(
        SYSTEM_VIEWER,
        payload({
          [LEAVE_ANNUAL_DAYS.key]: [
            { effectiveFrom: "2025-01-01", value: 16 },
            { effectiveFrom: "2027-01-01", value: 17 },
          ],
        }),
        noPastRecords,
      );
      expect(await listSettingHistory(LEAVE_ANNUAL_DAYS)).toEqual([
        { effectiveFrom: "2027-01-01", value: 17 },
        { effectiveFrom: "2025-01-01", value: 16 },
        { effectiveFrom: "2000-01-01", value: LEAVE_ANNUAL_DAYS.default },
      ]);
    });

    it("(l) 지난 연도 비기본값 이력(2025 = 16)이 있는 환경을 내보내 빈 환경에 가져오면 모든 키의 조회 결과가 같다", async () => {
      await seedHistorizedValue(SYSTEM_VIEWER, LEAVE_ANNUAL_DAYS.key, "2025-01-01", 16);
      const before = await snapshot();
      const exported = await exportSettings(SYSTEM_VIEWER);

      await db.delete(settingsHistorized);
      await db.delete(settingsSimple);

      await importSettings(SYSTEM_VIEWER, exported, noPastRecords);
      expect(await snapshot()).toEqual(before);
    });

    it("(m) 시드가 아닌 기본값 행(2025 = 15)이 있으면 설정된 키다 — 같은 날 다른 값(16)은 「지난 연도」로 거부", async () => {
      await onlySeedRow();
      await seedHistorizedValue(SYSTEM_VIEWER, LEAVE_ANNUAL_DAYS.key, "2025-01-01", LEAVE_ANNUAL_DAYS.default);
      const before = await listSettingHistory(LEAVE_ANNUAL_DAYS);
      const error = await importSettings(
        SYSTEM_VIEWER,
        payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2025-01-01", value: 16 }] }),
        noPastRecords,
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ImportValidationError);
      expect((error as ImportValidationError).issues.join("\n")).toContain("지난 연도");
      expect(await listSettingHistory(LEAVE_ANNUAL_DAYS)).toEqual(before);
    });

    it("(n) 시드 행뿐이어도 지난 연도 연차 기록(조정 2025)이 있으면 실제 환경이다 — 지난 연도 연차 일수는 거부", async () => {
      await onlySeedRow();
      const person = await makePerson("가져오기 연차 기록", DEFAULT_ROLE_ID, null);
      const [adjustment] = await db
        .insert(leaveAdjustments)
        .values({ userId: person.id, bucket: "annual", fiscalYear: 2025, amountQuarters: 4, reason: "가져오기 테스트", createdBy: person.id })
        .returning();
      try {
        const before = await listSettingHistory(LEAVE_ANNUAL_DAYS);
        const error = await importSettings(
          SYSTEM_VIEWER,
          payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2025-01-01", value: 16 }] }),
          importDeps,
        ).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ImportValidationError);
        expect((error as ImportValidationError).issues.join("\n")).toContain("지난 연도");
        expect(await listSettingHistory(LEAVE_ANNUAL_DAYS)).toEqual(before);
      } finally {
        if (adjustment) await db.delete(leaveAdjustments).where(eq(leaveAdjustments.id, adjustment.id));
      }
    });

    it("(o) 미설정 키라도 시드 날짜(2000-01-01)에 다른 값은 거부 — 조용히 버려지지 않는다", async () => {
      await onlySeedRow();
      const error = await importSettings(
        SYSTEM_VIEWER,
        payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2000-01-01", value: 16 }] }),
        noPastRecords,
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ImportValidationError);
      expect((error as ImportValidationError).issues.join("\n")).toContain("지난 연도");
    });
  });

  it("(f) 무변화 지난 행(2000-01-01 · 시드 15) + 미래 행은 통과하고 미래 행만 늘어난다", async () => {
    const before = await listSettingHistory(LEAVE_ANNUAL_DAYS);
    await importSettings(
      SYSTEM_VIEWER,
      payload({
        [LEAVE_ANNUAL_DAYS.key]: [
          { effectiveFrom: "2000-01-01", value: 15 },
          { effectiveFrom: "2027-01-01", value: 16 },
        ],
      }),
      importDeps,
    );
    expect(await listSettingHistory(LEAVE_ANNUAL_DAYS)).toEqual([{ effectiveFrom: "2027-01-01", value: 16 }, ...before]);
  });

  it("(g) 1월 1일이 아닌 항목은 1월 1일 문구로 거부", async () => {
    const before = await listSettingHistory(LEAVE_ANNUAL_DAYS);
    const error = await importSettings(
      SYSTEM_VIEWER,
      payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2026-03-01", value: 16 }] }),
      importDeps,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImportValidationError);
    expect((error as ImportValidationError).issues.join("\n")).toContain("적용 시작일은 1월 1일");
    expect(await listSettingHistory(LEAVE_ANNUAL_DAYS)).toEqual(before);
  });

  it("(h) 올해 1월 1일은 통과", async () => {
    await importSettings(SYSTEM_VIEWER, payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2026-01-01", value: 16 }] }), importDeps);
    expect((await listSettingHistory(LEAVE_ANNUAL_DAYS))[0]).toEqual({ effectiveFrom: "2026-01-01", value: 16 });
  });

  it("(i) 비uuid 특정 부서는 전체 거부 — 함께 넣은 단순 키도 그대로, 빈 값은 통과(B-NEW02)", async () => {
    const orgUnitBefore = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID);
    const thresholdBefore = await getSettingValue(AUTH_LOCKOUT_THRESHOLD);
    const error = await importSettings(
      SYSTEM_VIEWER,
      payload({ [APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID.key]: "not-a-uuid", [AUTH_LOCKOUT_THRESHOLD.key]: 3 }),
      importDeps,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImportValidationError);
    expect((error as ImportValidationError).issues.join("\n")).toContain(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID.key);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID)).toBe(orgUnitBefore);
    expect(await getSettingValue(AUTH_LOCKOUT_THRESHOLD)).toBe(thresholdBefore);

    await importSettings(SYSTEM_VIEWER, payload({ [APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID.key]: "" }), importDeps);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID)).toBe("");
  });

  // 묶음 ④ /review R7 — 가져오기도 설정 화면 저장과 같은 순번 시작값 낮추기 가드(카운터 행 잠금 + 현재 값 비교)를 지난다.
  describe("순번 시작값 가져오기", () => {
    async function issueFrom100(): Promise<void> {
      await setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, 100);
      const format = await loadDocumentNumberFormat("project");
      await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: kstYear(new Date()), format });
    }

    function payloadWith(seqStart: number) {
      return { schemaVersion: "1", exportedAt: new Date().toISOString(), settings: { [DOCUMENT_NUMBER_PROJECT_SEQ_START.key]: seqStart } };
    }

    it("올해 발급 뒤 더 낮은 시작값을 가져오면 거부되고 값은 그대로다", async () => {
      await issueFrom100();
      const rejected = importSettings(SYSTEM_VIEWER, payloadWith(50));
      await expect(rejected).rejects.toBeInstanceOf(SeqStartOverlapError);
      await expect(rejected).rejects.toHaveProperty("message", "순번 시작값은 현재 값(100)보다 낮출 수 없음");
      expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
    });

    it("낮추기가 거부되면 같은 파일의 다른 키도 적용되지 않는다", async () => {
      await issueFrom100();
      await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 7);
      const payload = { ...payloadWith(50), settings: { ...payloadWith(50).settings, [AUTH_LOCKOUT_THRESHOLD.key]: 3 } };
      await expect(importSettings(SYSTEM_VIEWER, payload)).rejects.toBeInstanceOf(SeqStartOverlapError);
      expect(await getSettingValue(AUTH_LOCKOUT_THRESHOLD)).toBe(7);
    });

    it("올해 발급 뒤 시작값을 올려 가져오면 저장된다", async () => {
      await issueFrom100();
      await importSettings(SYSTEM_VIEWER, payloadWith(120));
      expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(120);
    });
  });
});
