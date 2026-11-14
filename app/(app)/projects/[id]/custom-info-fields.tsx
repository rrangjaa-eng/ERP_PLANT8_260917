import type { KeyboardEvent } from "react";
import { Num } from "@/ui/num/Num";
import { Form } from "@/ui/form/Form";
import { CustomFieldInput, customFieldDefaultValue } from "@/ui/custom-field/CustomFieldInput";
import type { ProjectFieldDefinitionDto } from "@/domain/projects";
import styles from "./project-detail.module.css";

// 07.5-02(S3 · D-7504 · design B5) — 정보 면 「기본」 구획 끝 추가 칸 줄. 새 구획 · 제목 없이 형제 칸과 같은 읽기 행 꼴(infoItem)이라
// 정보 면 구획 수 · 열 배치가 그대로다. 칸 = 이 사람의 입력 칸(서버가 거른 정의), 값 = 서버가 칸별로 거른 ProjectDto.customFields.
// 고치기(D-7516 · design B3 · F5)는 기본 정보 4칸과 같은 묶음 · 같은 키 · 같은 dirty 규칙(.periodInputDirty)이고 값 · dirty는 QuoteLedger가 갖는다.

export type CustomInfo = { defs: ProjectFieldDefinitionDto[]; values: Record<string, unknown> };

function readValue(def: ProjectFieldDefinitionDto, value: unknown) {
  const text = customFieldDefaultValue(def, value);
  if (text === "") return <span className={styles.infoNone}>—</span>;
  if (def.type === "number") {
    return (
      <span className={styles.infoValue}>
        <Num value={Number.isFinite(Number(text)) ? Number(text) : text} unit="quantity" />
      </span>
    );
  }
  const archived = def.type === "select" && !(def.options ?? []).includes(text);
  return <span className={styles.infoValue}>{archived ? `${text} (보관됨)` : text}</span>;
}

export function CustomInfoRows({ defs, values }: CustomInfo) {
  if (defs.length === 0) return null;
  return defs.map((def) => (
    <p key={def.id} className={styles.infoItem}>
      <span className={styles.infoLabel}>{def.label}</span>
      {readValue(def, values[def.key])}
    </p>
  ));
}

/** 저장값을 입력 글자로 — dirty 판정의 기준값. */
export function customInfoBaseText(def: ProjectFieldDefinitionDto, values: Record<string, unknown>): string {
  return customFieldDefaultValue(def, values[def.key]);
}

/** 고친 칸 키(draft가 기준값과 다른 칸) — 정렬 순서. */
export function customInfoDirtyKeys(defs: ProjectFieldDefinitionDto[], values: Record<string, unknown>, draft: Record<string, string>): string[] {
  return defs.filter((def) => def.key in draft && draft[def.key] !== customInfoBaseText(def, values)).map((def) => def.key);
}

/** 새 version이 오면 초안은 옛 기준값과 다른 칸만 남긴다 — 기본 4칸과 같은 규칙(Codex P1 · PR #378, 리뷰 S1). */
export function rebaseCustomInfoDraft(defs: ProjectFieldDefinitionDto[], oldValues: Record<string, unknown>, draft: Record<string, string>): Record<string, string> {
  return Object.fromEntries(customInfoDirtyKeys(defs, oldValues, draft).map((key) => [key, draft[key] ?? ""]));
}

export function CustomInfoFields({
  defs,
  values,
  draft,
  errors,
  saved,
  onChange,
  onEscape,
  onSave,
  saveLocked = false,
}: CustomInfo & {
  /** 고친 칸만(키 없음 = 기준값). */
  draft: Record<string, string>;
  /** 서버 칸 오류 — 칸 키별. */
  errors: Record<string, string>;
  saved: boolean;
  onChange: (key: string, value: string) => void;
  onEscape: () => void;
  onSave: () => void;
  saveLocked?: boolean;
}) {
  if (defs.length === 0) return null;

  // 형제 정보 칸과 같은 키(pre-estimate-field.tsx PoNumberField) — Enter 제출 막기 · Esc 두 단계(저장 잠김 중 무시) · Ctrl+S 저장.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saveLocked) onEscape();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave();
    }
  }

  return (
    <Form className={saved ? `${styles.periodForm} ${styles.periodSaved}` : styles.periodForm} onSubmit={(event) => event.preventDefault()}>
      {defs.map((def) => {
        const base = customInfoBaseText(def, values);
        const value = draft[def.key] ?? base;
        return (
          <CustomFieldInput
            key={def.id}
            def={def}
            defaultValue={values[def.key]}
            value={value}
            onChange={(next) => onChange(def.key, next)}
            className={value !== base ? styles.periodInputDirty : undefined}
            onKeyDown={handleKeyDown}
            readOnly={saveLocked}
            error={errors[def.key]}
          />
        );
      })}
    </Form>
  );
}
