"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { createVendorAction, updateVendorAction, setVendorHiddenAction, archiveVendorAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { maskTail4 } from "@/lib/crypto";
import styles from "./vendors.module.css";

export type EvidenceTypeOption = { value: string; label: string };
export type VendorFieldDefinition = {
  id: string;
  key: string;
  type: "text" | "number" | "date" | "select";
  options: string[] | null;
  required: boolean;
};

// 「거래처 수정」이 페이지에 진입할 때 채워 넣을 기존 값 — vendor-form.tsx가
// domain/vendors의 VendorDto와 같은 모양을 그대로 쓴다(page.tsx가 목록 조회
// 결과에서 그대로 골라 넘긴다). 평문 계좌번호는 여기 없다 — 「번호 보기」와
// 같은 열람 게이트를 거치지 않고 이 폼을 열 때마다 복호화하지 않는다.
export type EditingVendor = {
  id: string;
  name: string;
  businessNo: string | null;
  defaultEvidenceType: string | null;
  accountBank: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  customFields: Record<string, unknown>;
};

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// 커스텀 필드 값을 입력 defaultValue용 문자열로 만든다. date 타입은 저장된
// 값이 ISO 타임스탬프일 수 있어(zod z.coerce.date() → JSON 직렬화) 앞
// 10자리(YYYY-MM-DD)만 쓴다 — <input type="date">는 그 형식만 받는다.
function customFieldDefaultValue(def: VendorFieldDefinition, value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const asString = typeof value === "string" ? value : String(value);
  if (def.type === "date") return asString.slice(0, 10);
  return asString;
}

