"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { createVendorAction, setVendorHiddenAction, archiveVendorAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import styles from "./vendors.module.css";

export type EvidenceTypeOption = { value: string; label: string };
export type VendorFieldDefinition = {
  id: string;
  key: string;
  type: "text" | "number" | "date" | "select";
  options: string[] | null;
  required: boolean;
};

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// SYSTEM.md §6-3 폼 템플릿(D-39) 재사용 — 목록 위에 펼치는 폼. 계좌번호
// 입력은 값을 클라이언트 상태에만 담고 제출 후 즉시 비운다(formRef.reset).
export function VendorForm({
  evidenceTypes,
  fieldDefs,
}: {
  evidenceTypes: EvidenceTypeOption[];
  fieldDefs: VendorFieldDefinition[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const { execute, result, isExecuting } = useAction(createVendorAction, {
    onSuccess: ({ data }) => {
      formRef.current?.reset();
      setDuplicateCount(data?.duplicateCount ?? 0);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDuplicateCount(null);
    const formData = new FormData(event.currentTarget);

    const customFields: Record<string, unknown> = {};
    for (const def of fieldDefs) {
      const raw = getStringField(formData, `cf_${def.key}`);
      if (raw === "" && !def.required) continue;
      customFields[def.key] = raw;
    }

    execute({
      name: getStringField(formData, "name"),
      businessNo: getStringField(formData, "businessNo") || undefined,
      defaultEvidenceType: getStringField(formData, "defaultEvidenceType") || undefined,
      accountBank: getStringField(formData, "accountBank") || undefined,
      accountHolder: getStringField(formData, "accountHolder") || undefined,
      accountNumber: getStringField(formData, "accountNumber") || undefined,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    });
  }

  const nameError = result.validationErrors?.name?._errors?.[0];

  return (
    <form ref={formRef} onSubmit={handleSubmit} id="vendor-form">
      <TextField id="name" name="name" label="이름" required error={nameError} />
      <TextField id="businessNo" name="businessNo" label="사업자 번호" />

      <div className={styles.selectLabel}>
        <label htmlFor="defaultEvidenceType">기본 증빙 종류</label>
        <select id="defaultEvidenceType" name="defaultEvidenceType" className={styles.select} defaultValue="">
          <option value="">선택 없음</option>
          {evidenceTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <TextField id="accountBank" name="accountBank" label="계좌 은행" />
      <TextField id="accountHolder" name="accountHolder" label="예금주" />
      <TextField id="accountNumber" name="accountNumber" label="계좌번호" autoComplete="off" />

      {fieldDefs.map((def) => (
        <VendorCustomField key={def.id} def={def} />
      ))}

      {duplicateCount ? (
        <p className={styles.duplicateNotice}>같은 이름의 거래처가 이미 있습니다 · 확인</p>
      ) : null}
      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
      <Button type="submit" variant="primary" pending={isExecuting}>
        거래처 등록
      </Button>
    </form>
  );
}

function VendorCustomField({ def }: { def: VendorFieldDefinition }) {
  const id = `cf_${def.key}`;
  if (def.type === "select") {
    return (
      <div className={styles.selectLabel}>
        <label htmlFor={id}>{def.key}</label>
        <select id={id} name={id} className={styles.select} defaultValue="" required={def.required}>
          <option value="">선택 없음</option>
          {(def.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const inputType = def.type === "number" ? "number" : def.type === "date" ? "date" : "text";
  return <TextField id={id} name={id} label={def.key} type={inputType} required={def.required} />;
}

// §6-1 목록 행 3차 버튼 — 되돌릴 수 있는 상태 변경이라 확인 모달 없음, 즉시 반영.
export function VendorHiddenToggle({ id, hidden }: { id: string; hidden: boolean }) {
  const { execute, isExecuting } = useAction(setVendorHiddenAction);

  return (
    <Button variant="tertiary" pending={isExecuting} onClick={() => execute({ id, hidden: !hidden })}>
      {hidden ? "보이기" : "숨기기"}
    </Button>
  );
}

// 03-07: 「삭제」— 보관함으로 이동한다.
export function VendorDeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteToArchive
      name={name}
      onArchive={async () => {
        const result = await archiveVendorAction({ id });
        if (result?.serverError) throw new Error(result.serverError);
      }}
    />
  );
}
