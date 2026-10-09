import type { z } from "zod";
import type { NumberInputKind } from "@/lib/format-number";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { seoulToday } from "@/lib/dates";
import { log } from "@/lib/log";
import { withTransaction as defaultWithTransaction } from "@/lib/db-transaction";
import {
  findSimpleValue as defaultFindSimpleValue,
  findSimpleValues as defaultFindSimpleValues,
  upsertSimpleValue as defaultUpsertSimpleValue,
  findEffectiveValue as defaultFindEffectiveValue,
  listHistory as defaultListHistory,
  insertHistorizedValue as defaultInsertHistorizedValue,
  deleteFutureHistorizedValue as defaultDeleteFutureHistorizedValue,
} from "@/repositories/settings";
import { listCodeItems as repoListCodeItems } from "@/repositories/code-tables";

// ADMN-05·06: 설정 레지스트리 — Phase 4가 호출할 시점 기준 유효값 조회 계약
// (03-04 Task 1 확정안, docs/ARCHITECTURE.md §4-2 참고). lib/env.ts와 근본적으로
// 다른 저장소다: 프로세스 시작 시 1회 파싱이 아니라 DB 런타임 조회이고, 화면에서
// 바꾸면 재배포 없이 즉시 반영된다.
//
// 레지스트리는 반올림·절사를 하지 않는다 — 스키마는 범위와 타입만 본다.
// 절사 단위·방식은 그 자체가 설정 값이고, 그것을 적용하는 계산은 Phase 4의
// 금액 모듈(domain/money) 몫이다.
export type SettingKind = "simple" | "historized";

export type SettingDef<T> = {
  key: string;
  kind: SettingKind;
  schema: z.ZodType<T>;
  /** 화면에 보이는 짧은 이름. */
  label: string;
  /** 한 문장 힌트(최대 한 줄) — 긴 설명은 두지 않는다(이 플랜 objective 결정). */
  hint?: string;
  /** 설정 화면 섹션 이름. */
  namespace: string;
  /** number 타입 칸의 쉼표 입력 종류(04-09, UI-SPEC S15) — 금액·비율·개수라
   * 식별자가 아닌 number 칸만 지정한다. 없으면 기존 숫자 칸(type="number")
   * 그대로 렌더한다(자릿수 설정처럼 식별자에 가까운 값은 지정하지 않는다). */
  numberKind?: NumberInputKind;
  default?: T;
  /** 비이력형 전용 — 저장값이 스키마를 못 지나면 읽기가 default로 대체하고 log.error를 남긴다(쓰기 검증은 그대로). PR #104 /review 2차 A(2), 사용자 2026-09-30. */
  readInvalidAsDefault?: true;
  /** 미래 페이즈가 읽을 키의 예외 표시 — 미사용 키 검출에서 제외되되 목록으로 남는다. */
  readBy?: { phase: string };
  /** 04.1(U3): enum 값 → 화면 라벨. 동작(설정 화면 배선)은 04.1-04. */
  optionLabels?: Record<string, string>;
  /** 04.1(U3): 선택지를 지금의 계급·조직 목록으로 채우는 칸. 동작은 04.1-04. */
  dynamicOptions?: "roles" | "org_units";
  /** 04.1: 이력형 키의 적용 시작일 규칙(연차 일수 = 1월 1일). 동작은 04.1-03·04. */
  effectiveFromRule?: "year_start";
  /** 05-04(UI-SPEC S13): number 칸 값 옆 정적 단위 글자(예: `MB`) — 단위를 입력 안에 넣지 않는다(SYSTEM §7-2). */
  unitLabel?: string;
  /** 짝 격자 입력 — 행 · 열 코드표 키와 값 객체의 행 · 열 칸 이름(SYSTEM §7-2 짝 격자 · §7-13). */
  pairGrid?: { rows: string; cols: string; rowField: string; colField: string };
};