// SYSTEM.md §6-3 폼 템플릿(D-39) 재사용 — 목록 위에 펼치는 폼. 03-06-PLAN.md가
// 약속한 대로 등록·수정 둘 다 이 폼 하나가 맡는다(vendor-form.tsx). editing이
// 있으면 수정 모드 — page.tsx가 목록 행의 「수정」에서 ?editId=로 진입시킨다.
// 계좌번호 입력은 값을 클라이언트 상태에만 담고 제출 후 즉시 비운다(formRef.reset).
export function VendorForm({
  evidenceTypes,
  fieldDefs,
  editing = null,
  cancelHref = "/admin/vendors",
}: {
  evidenceTypes: EvidenceTypeOption[];
  fieldDefs: VendorFieldDefinition[];
  editing?: EditingVendor | null;
  cancelHref?: string;
}) {
  const isEditing = editing !== null;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [clearAccountNumber, setClearAccountNumber] = useState(false);

  // 두 액션 모두 훅 규칙대로 매 렌더 무조건 호출하고, isEditing으로 어느
  // 쪽 결과를 화면에 쓸지만 고른다(조건부 훅 호출 금지).
  const createState = useAction(createVendorAction, {
    onSuccess: ({ data }) => {
      formRef.current?.reset();
      setDuplicateCount(data?.duplicateCount ?? 0);
    },
  });
  const updateState = useAction(updateVendorAction, {
    onSuccess: () => {
      // 수정 완료 — 목록으로 돌아가 수정 모드를 나간다(뒤로가기가 수정
      // 모드로 되돌아가지 않도록 replace).
      router.replace(cancelHref);
    },
  });
  const { result, isExecuting } = isEditing ? updateState : createState;

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
    const baseFields = {
      name: getStringField(formData, "name"),
      businessNo: getStringField(formData, "businessNo") || undefined,
      defaultEvidenceType: getStringField(formData, "defaultEvidenceType") || undefined,
      accountBank: getStringField(formData, "accountBank") || undefined,
      accountHolder: getStringField(formData, "accountHolder") || undefined,
    };

    if (isEditing) {
      // 계좌번호 — 「지우기」 체크 시 null(지움), 칸이 비었으면 undefined(안
      // 바꿈, M-5), 값이 있으면 그 문자열(새 값으로 교체).
      const accountNumber: string | null | undefined = clearAccountNumber
        ? null
        : getStringField(formData, "accountNumber") || undefined;
      // 화면에 보이는 커스텀 필드 상태를 그대로 저장한다 — 전부 지웠어도(빈
      // 객체) 그 자체가 사용자의 의도이므로 domain에 "안 바꿈"으로 해석되지
      // 않게 명시적으로 보낸다. 필드 정의가 아예 없으면 보낼 것이 없다.
      updateState.execute({
        id: editing.id,
        ...baseFields,
        accountNumber,
        customFields: fieldDefs.length === 0 ? undefined : customFields,
      });
    } else {
      const accountNumber = getStringField(formData, "accountNumber") || undefined;
      createState.execute({
        ...baseFields,
        accountNumber,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      });
    }
  }

  const nameError = result.validationErrors?.name?._errors?.[0];
  const maskedCurrent = editing ? maskTail4(editing.accountNumberLast4) : "";

  return (
    <form ref={formRef} onSubmit={handleSubmit} id="vendor-form">
      <TextField id="name" name="name" label="이름" required defaultValue={editing?.name} error={nameError} />
      <TextField id="businessNo" name="businessNo" label="사업자 번호" defaultValue={editing?.businessNo ?? undefined} />

      <div className={styles.selectLabel}>
        <label htmlFor="defaultEvidenceType">기본 증빙 종류</label>
        <select
          id="defaultEvidenceType"
          name="defaultEvidenceType"
          className={styles.select}
          defaultValue={editing?.defaultEvidenceType ?? ""}
        >
          <option value="">선택 없음</option>
          {evidenceTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <TextField id="accountBank" name="accountBank" label="계좌 은행" defaultValue={editing?.accountBank ?? undefined} />
      <TextField id="accountHolder" name="accountHolder" label="예금주" defaultValue={editing?.accountHolder ?? undefined} />

      {isEditing ? (
        <div className={styles.accountEdit}>
          <p className={styles.hint}>
            {maskedCurrent ? `현재 ${maskedCurrent} · 새 번호를 입력하면 교체됩니다` : "등록된 계좌번호 없음"}
          </p>
          {!clearAccountNumber ? (
            <TextField
              id="accountNumber"
              name="accountNumber"
              label="새 계좌번호"
              autoComplete="off"
              placeholder="변경하려면 입력"
            />
          ) : null}
          {maskedCurrent ? (
            <label className={styles.clearRow}>
              <input
                type="checkbox"
                checked={clearAccountNumber}
                onChange={(event) => setClearAccountNumber(event.target.checked)}
              />
              계좌번호 지우기
            </label>
          ) : null}
        </div>
      ) : (
        <TextField id="accountNumber" name="accountNumber" label="계좌번호" autoComplete="off" />
      )}

      {fieldDefs.map((def) => (
        <VendorCustomField key={def.id} def={def} defaultValue={editing?.customFields[def.key]} />
      ))}

      {duplicateCount ? (
        <p className={styles.duplicateNotice}>같은 이름의 거래처가 이미 있습니다 · 확인</p>
      ) : null}
      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" pending={isExecuting}>
          {isEditing ? "거래처 수정" : "거래처 등록"}
        </Button>
        {isEditing ? (
          <Link href={cancelHref} className={styles.toggle}>
            취소
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function VendorCustomField({ def, defaultValue }: { def: VendorFieldDefinition; defaultValue?: unknown }) {
  const id = `cf_${def.key}`;
  const stringValue = customFieldDefaultValue(def, defaultValue);
  if (def.type === "select") {
    return (
      <div className={styles.selectLabel}>
        <label htmlFor={id}>{def.key}</label>
        <select id={id} name={id} className={styles.select} defaultValue={stringValue} required={def.required}>
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
  return (
    <TextField id={id} name={id} label={def.key} type={inputType} required={def.required} defaultValue={stringValue} />
  );
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
