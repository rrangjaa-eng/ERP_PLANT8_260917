// 04.5-02: 선택형 칸의 선택지 편집 순수 함수 — 클라이언트 폼과 서버가 같은 규칙을 쓴다.
// targets.ts 외에는 import하지 않는다(클라이언트 폼이 import한다).
import { ACTIVE_OPTIONS_MAX } from "@/domain/custom-fields/targets";

export type OptionState = { active: string[]; archived: string[] };
export type OptionError = "empty" | "duplicate" | "limit";

export function normalizeOption(raw: string): string {
  return raw.trim();
}

// 보관 선택지와 같은 문자열이면 그 선택지를 활성으로 되돌린다(중복 생성 없음).
export function addOption(state: OptionState, raw: string): { state: OptionState; error?: OptionError } {
  const value = normalizeOption(raw);
  if (value === "") return { state, error: "empty" };
  if (state.active.includes(value)) return { state, error: "duplicate" };
  if (state.active.length >= ACTIVE_OPTIONS_MAX) return { state, error: "limit" };
  return {
    state: { active: [...state.active, value], archived: state.archived.filter((item) => item !== value) },
  };
}

// 저장된 선택지(savedOptions)는 보관으로 옮기고, 아직 저장 안 한 선택지는 목록에서 뺀다.
export function removeOption(state: OptionState, value: string, savedOptions: readonly string[]): OptionState {
  if (!state.active.includes(value)) return state;
  const active = state.active.filter((item) => item !== value);
  if (!savedOptions.includes(value)) return { active, archived: state.archived };
  return { active, archived: state.archived.includes(value) ? state.archived : [...state.archived, value] };
}

// archived_options = (저장된 options ∪ 저장된 archived_options) − 제출된 options — 저장 순서를 지킨다.
export function deriveArchivedOptions(input: {
  storedActive: readonly string[];
  storedArchived: readonly string[];
  submittedActive: readonly string[];
}): string[] {
  const submitted = new Set(input.submittedActive);
  const union = [...new Set([...input.storedActive, ...input.storedArchived])];
  return union.filter((value) => !submitted.has(value));
}