export class SettingNotFoundError extends UserFacingError {}
export class ForbiddenError extends UserFacingError {}
export class SettingKindMismatchError extends UserFacingError {}
export class FutureCancelOnlyError extends UserFacingError {}
export class FutureValueNotFoundError extends UserFacingError {}
export class EffectiveFromRuleError extends UserFacingError {}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// 04.1-04(ENG-5): 적용 시작일 규칙의 공통 검증 — 일반 저장 · JSON 가져오기 · 이력 취소가
// 모두 이 함수를 부른다. 규칙 없는 키는 null(기존 동작 그대로). `year_start` 키는 날짜로
// 해석해(접미사 검사가 아니다) 실재하는 YYYY-01-01만, `today`(서울 날짜)의 연도 이후만 받는다.
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type EffectiveFromViolation = { reason: "format" | "past_year"; message: string };

export function validateEffectiveFrom(
  def: SettingDef<unknown>,
  effectiveFrom: string,
  today: string,
): EffectiveFromViolation | null {
  if (def.effectiveFromRule !== "year_start") return null;
  const match = DATE_PATTERN.exec(effectiveFrom);
  const year = Number(match?.[1]);
  if (!match || year < 1 || match[2] !== "01" || match[3] !== "01") {
    return { reason: "format", message: "적용 시작일은 1월 1일만 · 2027-01-01처럼 적기" };
  }
  if (year < Number(today.slice(0, 4))) {
    return { reason: "past_year", message: "지난 연도 변경 불가 · 지난 잔고는 사람 상세의 연차 조정으로 고치기" };
  }
  return null;
}

// 정규형 YYYY-MM-DD이고 실재하는 날짜인가(이력 취소 전용 — B-NEW01).
function isCanonicalDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return year >= 1 && daysInMonth !== undefined && day >= 1 && day <= daysInMonth;
}

export type RegistryDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  findSimpleValue: typeof defaultFindSimpleValue;
  upsertSimpleValue: typeof defaultUpsertSimpleValue;
  findEffectiveValue: typeof defaultFindEffectiveValue;
  listHistory: typeof defaultListHistory;
  insertHistorizedValue: typeof defaultInsertHistorizedValue;
  deleteFutureHistorizedValue: typeof defaultDeleteFutureHistorizedValue;
  withTransaction: typeof defaultWithTransaction;
  // 짝 격자 키의 새 짝 검증 — 코드표의 활성 · 보관 안 된 값(PR #171 리뷰 P3-3).
  listActiveCodeValues: (tableKey: string) => Promise<string[]>;
  // 04.1-04: 적용 시작일 규칙 · 「이미 적용됨」 판정의 서울 오늘 기준 시각(테스트 주입).
  now: Date;
};

// Phase 4 계약: 정의 객체(키 문자열이 아니다)를 넘겨 반환 타입을 추론한다.
// opts.asOf는 이력형 키에서만 쓰이고 비이력형은 무시한다. 「어느 날짜를
// 넘길지」는 호출자의 책임이다 — 원천징수·회사 대납은 지급일(미지급이면
// 지급 예정일), 부가세는 증빙일(없으면 작성일)이라는 규칙(Eng OV-5)은
// Phase 4의 금액 모듈이 결정해 asOf로 넘긴다. asOf를 생략하면 서울 오늘이고,
// 넘길 때는 seoulDateToUtcDate로 만든 UTC 자정 Date여야 한다(앞 10자를 날짜로
// 쓴다 — 현재 시각 Date를 넘기면 KST 0~9시에 하루 밀린다). 읽기는 권한 판정을 거치지
// 않는다 — 설정 값은 domain 전역에서 자유롭게 읽히는 계산 입력이고, 게이트는
// 설정 "화면"(admin.settings 보기 권한)에 있다.
export async function getSettingValue<T>(
  def: SettingDef<T>,
  opts?: { asOf?: Date },
  deps?: Partial<RegistryDeps>,
): Promise<T> {
  if (def.kind === "historized") {
    const findEffectiveValue = deps?.findEffectiveValue ?? defaultFindEffectiveValue;
    const asOf = opts?.asOf ? dateOnly(opts.asOf) : seoulToday(deps?.now);
    const row = await findEffectiveValue(SYSTEM_VIEWER, def.key, asOf);
    if (!row) {
      if (def.default !== undefined) return def.default;
      throw new SettingNotFoundError(`설정 키 '${def.key}'에 유효한 값이 없습니다.`);
    }
    return def.schema.parse(row.value);
  }

  const findSimpleValue = deps?.findSimpleValue ?? defaultFindSimpleValue;
  const row = await findSimpleValue(SYSTEM_VIEWER, def.key);
  if (!row) {
    if (def.default !== undefined) return def.default;
    throw new SettingNotFoundError(`설정 키 '${def.key}'에 값이 없습니다.`);
  }
  return parseStoredSimpleValue(def, row.value);
}

