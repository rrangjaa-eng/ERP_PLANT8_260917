"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import {
  createCodeItemAction,
  updateCodeItemLabelAction,
  updateCodeItemDescriptionAction,
  setCodeItemActiveAction,
  archiveCodeItemAction,
} from "./actions";
// 잎(leaf) 모듈에서 상수만 import한다 — @/domain/code-tables는 db/client
// (pg)를 거치는 서버 전용 의존 체인이라 클라이언트 컴포넌트에서 직접
// import하면 클라이언트 번들이 깨진다(domain/action-log/filter-keys.ts와
// 같은 이유).
import { CODE_ITEM_DESCRIPTION_MAX } from "@/domain/code-tables/description-max";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import styles from "./code-tables.module.css";

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// SYSTEM.md §6-3 폼 템플릿 재사용(D-39) — 목록 위에 펼치는 폼이고 모달이 아니다.
// §6-1(2026-09-21 이후): page.tsx가 ?new=1일 때만 이 폼을 렌더한다 — 기본
// 진입에는 없다. cancelHref는 그 쿼리를 뺀 같은 화면으로 돌아간다.
export function CodeItemForm({ tableKey, cancelHref }: { tableKey: string; cancelHref: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { execute, result, isExecuting } = useAction(createCodeItemAction, {
    onSuccess: () => formRef.current?.reset(),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      tableKey,
      value: getStringField(formData, "value"),
      label: getStringField(formData, "label"),
      sortOrder: Number(getStringField(formData, "sortOrder") || "0"),
    });
  }

  const valueError = result.validationErrors?.value?._errors?.[0];
  const labelError = result.validationErrors?.label?._errors?.[0];

  return (
    <form ref={formRef} onSubmit={handleSubmit} id="code-item-form" className="single-column">
      <TextField id="value" name="value" label="값" required error={valueError} />
      <TextField id="label" name="label" label="이름" required error={labelError} />
      <TextField id="sortOrder" name="sortOrder" label="정렬 순서" type="number" defaultValue={0} />
      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" pending={isExecuting}>
          코드 추가
        </Button>
        <Link href={cancelHref} className={styles.toggle}>
          취소
        </Link>
      </div>
    </form>
  );
}

// §6-1 목록 행 3차 버튼 — 되돌릴 수 있는 상태 변경이라 확인 모달 없음, 즉시
// 반영(03-UI-SPEC.md 「비활성화 표현」).
// MAST-04 「수정」 — 계급 화면(roles-client.tsx)의 인라인 이름 입력과 같은 결:
// 행 안에서 고치고 포커스를 잃을 때 저장한다. 값(value)은 입력칸으로 내보내지
// 않는다 — vendors.default_evidence_type이 FK 없이 그 문자열을 참조해서,
// 바꾸면 기존 거래처가 조용히 고아가 된다(사용자 결정 2026-09-21).
export function CodeItemLabelInput({ id, label }: { id: string; label: string }) {
  const [value, setValue] = useState(label);
  // §7-2 오류 한 줄은 실패의 종류를 가리지 않는다 — 서버 오류·검증 오류·
  // 네트워크 실패 중 하나만 보이면 나머지는 조용히 사라진다. onError가 셋을
  // 모두 받으므로 여기서 한 번에 잡는다.
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const { execute } = useAction(updateCodeItemLabelAction, {
    onError: ({ error }) => {
      // 저장이 실패하면 화면의 값을 서버 값으로 되돌린다 — 안 되돌리면 칸에는
      // 새 이름이, DB에는 옛 이름이 남아 사용자가 저장됐다고 믿는다.
      setValue(label);
      setErrorText(
        error.serverError ??
          error.validationErrors?.label?._errors?.[0] ??
          "저장하지 못했습니다 · 잠시 후 다시 시도해 주세요.",
      );
    },
    onSuccess: () => setErrorText(undefined),
  });

  const errorId = `code-item-label-error-${id}`;

  return (
    <>
      <input
        className={[styles.labelInput, errorText ? styles.labelInputError : ""].filter(Boolean).join(" ")}
        aria-label={`${label} 이름`}
        aria-invalid={errorText ? true : undefined}
        aria-describedby={errorText ? errorId : undefined}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value.trim() && value !== label) execute({ id, label: value });
        }}
      />
      {errorText ? (
        <p id={errorId} role="alert" className={styles.labelError}>
          {errorText}
        </p>
      ) : null}
    </>
  );
}

// 04-10(D-93 · DR-29) — 값 한 문장 설명. CodeItemLabelInput과 결은 같지만
// (blur 저장 · 오류 한 줄 · aria-invalid/aria-describedby) 둘이 다르다:
// (a) 저장 조건(C-13) — 빈 값도 저장한다(지우기). (b) 실패해도 입력을
// 지우거나 서버 값으로 되돌리지 않는다 — 되돌림은 Esc 처리기 한 곳뿐이다.
export function CodeItemDescriptionInput({
  id,
  label,
  description,
}: {
  id: string;
  label: string;
  description: string | null;
}) {
  const [value, setValue] = useState(description ?? "");
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const { execute } = useAction(updateCodeItemDescriptionAction, {
    onError: ({ error }) => {
      setErrorText(
        error.serverError ??
          error.validationErrors?.description?._errors?.[0] ??
          "저장하지 못했습니다 · 잠시 후 다시 시도해 주세요.",
      );
    },
    onSuccess: () => setErrorText(undefined),
  });

  const errorId = `code-item-description-error-${id}`;
  const countId = `code-item-description-count-${id}`;
  const overLimit = value.length > CODE_ITEM_DESCRIPTION_MAX;
  const describedBy = [errorText ? errorId : null, overLimit ? countId : null].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <span className={styles.descriptionCell}>
        <input
          className={[styles.labelInput, errorText ? styles.labelInputError : ""].filter(Boolean).join(" ")}
          aria-label={`${label} 설명`}
          aria-invalid={errorText ? true : undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            // C-13: 빈 값도 저장한다 — 이름 칸의 「비어 있지 않고 바뀌었을
            // 때만」 가드를 베끼면 설명을 지울 수 없다.
            if (value.trim() !== (description ?? "")) execute({ id, description: value });
          }}
          onKeyDown={(event) => {
            // Esc(조합 중 아님)만 서버 값으로 되돌린다 — onError는 되돌리지
            // 않는다(DR-29, 41자를 다시 쓰지 않아도 되게).
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              setValue(description ?? "");
              setErrorText(undefined);
            }
          }}
        />
        {overLimit ? (
          <span id={countId} className={styles.descriptionCount}>
            {value.length}/{CODE_ITEM_DESCRIPTION_MAX}
          </span>
        ) : null}
      </span>
      {errorText ? (
        <p id={errorId} role="alert" className={styles.labelError}>
          {errorText}
        </p>
      ) : null}
    </>
  );
}

export function CodeItemActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { execute, isExecuting } = useAction(setCodeItemActiveAction);

  return (
    <Button
      variant="tertiary"
      pending={isExecuting}
      onClick={() => execute({ id, active: !active })}
    >
      {active ? "비활성화" : "활성화"}
    </Button>
  );
}

// 03-07: 「삭제」— 보관함으로 이동한다. delete-to-archive.tsx의 두 단계
// 확인 컴포넌트를 여섯 화면 중 하나로 여기서 배선한다.
export function CodeItemDeleteButton({ id, label }: { id: string; label: string }) {
  return (
    <DeleteToArchive
      name={label}
      onArchive={async () => {
        const result = await archiveCodeItemAction({ id });
        if (result?.serverError) throw new Error(result.serverError);
      }}
    />
  );
}
