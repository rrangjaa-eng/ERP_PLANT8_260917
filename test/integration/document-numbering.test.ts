import { randomUUID } from "node:crypto";
import { describe, expect, expectTypeOf, it } from "vitest";
import { db } from "@/db/client";
import { projects, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import {
  allocateDocumentNumber,
  loadDocumentNumberFormat,
  SeqStartOverlapError,
  setSimpleSettingValue,
  UnknownDocumentNumberCounterError,
} from "@/domain/document-numbering";
import { ForbiddenError, getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { lockDocumentCounter } from "@/repositories/document-counters";
import { upsertSimpleValue } from "@/repositories/settings";
import { insertVendor } from "@/repositories/vendors";
import { createAccount } from "@/domain/auth/accounts";
import { createProject } from "@/domain/projects";
import {
  DOCUMENT_NUMBER_PROJECT_PREFIX,
  DOCUMENT_NUMBER_PROJECT_YEAR_DIGITS,
  DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS,
  DOCUMENT_NUMBER_PROJECT_SEPARATOR,
  DOCUMENT_NUMBER_PROJECT_SEQ_START,
} from "@/domain/settings/keys";

// 04-05(ADMN-09) — `document_counters` 표는 test/integration/setup.ts의
// beforeEach TRUNCATE로 매 테스트마다 빈 상태에서 시작한다(전역 격리) —
// 서식 설정 값도 같은 TRUNCATE로 매번 기본값부터 다시 시작해 테스트 간
// 별도 복원이 필요 없다.
describe("domain/document-numbering 서식 설정 (ADMN-09, 실제 Postgres)", () => {
  it("기본 서식으로 2026년 첫 프로젝트 번호는 26001이다", async () => {
    const format = await loadDocumentNumberFormat("project");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format });
    expect(number).toBe("26001");
  });

  it("서식을 바꿔도 이미 매긴 번호는 그대로다 — 그 뒤 등록분에만 반영된다", async () => {
    const firstFormat = await loadDocumentNumberFormat("project");
    const first = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format: firstFormat });
    expect(first.number).toBe("26001");

    await setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS, 4);

    const secondFormat = await loadDocumentNumberFormat("project");
    const second = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format: secondFormat });
    expect(second.number).toBe("260002");
    // 이미 매긴 번호는 재계산되지 않는다 — 첫 호출이 돌려준 값은 그대로다.
    expect(first.number).toBe("26001");
  });

  it("접두어를 넣으면 그 뒤 등록분에만 접두어가 붙는다", async () => {
    const beforeFormat = await loadDocumentNumberFormat("project");
    const before = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format: beforeFormat });
    expect(before.number).toBe("26001");

    await setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_PREFIX, "PRJ");
    const afterFormat = await loadDocumentNumberFormat("project");
    const after = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format: afterFormat });
    expect(after.number).toBe("PRJ26002");
  });

  it("연도가 2027로 바뀌면 순번이 1부터 다시 시작해 27001이 나온다(카운터 기간 값이 담당)", async () => {
    const format = await loadDocumentNumberFormat("project");
    const y2026 = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format });
    expect(y2026.number).toBe("26001");

    const y2027 = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2027, format });
    expect(y2027.number).toBe("27001");
    expect(y2027.seq).toBe(1);
  });

  it("순번 자릿수 0은 저장이 거부되고 기존 서식이 유지된다", async () => {
    await expect(setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS, 0)).rejects.toThrow();

    const format = await loadDocumentNumberFormat("project");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format });
    expect(number).toBe("26001");
  });

  it("순번 자릿수 음수는 저장이 거부된다", async () => {
    await expect(setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS, -1)).rejects.toThrow();
  });

  it("연도 자릿수 0은 저장이 거부된다", async () => {
    await expect(setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_YEAR_DIGITS, 0)).rejects.toThrow();
  });

  it("순번 시작값이 음수면 저장이 거부된다", async () => {
    await expect(setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, -1)).rejects.toThrow();
  });

  it("등록되지 않은 counterKey로 부르면 조용히 통과하지 않고 오류가 난다", async () => {
    await expect(loadDocumentNumberFormat("unregistered-document-type")).rejects.toThrow(
      UnknownDocumentNumberCounterError,
    );
  });

  // 묶음 ④ /review R11 — 순번 시작값은 카운터 행 잠금 뒤 같은 tx로 다시 읽는다. 입력 서식에 seqStart 자리가 없어야
  // 호출자가 넘긴 값이 쓰인다고 오해하지 않는다(타입 검사 — pnpm typecheck가 판정한다).
  it("allocateDocumentNumber의 입력 서식에는 seqStart 자리가 없다", () => {
    expectTypeOf<Parameters<typeof allocateDocumentNumber>[1]["format"]>().not.toHaveProperty("seqStart");
  });

  it("구분자를 바꾼 뒤 등록분에 그 구분자가 반영된다", async () => {
    await setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEPARATOR, "-");
    const format = await loadDocumentNumberFormat("project");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format });
    expect(number).toBe("26-001");
  });
});