// 비이력형 읽기 전용. readInvalidAsDefault 표시가 있고 default가 있는 키만 허용 밖 저장값을
// default로 대체한다 — 로그에는 키와 zod 오류 코드만 남기고 원래 값은 넣지 않는다.
function parseStoredSimpleValue<T>(def: SettingDef<T>, raw: unknown): T {
  if (!def.readInvalidAsDefault || def.default === undefined) return def.schema.parse(raw);
  const parsed = def.schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  log.error("settings.invalid_stored_value", { key: def.key, issues: parsed.error.issues.map((issue) => issue.code) });
  return def.default;
}

async function defaultListActiveCodeValues(tableKey: string): Promise<string[]> {
  const rows = await repoListCodeItems(SYSTEM_VIEWER, {
    tableKey,
    scope: { rows: "all", includeArchived: false },
    includeInactive: false,
  });
  return rows.map((row) => row.value);
}

// 짝 격자 칸의 두 축(코드표 값 · 이름 · 활성 · 보관 시각). 결재선 옵션(listApprovalRouteOptions)과 같은 결로 설정 보기 권한만
// 보고 리포지토리에서 읽는다 — 코드표 메뉴 권한(scopeFor("code_items"))으로 읽으면 설정 권한만 있는 계급은 빈 격자를 본다(PR #171 Codex).
// 보관 값은 저장된 짝에 남은 것만 화면에 「(보관됨)」으로 보인다(pairGridAxis).
export async function listPairGridAxisItems(
  viewer: Viewer,
  tableKey: string,
  deps?: Partial<RegistryDeps>,
): Promise<{ value: string; label: string; active: boolean; archivedAt: Date | null }[]> {
  const can = deps?.can ?? defaultCan;
  if (!(await can(viewer, "admin.settings", "view"))) throw new ForbiddenError("설정 보기 권한 없음");
  const rows = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: true }, includeInactive: true });
  return rows.map((row) => ({ value: row.value, label: row.label, active: row.active, archivedAt: row.archivedAt }));
}

// 짝 격자 키(`pairGrid`)는 새로 더해진 짝이 두 코드표의 활성 값만 가리켜야 한다 — 보관 값으로 새 짝을 만들 수 없다
// (디자인 검토 F-1). 이미 저장된 짝은 그대로 두거나 지울 수 있다(「조용히 지우지 않는다」 · 해제 가능).
export async function assertNewPairsActive<T>(def: SettingDef<T>, value: T, deps?: Partial<RegistryDeps>): Promise<void> {
  const grid = def.pairGrid;
  if (!grid || !Array.isArray(value)) return;
  const findSimpleValue = deps?.findSimpleValue ?? defaultFindSimpleValue;
  const stored = (await findSimpleValue(SYSTEM_VIEWER, def.key))?.value;
  const storedPairs = Array.isArray(stored) ? (stored as Record<string, unknown>[]) : [];
  const isStored = (pair: Record<string, unknown>) =>
    storedPairs.some((old) => old[grid.rowField] === pair[grid.rowField] && old[grid.colField] === pair[grid.colField]);
  const added = (value as Record<string, unknown>[]).filter((pair) => !isStored(pair));
  if (added.length === 0) return;
  const listActive = deps?.listActiveCodeValues ?? defaultListActiveCodeValues;
  const [rowValues, colValues] = await Promise.all([listActive(grid.rows), listActive(grid.cols)]);
  const rowActive = new Set(rowValues);
  const colActive = new Set(colValues);
  const stale = added.some(
    (pair) => !rowActive.has(String(pair[grid.rowField])) || !colActive.has(String(pair[grid.colField])),
  );
  if (stale) throw new UserFacingError("보관된 값으로 새 짝 불가 · 새로 고침");
}

