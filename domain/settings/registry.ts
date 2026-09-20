import type { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import {
  findSimpleValue as defaultFindSimpleValue,
  upsertSimpleValue as defaultUpsertSimpleValue,
  findEffectiveValue as defaultFindEffectiveValue,
  listHistory as defaultListHistory,
  insertHistorizedValue as defaultInsertHistorizedValue,
  deleteFutureHistorizedValue as defaultDeleteFutureHistorizedValue,
} from "@/repositories/settings";

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
  default?: T;
  /** 미래 페이즈가 읽을 키의 예외 표시 — 미사용 키 검출에서 제외되되 목록으로 남는다. */
  readBy?: { phase: string };
};

export class SettingNotFoundError extends Error {}
export class ForbiddenError extends Error {}
export class SettingKindMismatchError extends Error {}
export class FutureCancelOnlyError extends Error {}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
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
};

// Phase 4 계약: 정의 객체(키 문자열이 아니다)를 넘겨 반환 타입을 추론한다.
// opts.asOf는 이력형 키에서만 쓰이고 비이력형은 무시한다. 「어느 날짜를
// 넘길지」는 호출자의 책임이다 — 원천징수·회사 대납은 지급일(미지급이면
// 지급 예정일), 부가세는 증빙일(없으면 작성일)이라는 규칙(Eng OV-5)은
// Phase 4의 금액 모듈이 결정해 asOf로 넘긴다. 읽기는 권한 판정을 거치지
// 않는다 — 설정 값은 domain 전역에서 자유롭게 읽히는 계산 입력이고, 게이트는
// 설정 "화면"(admin.settings 보기 권한)에 있다.
export async function getSettingValue<T>(
  def: SettingDef<T>,
  opts?: { asOf?: Date },
  deps?: Partial<RegistryDeps>,
): Promise<T> {
  if (def.kind === "historized") {
    const findEffectiveValue = deps?.findEffectiveValue ?? defaultFindEffectiveValue;
    const asOf = dateOnly(opts?.asOf ?? new Date());
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
  return def.schema.parse(row.value);
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
  if (!allowed) throw new ForbiddenError("설정을 바꿀 권한이 없습니다.");

  const parsed = def.schema.parse(value);
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
  if (!allowed) throw new ForbiddenError("설정을 바꿀 권한이 없습니다.");

  const parsed = def.schema.parse(input.value);
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
  if (!allowed) throw new ForbiddenError("설정을 바꿀 권한이 없습니다.");

  const today = dateOnly(new Date());
  if (effectiveFrom <= today) {
    throw new FutureCancelOnlyError("이미 적용된 이력 행은 취소할 수 없습니다 — 미래로 예정된 행만 취소할 수 있습니다.");
  }

  const deleteFutureHistorizedValue = deps?.deleteFutureHistorizedValue ?? defaultDeleteFutureHistorizedValue;
  await deleteFutureHistorizedValue(viewer, def.key, effectiveFrom);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "settings_change",
    entity: "settings_historized",
    entityId: def.key,
    detail: { key: def.key, effectiveFrom, cancelled: true },
  });
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
