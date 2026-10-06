"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createVendorAction, updateVendorAction, setVendorHiddenAction, archiveVendorAction, addVendorKindAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Form } from "@/ui/form/Form";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { RowAction } from "@/ui/row-actions/RowActions";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { SelectHint } from "@/ui/select/Select";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { maskTail4 } from "@/lib/mask-tail4";
import { DEFAULT_NEW_VENDOR_KIND, VENDOR_KINDS, VENDOR_KIND_LABELS, isVendorKind, type VendorKind, type VendorSide } from "@/domain/vendors/kind";
import { fieldErrorsReason, formReason, staleFieldsReason } from "@/lib/actions/form-reason";
import styles from "./vendors.module.css";

export type EvidenceTypeOption = { value: string; label: string; description: string | null };
export type VendorFieldDefinition = {
  id: string;
  key: string;
  label: string;
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
  kind: VendorKind;
  businessNo: string | null;
  defaultEvidenceType: string | null;
  accountBank: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  customFields: Record<string, unknown>;
};

// 같은 사업자번호 거래처가 있음 — 서버가 데이터로 돌려준다(actions.ts businessNoConflict). name이 null이면 「거래처 정보」를 못 보는 사람이라 링크를 내지 않는다.
type BusinessNoConflict = {
  id: string;
  name: string | null;
  archived: boolean;
  hidden: boolean;
  addSide: VendorSide | null;
  message: string;
};

function existingVendorHref(conflict: BusinessNoConflict): string {
  return `/admin/vendors?${conflict.hidden ? "includeHidden=1&" : ""}editId=${conflict.id}`;
}

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