// 비이력형 전용. 이력형 키에 부르면 거부한다.
export async function setSettingValue<T>(
  viewer: Viewer,
  def: SettingDef<T>,
  value: T,
  deps?: Partial<RegistryDeps>,
): Promise<void> {
  if (def.kind !== "simple") {
    throw new SettingKindMismatchError(`'${def.key}'는 이력형 키입니다 — addHistorizedValue를 쓰세요.`);
  }

  const can = deps?.can ?? defaultCan;
  const allowed = await can(viewer, "admin.settings", "write");
  if (!allowed) throw new ForbiddenError("설정 변경 권한 없음");

  const parsed = def.schema.parse(value);
  await assertNewPairsActive(def, parsed, deps);
  const upsertSimpleValue = deps?.upsertSimpleValue ?? defaultUpsertSimpleValue;
  await upsertSimpleValue(viewer, def.key, parsed, viewer.id);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "settings_change",
    entity: "settings_simple",
    entityId: def.key,
    detail: { key: def.key },
  });
}

// 이력형 전용. 같은 (key, effectiveFrom) 재삽입은 리포지토리의 복합
// UNIQUE가 그대로 거부한다(domain이 삼키지 않는다 — 호출자가 원인을 안다).
export async function addHistorizedValue<T>(
  viewer: Viewer,
  def: SettingDef<T>,
  input: { effectiveFrom: string; value: T },
  deps?: Partial<RegistryDeps>,
): Promise<void> {
  if (def.kind !== "historized") {
    throw new SettingKindMismatchError(`'${def.key}'는 비이력형 키입니다 — setSettingValue를 쓰세요.`);
  }

  const can = deps?.can ?? defaultCan;
  const allowed = await can(viewer, "admin.settings", "write");
  if (!allowed) throw new ForbiddenError("설정 변경 권한 없음");

  const parsed = def.schema.parse(input.value);
  const violation = validateEffectiveFrom(def, input.effectiveFrom, seoulToday(deps?.now));
  if (violation) throw new EffectiveFromRuleError(violation.message);

  const insertHistorizedValue = deps?.insertHistorizedValue ?? defaultInsertHistorizedValue;
  await insertHistorizedValue(viewer, {
    key: def.key,
    effectiveFrom: input.effectiveFrom,
    value: parsed,
    by: viewer.id,
  });

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "settings_change",
    entity: "settings_historized",
    entityId: def.key,
    detail: { key: def.key, effectiveFrom: input.effectiveFrom },
  });
}

// 과거 행 수정·삭제 함수는 만들지 않는다 — 이 함수만 있고, 그것도 적용
// 시작일이 오늘 이전(이미 적용됨)이면 거부한다. append-only가 이력 표의
// 유일한 쓰기 규칙이다.
export async function cancelHistorizedValue<T>(
  viewer: Viewer,
  def: SettingDef<T>,
  effectiveFrom: string,
  deps?: Partial<RegistryDeps>,
): Promise<void> {
  if (def.kind !== "historized") {
    throw new SettingKindMismatchError(`'${def.key}'는 비이력형 키입니다.`);
  }

  const can = deps?.can ?? defaultCan;
  const allowed = await can(viewer, "admin.settings", "write");
  if (!allowed) throw new ForbiddenError("설정 변경 권한 없음");

  if (def.effectiveFromRule === "year_start") {
    const violation = validateEffectiveFrom(def, effectiveFrom, seoulToday(deps?.now));
    if (violation) throw new EffectiveFromRuleError(violation.message);
  } else if (!isCanonicalDate(effectiveFrom)) {
    // 삭제 경로라 정규형이 아니면 아래 문자열 대소 판정이 공허해진다("J" > "2").
    throw new EffectiveFromRuleError("적용 시작일은 2027-01-01처럼 적기");
  }

  const today = seoulToday(deps?.now);
  if (effectiveFrom <= today) {
    throw new FutureCancelOnlyError("이미 적용된 이력 행은 취소할 수 없음 — 미래로 예정된 행만 취소 가능");
  }

  // quick 261001-hfi — 삭제와 settings_change 기록을 한 트랜잭션에 묶는다(85g 발령 취소와 같은 모양 · ADMN-12 예약 취소 예외의 전제).
  const deleteFutureHistorizedValue = deps?.deleteFutureHistorizedValue ?? defaultDeleteFutureHistorizedValue;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const withTransaction = deps?.withTransaction ?? defaultWithTransaction;
  const listHistory = deps?.listHistory ?? defaultListHistory;
  await withTransaction(async (tx) => {
    const deleted = await deleteFutureHistorizedValue(viewer, def.key, effectiveFrom, tx);
    if (!deleted) {
      // quick 261002-3mx — 위 판정 뒤 KST 자정이 지나면 삭제 조건(DB 시각)이 막는다: 행이 있으면 방금 적용된 것이다.
      if ((await listHistory(viewer, def.key, tx)).some((row) => row.effectiveFrom === effectiveFrom)) {
        throw new FutureCancelOnlyError("이미 적용된 이력 행은 취소할 수 없음 — 미래로 예정된 행만 취소 가능");
      }
      throw new FutureValueNotFoundError("취소할 예정값 찾을 수 없음");
    }
    await recordAction(
      viewer,
      {
        actionType: "settings_change",
        entity: "settings_historized",
        entityId: def.key,
        detail: { key: def.key, effectiveFrom, cancelled: true },
      },
      { tx },
    );
  });
}

