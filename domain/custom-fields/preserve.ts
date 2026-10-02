// domain/custom-fields/preserve.ts — 04.5-05: 거래처 커스텀 값 쓰기 판정(순수 — DB·세션 없음).
// 순서: 없는 키 거부 → 입력 밖 존재 키 버림 → 칸마다(필수 판정 표 → 보관 선택지) → 타입 검증 → 보이지 않는 저장값 되살리기.
// 검증기(build-schema.ts)·Phase 4 경로는 바꾸지 않는다 — 거래처 경로 어댑터가 이 파일 안에 있다(UI-SPEC O11).
import { ZodError, type core } from "zod";
import { buildCustomFieldsSchema, type FieldDef, type FieldDefType } from "@/domain/custom-fields/build-schema";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// UI-SPEC 화면 3 Copywriting의 뜻을 지킨 명사형(DECISIONS 2026-09-26 오류 문구 명사형 통일).
export const REQUIRED_VALUE_EMPTY_MESSAGE = "필수 칸 비어 있음 · 값 입력";
export const REQUIRED_SELECT_EMPTY_MESSAGE = "필수 칸 비어 있음 · 선택지 고르기";
export const ARCHIVED_OPTION_MESSAGE = "보관된 선택지 · 다른 선택지 고르기";
// 정의에 없는 키(위조 요청에서만 나온다) — 새 문구 없이 koreanZodErrorMessage의 일반 줄과 같은 문자열.
export const UNKNOWN_CUSTOM_FIELD_KEY_MESSAGE = "입력값 오류 · 값 확인";

// 칸별 오류 — 액션이 validationErrors.customFields.{key}._errors로 돌려준다. message는 액션이 잡지 못했을 때의 폴백(첫 칸).
export class CustomFieldsInvalidError extends UserFacingError {
  readonly fieldErrors: Record<string, string>;
  constructor(fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] ?? UNKNOWN_CUSTOM_FIELD_KEY_MESSAGE);
    this.fieldErrors = fieldErrors;
  }
}

export class UnknownCustomFieldKeyError extends UserFacingError {
  constructor() {
    super(UNKNOWN_CUSTOM_FIELD_KEY_MESSAGE);
  }
}

export type InputFieldDef = {
  key: string;
  label: string;
  type: FieldDefType;
  options: string[];
  archivedOptions: string[];
  required: boolean;
};

export type CustomFieldsWriteInput = {
  mode: "create" | "update";
  /** 보는 사람의 입력 칸(칸 정렬 순서) */
  inputDefs: readonly InputFieldDef[];
  /** 그 대상 정의 전체 키(보관 칸 · 노출 행 없는 칸 포함) */
  knownKeys: ReadonlySet<string>;
  /** 그 거래처의 저장 객체(등록이면 빈 객체) */
  stored: Record<string, unknown>;
  submitted: Record<string, unknown>;
};

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export function resolveCustomFieldsWrite(input: CustomFieldsWriteInput): Record<string, unknown> {
  const { mode, inputDefs, knownKeys, stored, submitted } = input;

  // 없는 키 — 값이 비어 있어도 저장 전체를 거부한다(T-04.5-05).
  if (Object.keys(submitted).some((key) => !knownKeys.has(key))) throw new UnknownCustomFieldKeyError();

  // 입력 밖 존재 키(보관 · 끔 · 노출 행 없음)의 제출값은 판정 전에 버린다 — 뒤 단계는 inputDefs 키만 본다.
  const inputKeys = new Set(inputDefs.map((def) => def.key));
  const kept = Object.fromEntries(Object.entries(submitted).filter(([key]) => inputKeys.has(key)));

  const fieldErrors = new Map<string, string>();
  const toValidate: InputFieldDef[] = [];
  const cleared = new Set<string>();
  for (const def of inputDefs) {
    const present = Object.hasOwn(kept, def.key);
    // 수정에서 키 없음 = 안 바꿈(저장값 유지). 등록에는 저장값이 없어 키 없음 = 빈칸.
    if (!present && mode === "update") continue;
    const value = kept[def.key];
    if (isEmpty(value)) {
      const storedEmpty = isEmpty(stored[def.key]);
      if (def.required && (mode === "create" || !storedEmpty)) {
        fieldErrors.set(def.key, def.type === "select" ? REQUIRED_SELECT_EMPTY_MESSAGE : REQUIRED_VALUE_EMPTY_MESSAGE);
      } else {
        cleared.add(def.key);
      }
      continue;
    }
    // 보관 선택지 — 그 거래처의 저장값과 같으면 통과(안 바꿈), 아니면 칸 오류.
    if (def.type === "select" && typeof value === "string" && def.archivedOptions.includes(value) && value !== stored[def.key]) {
      fieldErrors.set(def.key, ARCHIVED_OPTION_MESSAGE);
      continue;
    }
    toValidate.push(def);
  }

  // 타입 검증 — 기존 검증기 그대로. 필수는 위에서 판정했다. 선택지에는 저장값을 더한다(저장값이 보관 선택지일 때만).
  const schemaDefs: FieldDef[] = toValidate.map((def) => {
    const storedValue = stored[def.key];
    const keepArchived = typeof storedValue === "string" && def.archivedOptions.includes(storedValue);
    return {
      key: def.key,
      type: def.type,
      options: keepArchived ? [...def.options, storedValue] : def.options,
      required: false,
    };
  });
  const parsed = buildCustomFieldsSchema(schemaDefs).safeParse(
    Object.fromEntries(toValidate.map((def) => [def.key, kept[def.key]])),
  );
  let validated: Record<string, unknown> = {};
  if (parsed.success) {
    validated = parsed.data as Record<string, unknown>;
  } else {
    const issuesByKey = new Map<string, core.$ZodIssue[]>();
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      issuesByKey.set(key, [...(issuesByKey.get(key) ?? []), issue]);
    }
    for (const [key, issues] of issuesByKey) fieldErrors.set(key, koreanZodErrorMessage(new ZodError(issues)));
  }

  if (fieldErrors.size > 0) {
    const ordered: Record<string, string> = {};
    for (const def of inputDefs) {
      const message = fieldErrors.get(def.key);
      if (message !== undefined) ordered[def.key] = message;
    }
    throw new CustomFieldsInvalidError(ordered);
  }

  // 되살리기 — 저장값에서 시작해(입력 칸 밖 키는 그대로) 비운 칸은 빼고 검증된 값을 덮는다. 인자는 바꾸지 않는다.
  const result: Record<string, unknown> = mode === "update" ? { ...stored } : {};
  for (const key of cleared) delete result[key];
  return { ...result, ...validated };
}