// SYSTEM.md §6-3 폼 템플릿(D-39) — 옆 패널 안 폼(04.6-04: `SidePanel` 안 `PanelForm`). 03-06-PLAN.md가
// 약속한 대로 등록·수정 둘 다 이 폼 하나가 맡는다(vendor-form.tsx). editing이
// 있으면 수정 모드 — page.tsx가 목록 행의 「수정」에서 ?editId=로 진입시킨다.
// 성공 뒤(UQ-8 B): 등록은 패널을 열어 둔 채 칸을 비우고(`PanelForm`이 폼 reset · 첫 칸 포커스) 수정은 닫힌다.
// 계좌번호 입력은 값을 클라이언트 상태에만 담고 제출 후 즉시 비운다(PanelForm의 폼 reset).
export function VendorForm({
  evidenceTypes,
  fieldDefs,
  editing = null,
  newKind = DEFAULT_NEW_VENDOR_KIND,
}: {
  evidenceTypes: EvidenceTypeOption[];
  fieldDefs: VendorFieldDefinition[];
  editing?: EditingVendor | null;
  /** 등록 「구분」 기본값 — 목록이 갈래로 걸러져 있으면 그 갈래(`?kind=`), 아니면 협력사(261006-biv D-3). */
  newKind?: VendorKind;
}) {
  const isEditing = editing !== null;
  const defaultKind = editing?.kind ?? newKind;
  const router = useRouter();
  const panelRef = useRef<PanelFormHandle>(null);
  // 제출 직후 같은 틱의 두 번째 제출(Ctrl+Enter 연타)을 막는 동기 가드 — isExecuting은 다음 렌더에야 참이 된다(D7 · R15-ii).
  const submitLockRef = useRef(false);
  // 충돌을 받은 제출의 사업자번호 — 「구분 더하기」 때 서버가 그 거래처가 아직 같은 번호인지 다시 확인한다.
  const submittedBusinessNoRef = useRef("");
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [businessNoConflict, setBusinessNoConflict] = useState<BusinessNoConflict | null>(null);
  const [clearAccountNumber, setClearAccountNumber] = useState(false);
  // 04-25(D-93 · S14): 고른 증빙 종류의 설명 한 줄. select는 비제어 그대로
  // 두고 고른 값만 따라간다(등록 성공 시 formRef.reset()과 같이 비운다).
  const [evidenceType, setEvidenceType] = useState(editing?.defaultEvidenceType ?? "");
  const evidenceTypeDescription = evidenceTypes.find((option) => option.value === evidenceType)?.description;

  // 두 액션 모두 훅 규칙대로 매 렌더 무조건 호출하고, isEditing으로 어느
  // 쪽 결과를 화면에 쓸지만 고른다(조건부 훅 호출 금지).
  const createState = useAction(createVendorAction, {
    onSuccess: ({ data }) => {
      if (data && "businessNoConflict" in data) {
        setBusinessNoConflict(data.businessNoConflict);
        return;
      }
      setEvidenceType("");
      setDuplicateCount(data?.duplicateCount ?? 0);
      panelRef.current?.succeed({ status: "거래처 등록됨" });
    },
    onSettled: () => {
      submitLockRef.current = false;
    },
  });
  const updateState = useAction(updateVendorAction, {
    // 수정 완료 — 패널이 닫힌다(PanelForm이 SidePanel의 닫기 경로로 넘긴다).
    onSuccess: ({ data }) => {
      if (data && "businessNoConflict" in data) {
        setBusinessNoConflict(data.businessNoConflict);
        return;
      }
      panelRef.current?.succeed();
    },
    onSettled: () => {
      submitLockRef.current = false;
    },
  });
  const { result, isExecuting, reset } = isEditing ? updateState : createState;
  // 「구분 더하기」 — 기존 거래처의 갈래만 켜고 그 거래처 수정 패널로 넘어간다(입력하던 칸은 옮기지 않는다).
  const addKindState = useAction(addVendorKindAction, {
    onSuccess: () => {
      if (businessNoConflict) router.push(existingVendorHref(businessNoConflict));
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setDuplicateCount(null);
    setBusinessNoConflict(null);
    // 지난 「구분 더하기」 실패 문구는 새 제출과 무관하다 — 남기면 등록이 성공해도 칸이 오류로 보인다.
    addKindState.reset();
    const formData = new FormData(event.currentTarget);
    submittedBusinessNoRef.current = getStringField(formData, "businessNo");

    // 04.5-05: 수정은 그린 칸을 빈 값까지 모두 보낸다(서버 계약 — 키 없음 = 안 바꿈 · 빈 값 = 비움). 등록은 빈 칸을 뺀다.
    const customFields: Record<string, unknown> = {};
    for (const def of fieldDefs) {
      const raw = getStringField(formData, `cf_${def.key}`);
      if (!isEditing && raw === "" && !def.required) continue;
      customFields[def.key] = raw;
    }
    // select가 세 값만 내므로 좁히기는 타입용이다.
    const rawKind = getStringField(formData, "kind");
    const baseFields = {
      name: getStringField(formData, "name"),
      kind: isVendorKind(rawKind) ? rawKind : defaultKind,
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

  // 04.5-06: 칸 오류는 칸 아래에, 요약은 1차 옆 이유 자리에 — 화면 순서(기본 칸 먼저, 그다음 커스텀 칸 정렬 순서).
  const customFieldErrors = result.validationErrors?.customFields;
  const errorFields: { label: string; id: string }[] = [];
  if (nameError) errorFields.push({ label: "이름", id: "name" });
  if (businessNoConflict) errorFields.push({ label: "사업자 번호", id: "businessNo" });
  for (const def of fieldDefs) {
    if (customFieldErrors?.[def.key]?._errors?.[0]) errorFields.push({ label: def.label, id: `cf_${def.key}` });
  }
  const verb = isEditing ? "수정" : "등록";
  const staleReason = staleFieldsReason(
    verb,
    Object.keys(customFieldErrors ?? {}).filter((key) => key !== "_errors"),
    fieldDefs.map((def) => def.key),
  );
  const summary = !staleReason && errorFields.length > 0 ? fieldErrorsReason(verb, errorFields.map((field) => field.label)) : null;
  const serverReason = staleReason ?? (!summary && result.serverError ? formReason(verb, result.serverError) : null);
  const blocked = serverReason?.blocked === true;
  const firstErrorId = errorFields[0]?.id;

  // 같은 사업자번호 오류 줄의 다음 한 수 — 「원인 · 다음 행동」 한 줄 안에 붙인다(field-definition-form 「보관함에서 복원」과 같은 모양).
  // 「거래처 정보」를 못 보면(name null) 링크를 내지 않고, 「구분 더하기」가 실패하면 다시 눌러도 같은 실패라 치운다.
  const conflictAction =
    businessNoConflict && businessNoConflict.name !== null && !addKindState.result.serverError ? (
      businessNoConflict.archived ? (
        <Link href="/admin/archive" className={buttonLinkClassName("tertiary")}>
          보관함에서 복원
        </Link>
      ) : businessNoConflict.addSide ? (
        <Button
          variant="tertiary"
          pending={addKindState.isExecuting}
          onClick={() => addKindState.execute({ id: businessNoConflict.id, kind: businessNoConflict.addSide as VendorSide, businessNo: submittedBusinessNoRef.current })}
        >
          구분 더하기
        </Button>
      ) : (
        <Link href={existingVendorHref(businessNoConflict)} className={buttonLinkClassName("tertiary")}>
          그 거래처 열기
        </Link>
      )
    ) : null;

  function refresh() {
    reset();
    router.refresh();
  }

  // 칸 오류 요약 · 서버 오류 한 줄 — 행동 줄 위 전폭 한 줄 자리(PanelForm `reason`)에 그린다. 막힘이면 1차도 막는다.
  const reasonNode = summary ? (
    <>
      {summary.text}
      <Button variant="tertiary" onClick={() => document.getElementById(firstErrorId ?? "")?.focus()}>
        {summary.fix}
      </Button>
    </>
  ) : blocked ? (
    <>
      {serverReason?.text}
      <Button variant="tertiary" onClick={refresh}>
        새로 불러오기
      </Button>
    </>
  ) : (
    (serverReason?.text ?? null)
  );

  return (
    <PanelForm
      ref={panelRef}
      id="vendor-form"
      label={isEditing ? "거래처 수정" : "거래처 등록"}
      intent={isEditing ? "edit" : "create"}
      onSubmit={handleSubmit}
      pending={isExecuting}
      blockedReason={blocked ? serverReason?.text : undefined}
      reason={reasonNode}
      reasonId="vendor-form-reason"
    >
      <TextField id="name" name="name" label="이름" required defaultValue={editing?.name} error={nameError} />
      <div className={styles.selectLabel}>
        <label htmlFor="kind">구분</label>
        <select id="kind" name="kind" className={styles.select} defaultValue={defaultKind}>
          {VENDOR_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {VENDOR_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.businessNoGroup}>
        <TextField
          id="businessNo"
          name="businessNo"
          label="사업자 번호"
          defaultValue={editing?.businessNo ?? undefined}
          error={conflictAction ? undefined : (addKindState.result.serverError ?? businessNoConflict?.message)}
          aria-invalid={conflictAction ? true : undefined}
          aria-describedby={conflictAction ? "businessNo-error" : undefined}
        />
        {conflictAction && businessNoConflict ? (
          <Form.Error id="businessNo-error">
            {businessNoConflict.message} · {conflictAction}
          </Form.Error>
        ) : null}
      </div>

      <div className={styles.selectLabel}>
        <label htmlFor="defaultEvidenceType">기본 증빙 종류</label>
        <select
          id="defaultEvidenceType"
          name="defaultEvidenceType"
          className={styles.select}
          defaultValue={editing?.defaultEvidenceType ?? ""}
          onChange={(event) => setEvidenceType(event.target.value)}
          aria-describedby={evidenceTypeDescription ? "defaultEvidenceType-hint" : undefined}
        >
          <option value="">선택 없음</option>
          {evidenceTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {evidenceTypeDescription ? (
          <SelectHint id="defaultEvidenceType-hint">{evidenceTypeDescription}</SelectHint>
        ) : null}
      </div>

      <TextField id="accountBank" name="accountBank" label="계좌 은행" defaultValue={editing?.accountBank ?? undefined} />
      <TextField id="accountHolder" name="accountHolder" label="예금주" defaultValue={editing?.accountHolder ?? undefined} />

      {isEditing ? (
        <div className={styles.accountEdit}>
          {!clearAccountNumber ? (
            <TextField
              id="accountNumber"
              name="accountNumber"
              label="새 계좌번호"
              autoComplete="off"
              hintId="accountNumber-current"
            />
          ) : null}
          {/* §6-3 보조 문구는 입력 아래. §8-5 「…하면 …됩니다」류 안내문을 두지
              않고 §8-6 명사형으로 현재 값만 보인다 — 무엇을 하면 되는지는
              라벨 「새 계좌번호」가 이미 말한다. */}
          <p id="accountNumber-current" className={styles.hint}>
            {maskedCurrent ? `현재 ${maskedCurrent}` : "등록된 계좌번호 없음"}
          </p>
          {maskedCurrent ? (
            <label className={styles.clearRow}>
              <input
                type="checkbox"
                name="clearAccountNumber"
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

      {fieldDefs.length > 0 ? (
        <div className={styles.customFields} data-testid="vendor-custom-fields">
          {fieldDefs.map((def) => (
            <VendorCustomField
              key={def.id}
              def={def}
              defaultValue={editing?.customFields[def.key]}
              error={customFieldErrors?.[def.key]?._errors?.[0]}
            />
          ))}
        </div>
      ) : null}

      {duplicateCount ? (
        <p className={styles.duplicateNotice}>같은 이름의 거래처가 이미 있습니다 · 확인</p>
      ) : null}
    </PanelForm>
  );
}

function VendorCustomField({
  def,
  defaultValue,
  error,
}: {
  def: VendorFieldDefinition;
  defaultValue?: unknown;
  error?: string;
}) {
  const id = `cf_${def.key}`;
  const errorId = `${id}-error`;
  const stringValue = customFieldDefaultValue(def, defaultValue);
  if (def.type === "select") {
    const options = def.options ?? [];
    // 04.5-06: 저장값이 활성 선택지에 없으면(보관된 선택지) 그 값을 「(보관됨)」 옵션으로 활성화한 채 목록 끝에 더한다 —
    // disabled 옵션은 FormData에서 빠져 「안 바꿈」과 「지움」을 구분할 수 없다(UI-SPEC O2). 판정은 서버(05)가 한다.
    const archivedValue = stringValue !== "" && !options.includes(stringValue) ? stringValue : null;
    return (
      <div className={styles.selectLabel}>
        <label htmlFor={id}>{def.label}</label>
        <select
          id={id}
          name={id}
          className={error ? `${styles.select} ${styles.selectInvalid}` : styles.select}
          defaultValue={stringValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <option value="">선택 없음</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {archivedValue !== null ? <option value={archivedValue}>{archivedValue} (보관됨)</option> : null}
        </select>
        {error ? (
          <p id={errorId} className={styles.fieldError}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const inputType = def.type === "number" ? "number" : def.type === "date" ? "date" : "text";
  return (
    <TextField id={id} name={id} label={def.label} type={inputType} defaultValue={stringValue} error={error} />
  );
}

// §6-1 목록 행 3차 버튼 — 되돌릴 수 있는 상태 변경이라 확인 모달 없음, 즉시 반영.
export function VendorHiddenToggle({ id, hidden }: { id: string; hidden: boolean }) {
  const { execute, isExecuting } = useAction(setVendorHiddenAction);

  return (
    <RowAction pending={isExecuting} onClick={() => execute({ id, hidden: !hidden })}>
      {hidden ? "보이기" : "숨기기"}
    </RowAction>
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