// 설정 화면(app/(app)/admin/settings)이 registry 타입 → §7-2 입력 매핑을
// 계산하는 지점. zod 내부 클래스에 의존하지 않고 공개 런타임 속성(schema.type
// 등)만 읽는다 — 화면 코드에 zod 타입 판정을 다시 흩뿌리지 않는다.
export type SettingFieldDescriptor =
  | { kind: "boolean" }
  | { kind: "number"; numberKind?: NumberInputKind }
  | { kind: "string" }
  | { kind: "enum"; options: string[] }
  | { kind: "multi-enum"; options: string[] }
  | { kind: "pair-grid"; rows: string; cols: string; rowField: string; colField: string };

function zodTypeName(schema: unknown): string | undefined {
  if (schema && typeof schema === "object" && "type" in schema) {
    const type = schema.type;
    return typeof type === "string" ? type : undefined;
  }
  return undefined;
}

function zodEnumOptions(schema: unknown): string[] {
  if (schema && typeof schema === "object" && "options" in schema) {
    const options = schema.options;
    if (Array.isArray(options)) return options.filter((option): option is string => typeof option === "string");
  }
  return [];
}

// z.preprocess로 감싼 스키마(pipe)는 바깥 검증 쪽(out)의 모양으로 서술한다.
function unwrapPipe(schema: unknown): unknown {
  if (zodTypeName(schema) === "pipe" && schema && typeof schema === "object" && "out" in schema) return schema.out;
  return schema;
}

function zodArrayElement(schema: unknown): unknown {
  if (schema && typeof schema === "object" && "element" in schema) {
    return schema.element;
  }
  return undefined;
}

export function describeSettingField(def: SettingDef<unknown>): SettingFieldDescriptor {
  if (def.pairGrid) return { kind: "pair-grid", ...def.pairGrid };
  const schema = unwrapPipe(def.schema);
  const typeName = zodTypeName(schema);
  if (typeName === "boolean") return { kind: "boolean" };
  if (typeName === "number") return { kind: "number", numberKind: def.numberKind };
  if (typeName === "enum") return { kind: "enum", options: zodEnumOptions(schema) };
  if (typeName === "array") {
    const element = zodArrayElement(schema);
    if (zodTypeName(element) === "enum") return { kind: "multi-enum", options: zodEnumOptions(element) };
  }
  return { kind: "string" };
}

export type HistorizedEntry<T> = { effectiveFrom: string; value: T };

// 이력 목록 화면(§7-14)이 쓰는 읽기 전용 조회 — 적용 시작일 내림차순.
export async function listSettingHistory<T>(
  def: SettingDef<T>,
  deps?: Partial<RegistryDeps>,
): Promise<HistorizedEntry<T>[]> {
  if (def.kind !== "historized") return [];
  const listHistory = deps?.listHistory ?? defaultListHistory;
  const rows = await listHistory(SYSTEM_VIEWER, def.key);
  return rows.map((row) => ({ effectiveFrom: row.effectiveFrom, value: def.schema.parse(row.value) }));
}

export type SimpleSettingValues<Defs extends readonly SettingDef<unknown>[]> = {
  [K in keyof Defs]: Defs[K] extends SettingDef<infer V> ? V | undefined : never;
};