// 04-51 결정 ②(b) — 사용자 2026-09-28(PR #85 댓글 5861849715): 올해 카운터 발급이 1건 이상이고
// 새 시작값이 현재 시작값보다 작을 때만 거부한다. 같은 값·올리는 값은 통과한다. saveSeqStart는 설정 저장 액션(app/(app)/admin/settings/actions.ts
// setSimpleSettingAction)이 부르는 도메인 함수를 그대로 부른다("use server" 파일은
// Vitest에서 import할 수 없다).
describe("순번 시작값 낮추기(결정 ②)", () => {
  const NOW = new Date("2026-06-01T03:00:00Z");
  const YEAR = 2026;

  async function saveSeqStart(viewer: Viewer, value: number): Promise<void> {
    await setSimpleSettingValue(viewer, DOCUMENT_NUMBER_PROJECT_SEQ_START, value, NOW);
  }

  async function allocate(year = YEAR): Promise<string> {
    const format = await loadDocumentNumberFormat("project");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year, format });
    return number;
  }

  // 공통 준비: 시작값 100으로 올해 셋(표시 순번 100 · 101 · 102).
  async function issueThreeFrom100(): Promise<string[]> {
    await saveSeqStart(SYSTEM_VIEWER, 100);
    return [await allocate(), await allocate(), await allocate()];
  }

  it("준비: 시작값 100으로 올해 매긴 번호는 26100 · 26101 · 26102다", async () => {
    expect(await issueThreeFrom100()).toEqual(["26100", "26101", "26102"]);
  });

  it("50으로 낮추면 거부되고(필드 오류 문구) 설정 값은 100 그대로다", async () => {
    await issueThreeFrom100();
    const rejected = saveSeqStart(SYSTEM_VIEWER, 50);
    await expect(rejected).rejects.toBeInstanceOf(SeqStartOverlapError);
    await expect(rejected).rejects.toHaveProperty("message", "순번 시작값은 현재 값(100)보다 낮출 수 없음");
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
  });

  // PR #85 댓글 5864259502 항목 1(사용자 2026-09-28) — 거부 문구 숫자는 현재 시작값이다. 올린 뒤에는 카운터 + 시작값 − 1이 매긴 적 없는 번호라서.
  it("올린 뒤 낮추면(100 → 110 → 105) 현재 값 110 기준 문구로 거부되고 값은 110 그대로다", async () => {
    await issueThreeFrom100();
    await saveSeqStart(SYSTEM_VIEWER, 110);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(110);
    const rejected = saveSeqStart(SYSTEM_VIEWER, 105);
    await expect(rejected).rejects.toBeInstanceOf(SeqStartOverlapError);
    await expect(rejected).rejects.toHaveProperty("message", "순번 시작값은 현재 값(110)보다 낮출 수 없음");
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(110);
  });

  // 04-51 결정 ②(b) — 사용자 2026-09-28(PR #85 댓글 5861849715): 표시 순번 = 카운터 + 시작값 − 1이라 올리면 다음 번호가 이미 매긴 최대보다 크다.
  it.each([
    [101, "26104"],
    [102, "26105"],
  ])("이미 매긴 최대 102 이하여도 올린 값 %i은 저장되고 다음 번호 %s는 겹치지 않는다", async (value, expected) => {
    const issued = await issueThreeFrom100();
    await saveSeqStart(SYSTEM_VIEWER, value);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(value);
    const next = await allocate();
    expect(next).toBe(expected);
    expect(issued).not.toContain(next);
  });

  // 04-51 리뷰 B1 — 설정 화면은 칸을 벗어날 때마다(blur) 값을 다시 보낸다.
  it("현재 값 100을 그대로 다시 저장하면 통과하고 값은 100 그대로다", async () => {
    const issued = await issueThreeFrom100();
    await saveSeqStart(SYSTEM_VIEWER, 100);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
    expect(issued).not.toContain(await allocate());
  });

  it("기본값 1로 올해 첫 번호를 매긴 뒤 1을 그대로 다시 저장해도 통과한다", async () => {
    expect(await allocate()).toBe("26001");
    await saveSeqStart(SYSTEM_VIEWER, 1);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(1);
  });

  it("103은 저장되고 다음 번호가 이미 매긴 번호와 겹치지 않는다", async () => {
    const issued = await issueThreeFrom100();
    await saveSeqStart(SYSTEM_VIEWER, 103);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(103);

    const next = [await allocate(), await allocate()];
    for (const number of next) expect(issued).not.toContain(number);
    expect(next).toEqual(["26106", "26107"]);
  });

  it("올해 매긴 번호가 없으면(작년 번호만 있으면) 어떤 값으로 낮춰도 저장된다", async () => {
    await saveSeqStart(SYSTEM_VIEWER, 100);
    await allocate(2025);
    await saveSeqStart(SYSTEM_VIEWER, 1);
    expect(await allocate()).toBe("26001");
  });

  it("다른 설정 키 저장은 이 검증을 지나지 않는다", async () => {
    await issueThreeFrom100();
    await setSimpleSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS, 1, NOW);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS)).toBe(1);
  });

  it("설정 쓰기 권한이 없으면 현재 값을 알리지 않고 권한 거부로 끝난다", async () => {
    await issueThreeFrom100();
    const pmViewer: Viewer = { id: `pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    const rejected = saveSeqStart(pmViewer, 50);
    await expect(rejected).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rejected).rejects.toHaveProperty("message", "설정 변경 권한 없음");
  });

  // 04-51 리뷰 S1 — 등록은 서식을 트랜잭션 전에 읽는다. 그 사이 시작값이 바뀌어도(올해 카운터 행이
  // 아직 없는 해 첫날 등) 번호는 카운터 행 잠금 뒤 같은 트랜잭션에서 다시 읽은 시작값으로 매긴다.
  it("등록이 옛 서식(시작값 100)을 읽은 뒤 시작값이 1로 저장되면 번호는 1로 매긴다", async () => {
    await saveSeqStart(SYSTEM_VIEWER, 100);
    const staleFormat = await loadDocumentNumberFormat("project");
    await saveSeqStart(SYSTEM_VIEWER, 1);
    const { number } = await db.transaction((tx) =>
      allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: YEAR, format: staleFormat }, tx),
    );
    expect(number).toBe("26001");
  });

  // 04-51 리뷰 S1 — 시작값 저장은 채번과 같은 카운터 행 잠금을 잡고 검증·저장한다. 커밋 전 등록이 올해
  // 첫 번호(26100)를 잡고 있으면 저장은 그 커밋을 기다렸다가 판정한다.
  it("커밋 전 등록이 올해 첫 번호를 잡고 있으면 시작값 1 저장은 그 커밋 뒤 거부된다", async () => {
    await saveSeqStart(SYSTEM_VIEWER, 100);
    const format = await loadDocumentNumberFormat("project");
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let markAllocated!: () => void;
    const allocated = new Promise<void>((resolve) => (markAllocated = resolve));
    const registration = db.transaction(async (tx) => {
      const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: YEAR, format }, tx);
      markAllocated();
      await released;
      return number;
    });
    await allocated;
    const saveResult = saveSeqStart(SYSTEM_VIEWER, 1).then(
      () => null,
      (error: unknown) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();

    expect(await registration).toBe("26100");
    expect(await saveResult).toBeInstanceOf(SeqStartOverlapError);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
  });

  // 04-51 리뷰 S1 — 반대 순서: 시작값 저장이 카운터 행 잠금을 잡은 채 커밋 전이면 등록은 그 커밋을
  // 기다렸다가 새 시작값으로 매긴다(저장 트랜잭션 안을 lockDocumentCounter + 같은 tx 저장으로 재현).
  it("커밋 전 시작값 저장(1)이 카운터 행을 잠그고 있으면 등록은 그 커밋 뒤 1로 매긴다", async () => {
    await saveSeqStart(SYSTEM_VIEWER, 100);
    const format = await loadDocumentNumberFormat("project");
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    const save = db.transaction(async (tx) => {
      expect(await lockDocumentCounter(SYSTEM_VIEWER, "project", String(YEAR), tx)).toBe(0);
      await upsertSimpleValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START.key, 1, null, tx);
      markLocked();
      await released;
    });
    await locked;
    const registration = db.transaction((tx) =>
      allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: YEAR, format }, tx),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await save;

    expect((await registration).number).toBe("26001");
  });

  // 04-51 리뷰 S2 — 설정 화면은 칸의 글자를 그대로 보낸다(z.coerce.number()가 숫자로 바꾼다).
  it("화면이 보내는 문자열 값도 같은 규칙이다 — \"50\" 거부 · \"100\" 그대로 통과 · \"103\" 저장", async () => {
    await issueThreeFrom100();
    await expect(setSimpleSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, "50", NOW)).rejects.toHaveProperty(
      "message",
      "순번 시작값은 현재 값(100)보다 낮출 수 없음",
    );
    await setSimpleSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, "100", NOW);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
    await setSimpleSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, "103", NOW);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(103);
  });

  // 묶음 ④ /review T3 — 스키마를 못 지나는 값은 낮추기 판정(잠금·비교) 전에 setSettingValue의 스키마 거부로 끝난다.
  // "0"은 스키마(min(0))를 지나 낮추기 판정으로 가므로 이 목록에 없다(0 < 100이면 SeqStartOverlapError).
  it.each(["-5", "abc", "1.5"])("형식이 틀린 값 %s는 낮추기 거부가 아니라 형식 거부로 끝나고 값은 100 그대로다", async (value) => {
    await issueThreeFrom100();
    const rejected = setSimpleSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, value, NOW);
    await expect(rejected).rejects.toThrow();
    await expect(rejected).rejects.not.toBeInstanceOf(SeqStartOverlapError);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
  });

  // 04-51 리뷰 S2 — 실제 등록 경로(createProject, UNIQUE(format_key, number) 살아 있음)로 낮추기 시도 뒤에도
  // 등록이 번호 중복으로 실패하지 않는다. 카운터 행이 없는 새해(2027) 첫 등록까지.
  // (b): 이미 매긴 최대 이하로 올려도 실제 등록이 UNIQUE 위반 없이 된다.
  it("createProject로 등록 — 낮추기 시도가 거부된 뒤에도, 새해에 낮춘 뒤에도 등록이 겹침 없이 된다", async () => {
    const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
    const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
      email: `pm-${randomUUID()}@example.test`,
      name: "순번 시작값 테스트 PM",
      roleId: DEFAULT_ROLE_ID,
    });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const register = async (now: Date): Promise<string> =>
      (await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: `번호-${randomUUID()}` }, { now: () => now }))
        .number;
    const save = (value: string, now: Date) => setSimpleSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, value, now);

    await save("100", NOW);
    const issued = [await register(NOW), await register(NOW), await register(NOW)];
    expect(issued).toEqual(["26100", "26101", "26102"]);
    for (const lowered of ["1", "50", "99"]) await expect(save(lowered, NOW)).rejects.toBeInstanceOf(SeqStartOverlapError);
    await save("100", NOW);
    const after = [await register(NOW), await register(NOW)];
    expect(after).toEqual(["26103", "26104"]);
    await save("102", NOW);
    expect(await register(NOW)).toBe("26107");

    const NEW_YEAR = new Date("2026-12-31T15:30:00Z"); // 2027-01-01 00:30 KST — 2027 카운터 행 없음
    await save("1", NEW_YEAR);
    expect([await register(NEW_YEAR), await register(NEW_YEAR)]).toEqual(["27001", "27002"]);

    const numbers = (await db.select({ number: projects.number }).from(projects)).map((row) => row.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("공통: 시작값을 올린 뒤에도 두 연결이 동시에 매긴 번호는 서로 다르다", async () => {
    const issued = await issueThreeFrom100();
    await saveSeqStart(SYSTEM_VIEWER, 103);
    const format = await loadDocumentNumberFormat("project");
    const [a, b] = await Promise.all([
      db.transaction((tx) => allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: YEAR, format }, tx)),
      db.transaction((tx) => allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: YEAR, format }, tx)),
    ]);
    expect(a.number).not.toBe(b.number);
    expect(issued).not.toContain(a.number);
    expect(issued).not.toContain(b.number);
  });
});