// 형식이 맞지 않는 저장값은 그 칸만 기본값으로 본다(PR #105 · Codex r4141687065 후속) — 설정 화면(보기 · 경고 ·
// 결재선 단계 저장의 기대값 비교)이 한 칸 때문에 열리지 않거나 저장이 늘 거부되면 고칠 길이 없다. 계산 경로(결재선
// 로더 등)는 그대로 엄격하다.
export function simpleValueOrDefault<T>(def: SettingDef<T>, row: { value: unknown } | undefined): T | undefined {
  if (!row) return def.default;
  const parsed = def.schema.safeParse(row.value);
  return parsed.success ? parsed.data : def.default;
}

export async function getSimpleSettingValuesOrDefault<const Defs extends readonly SettingDef<unknown>[]>(
  defs: Defs,
  deps?: { findSimpleValues?: typeof defaultFindSimpleValues },
): Promise<SimpleSettingValues<Defs>> {
  const findSimpleValues = deps?.findSimpleValues ?? defaultFindSimpleValues;
  const rows = await findSimpleValues(
    SYSTEM_VIEWER,
    defs.map((def) => def.key),
  );
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return defs.map((def) => simpleValueOrDefault(def, byKey.get(def.key))) as SimpleSettingValues<Defs>;
}

// 04.1(Codex HIGH 스냅숏): 비이력형 키 여러 개를 findSimpleValues **한 번**(SELECT
// 한 문장)으로 읽어 정의 순서대로 돌려준다 — 행이 있으면 parseStoredSimpleValue로
// 읽는다. readInvalidAsDefault 표시와 default가 있는 키는 허용 밖 저장값을 default로
// 바꾸고 log.error를 남기며, 그 밖의 키는 schema.parse가 던진다. 행이 없으면
// default, default도 없으면 undefined(던지지 않는다 — 호출자가 정한다).
// 이력형이 섞이면 거부한다.
export async function getSimpleSettingValues<const Defs extends readonly SettingDef<unknown>[]>(
  defs: Defs,
  deps?: Partial<Pick<RegistryDeps, "findSimpleValue">> & { findSimpleValues?: typeof defaultFindSimpleValues },
): Promise<SimpleSettingValues<Defs>> {
  const historized = defs.find((def) => def.kind !== "simple");
  if (historized) {
    throw new SettingKindMismatchError(`'${historized.key}'는 이력형 키입니다 — 일괄 읽기는 비이력형 키만 받습니다.`);
  }
  const findSimpleValues = deps?.findSimpleValues ?? defaultFindSimpleValues;
  const rows = await findSimpleValues(
    SYSTEM_VIEWER,
    defs.map((def) => def.key),
  );
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return defs.map((def) => (byKey.has(def.key) ? parseStoredSimpleValue(def, byKey.get(def.key)) : def.default)) as SimpleSettingValues<Defs>;
}

// 05-03(B1 Round 2): 이력형 값 + 그 값을 낸 이력 행의 id · 적용일 — 지출결의 세금 스냅숏이 세율과 함께 값으로 복사한다.
// asOf 계약은 getSettingValue와 같다(생략 = 서울 오늘, 넘길 때는 seoulDateToUtcDate의 UTC 자정). 행이 없으면 기본값 + null.
export async function getSettingEntry<T>(
  def: SettingDef<T>,
  opts?: { asOf?: Date },
  deps?: Partial<Pick<RegistryDeps, "findEffectiveValue" | "now">>,
): Promise<{ value: T; historizedId: string | null; effectiveFrom: string | null }> {
  if (def.kind !== "historized") {
    throw new SettingKindMismatchError(`'${def.key}'는 비이력형 키입니다 — 이력 행 읽기는 이력형 키만 받습니다.`);
  }
  const findEffectiveValue = deps?.findEffectiveValue ?? defaultFindEffectiveValue;
  const asOf = opts?.asOf ? dateOnly(opts.asOf) : seoulToday(deps?.now);
  const row = await findEffectiveValue(SYSTEM_VIEWER, def.key, asOf);
  if (!row) {
    if (def.default !== undefined) return { value: def.default, historizedId: null, effectiveFrom: null };
    throw new SettingNotFoundError(`설정 키 '${def.key}'에 유효한 값이 없습니다.`);
  }
  return { value: def.schema.parse(row.value), historizedId: row.id, effectiveFrom: row.effectiveFrom };
}
