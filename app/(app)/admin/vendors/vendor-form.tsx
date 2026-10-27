"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  createVendorAction,
  updateVendorAction,
  setVendorHiddenAction,
  archiveVendorAction,
  addVendorKindAction,
  markVendorConfirmedAction,
  unmarkVendorConfirmedAction,
} from "./actions";
import { registerVendorFromWorkAction, pickExistingVendorFromWorkAction } from "@/app/(app)/expenses/actions";
import { CONTACTS_ADD_ID, VendorContacts, readContacts, type VendorContactValue } from "./vendor-contacts";
import { TextField } from "@/ui/input/TextField";
import { Form } from "@/ui/form/Form";
import { focusFirstInvalid } from "@/ui/form/focus-first-invalid";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { RowAction } from "@/ui/row-actions/RowActions";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { SidePanel, editLinkFor } from "@/ui/side-panel/SidePanel";
import { Select } from "@/ui/select/Select";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { KvList } from "@/ui/kv-list/KvList";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { maskTail4 } from "@/lib/mask-tail4";
import { DEFAULT_NEW_VENDOR_KIND, VENDOR_KINDS, VENDOR_KIND_LABELS, isVendorKind, servesSide, type VendorKind, type VendorSide } from "@/domain/vendors/kind";
import { businessNoProblem } from "@/domain/vendors/business-no";
import { normalizeAccountDigits } from "@/domain/vendors/account-digits";
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
  paymentTermDays: number | null;
  version: number;
  /** 07-23 V4: NULL = 확인 전(자동 등록 · 일하는 자리 등록). */
  confirmedAt: Date | null;
};

// 같은 사업자번호 거래처가 있음 — 서버가 데이터로 돌려준다(actions.ts businessNoConflict). name이 null이면 「거래처 정보」를 못 보는 사람이라 링크를 내지 않는다.
type BusinessNoConflict = {
  id: string;
  name: string | null;
  archived: boolean;
  hidden: boolean;
  addSide: VendorSide | null;
  message: string;
  /** 07-23 K20 — 일하는 자리 등록: 지급처로 고를 수 있는 거래처(숨김 · 보관 아님)면 3차 `이 거래처로`. */
  selectable?: boolean;
};

// 07-23 SC-18 · K20: 일하는 자리(지출결의 지급처 고르기)에서 연 등록 패널 — 저장 · 충돌 줄 행동만 바꾼다. 결과 거래처를 넘기면 호출부가 지급처 칸을 채운다.
export type WorkplaceVendor = { id: string; name: string; defaultEvidenceType: string | null; confirmed: boolean };
export type WorkplaceRegister = {
  /** 이름 칸 첫 값(고르기 검색어). */
  name: string;
  /** 등록(registered) 또는 `이 거래처로`(picked)로 정해진 거래처 — 끝나면 패널이 닫힌다. */
  onVendor: (vendor: WorkplaceVendor, how: "registered" | "picked") => void | Promise<void>;
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

const KIND_OPTIONS = VENDOR_KINDS.map((kind) => ({ value: kind, label: VENDOR_KIND_LABELS[kind] }));
// 일하는 자리 등록은 지급처가 될 수 있는 갈래만(클라이언트 전용은 지급처로 못 고른다 — 할 수 없는 선택지는 숨긴다).
const WORK_KIND_OPTIONS = KIND_OPTIONS.filter((option) => servesSide(option.value, "supplier"));

// 등록 · 고르기 결과 거래처(VendorDto — 「거래처 정보」를 못 보면 칸이 빠진다)를 지급처 칸 값으로.
function workplaceVendorOf(vendor: { id?: string; name?: string; defaultEvidenceType?: string | null; confirmedAt?: Date | null } | undefined): WorkplaceVendor | null {
  if (!vendor?.id || vendor.name === undefined) return null;
  return { id: vendor.id, name: vendor.name, defaultEvidenceType: vendor.defaultEvidenceType ?? null, confirmed: Boolean(vendor.confirmedAt) };
}

// 07-20 J5: 지급 기한 칸 글자 → 보낼 값. 빈 칸 = 회사 기본(null), 숫자만 받는다(그 밖은 NaN — 서버 zod가 막는다).
function paymentTermDaysValue(raw: string): number | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : /^[0-9]+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

// SYSTEM.md §6-3 폼 템플릿(D-39) — 옆 패널 안 폼(04.6-04: `SidePanel` 안 `PanelForm`). 03-06-PLAN.md가
// 약속한 대로 등록·수정 둘 다 이 폼 하나가 맡는다(vendor-form.tsx). editing이
// 있으면 수정 모드 — page.tsx가 목록 행의 「수정」에서 ?editId=로 진입시킨다.
// 성공 뒤(UQ-8 B): 등록은 패널을 열어 둔 채 칸을 비우고(`PanelForm`이 폼 reset · 첫 칸 포커스) 수정은 닫힌다.
// 계좌번호 입력은 값을 클라이언트 상태에만 담고 제출 후 즉시 비운다(PanelForm의 폼 reset).
// 07-20(SC-17): 칸 순서 이름 → 갈래 → 사업자 번호 → 지급 기한(협력사 갈래만) → 기본 증빙 종류 → 계좌 → 사용자 정의 칸. select는 모두 `ui/select`(N10).
// 새로 불러오기 → 폼 재마운트 사이에 건너가는 표지 — 컴포넌트 상태는 재마운트로 사라지므로 모듈에 둔다.
let refocusAfterReload = false;

export function VendorForm({
  evidenceTypes,
  fieldDefs,
  editing = null,
  newKind = DEFAULT_NEW_VENDOR_KIND,
  canEditAccount = true,
  paymentTermDefault,
  contacts = [],
  workplace = null,
  children,
}: {
  evidenceTypes: EvidenceTypeOption[];
  fieldDefs: VendorFieldDefinition[];
  editing?: EditingVendor | null;
  /** 등록 「갈래」 기본값 — 목록이 갈래로 걸러져 있으면 그 갈래(`?kind=`), 아니면 협력사(261006-biv D-3 · D-745). */
  newKind?: VendorKind;
  /** 07-20 R8: 계좌 세 칸을 넣거나 바꿀 수 있나(`vendors.account` 쓰기) — 아니면 수정은 읽기 줄, 등록은 칸 자체가 없다(사용자 결정 10/23). 둘 다 세 칸을 보내지 않는다. */
  canEditAccount?: boolean;
  /** 07-20 N6: 지급 기한 빈 칸 placeholder — 회사 기본 일수(설정 payment.term_days). */
  paymentTermDefault: number;
  /** 07-23 SC-17 ⑦: 저장된 담당자(정한 순서). 등록은 빈 목록. */
  contacts?: VendorContactValue[];
  /** 07-23 SC-17 ⑨⑩: 수정 패널 맨 아래 섹션(서류 · 계좌 변경 기록) — 등록 패널에는 없다. */
  children?: ReactNode;
  /** 07-23 SC-18: 일하는 자리 등록 — 지급 기한 · 기본 증빙 종류 · 담당자 · 사용자 정의 칸을 그리지 않고, 성공하면 결과를 넘기고 닫힌다. */
  workplace?: WorkplaceRegister | null;
}) {
  const isEditing = editing !== null;
  const defaultKind = editing?.kind ?? newKind;
  const accountReadOnly = isEditing && !canEditAccount;
  // 사용자 결정(2026-10-23): 계좌 권한 없는 편집자의 등록에는 계좌 칸을 그리지 않는다(권한 없는 칸은 안 그림 · 서버 createVendor도 거부).
  const accountHidden = !isEditing && !canEditAccount;
  const router = useRouter();
  const panelRef = useRef<PanelFormHandle>(null);
  // 제출 직후 같은 틱의 두 번째 제출(Ctrl+Enter 연타)을 막는 동기 가드 — isExecuting은 다음 렌더에야 참이 된다(D7 · R15-ii).
  const submitLockRef = useRef(false);
  // 충돌을 받은 제출의 사업자번호 — 「갈래 더하기」 때 서버가 그 거래처가 아직 같은 번호인지 다시 확인한다.
  const submittedBusinessNoRef = useRef("");
  const alertRef = useRef<HTMLDivElement>(null);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [businessNoConflict, setBusinessNoConflict] = useState<BusinessNoConflict | null>(null);
  // 07-20 V5: blur에서 본 검증합 오류(서버와 같은 함수) — 입력하면 지운다.
  const [businessNoBlurError, setBusinessNoBlurError] = useState<string | null>(null);
  // 07-20 C-35: blur에서 본 계좌번호 자릿수 오류(서버와 같은 함수).
  const [accountNumberBlurError, setAccountNumberBlurError] = useState<string | null>(null);
  // 07-20 V3: 읽은 version이 낡았다 — 패널 상단 FormAlert(덮어쓰지 않았다).
  const [versionConflict, setVersionConflict] = useState<string | null>(null);
  const [clearAccountNumber, setClearAccountNumber] = useState(false);
  // 07-20 J5: 갈래에 협력사가 있을 때만 지급 기한 칸 — 클라이언트로 바꾸면 칸이 사라지고 값을 비운다.
  const [kind, setKind] = useState<VendorKind>(defaultKind);
  const [termDays, setTermDays] = useState(editing?.paymentTermDays?.toString() ?? "");
  // Codex P2: 확인 표시는 version을 올려 폼을 다시 마운트한다(page.tsx key) — 저장 안 한 입력이 있으면 확인 버튼을 감춘다(할 수 없는 선택지는 숨김).
  const [dirty, setDirty] = useState(false);
  const showTermDays = servesSide(kind, "supplier") && workplace === null;

  // 두 액션 모두 훅 규칙대로 매 렌더 무조건 호출하고, isEditing으로 어느
  // 쪽 결과를 화면에 쓸지만 고른다(조건부 훅 호출 금지).
  const createState = useAction(createVendorAction, {
    onSuccess: ({ data }) => {
      if (data && "businessNoConflict" in data) {
        setBusinessNoConflict(data.businessNoConflict);
        return;
      }
      setDuplicateCount(data?.duplicateCount ?? 0);
      setKind(defaultKind);
      setTermDays("");
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
      if (data && "versionConflict" in data) {
        setVersionConflict(data.versionConflict ?? null);
        return;
      }
      panelRef.current?.succeed();
    },
    onSettled: () => {
      submitLockRef.current = false;
    },
  });
  // 07-23 SC-18: 일하는 자리 등록 — 성공하면 지급처 칸을 채우게 넘기고 닫는다(패널 intent edit). 실패는 관리 화면 등록과 같은 칸 오류 · 충돌 줄.
  const workState = useAction(registerVendorFromWorkAction, {
    onSuccess: async ({ data }) => {
      if (data && "businessNoConflict" in data) {
        setBusinessNoConflict(data.businessNoConflict);
        return;
      }
      const vendor = workplaceVendorOf(data?.vendor);
      if (vendor && workplace) await workplace.onVendor(vendor, "registered");
      panelRef.current?.succeed();
    },
    onSettled: () => {
      submitLockRef.current = false;
    },
  });
  // K20 `이 거래처로` — 이미 있는 거래처를 지급처로(클라이언트 전용이면 서버가 둘 다로 올린다).
  const pickExistingState = useAction(pickExistingVendorFromWorkAction, {
    onSuccess: async ({ data }) => {
      const vendor = workplaceVendorOf(data?.vendor);
      if (vendor && workplace) await workplace.onVendor(vendor, "picked");
      panelRef.current?.succeed();
    },
  });
  const { result, isExecuting, reset } = workplace ? workState : isEditing ? updateState : createState;
  // 「갈래 더하기」 — 기존 거래처의 갈래만 켜고 그 거래처 수정 패널로 넘어간다(입력하던 칸은 옮기지 않는다).
  const addKindState = useAction(addVendorKindAction, {
    onSuccess: () => {
      if (businessNoConflict) router.push(existingVendorHref(businessNoConflict));
    },
  });

  // 07-20 V3: 새로 불러오기가 폼을 새로 마운트하면 눌렀던 단추가 사라져 포커스가 body로 떨어진다 — 새 폼이 서면 이름 칸으로 옮긴다.
  useEffect(() => {
    if (!refocusAfterReload) return;
    refocusAfterReload = false;
    document.getElementById("name")?.focus();
  }, []);

  // 07-20 V3 · U12: FormAlert가 나타나면 패널 본문을 맨 위로 올리고 포커스를 알림으로(아래에 있던 사람도 본다).
  useEffect(() => {
    if (!versionConflict) return;
    const alert = alertRef.current;
    alert?.parentElement?.scrollTo({ top: 0 });
    alert?.focus();
  }, [versionConflict]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setDuplicateCount(null);
    setBusinessNoConflict(null);
    setVersionConflict(null);
    // 지난 「갈래 더하기」 실패 문구는 새 제출과 무관하다 — 남기면 등록이 성공해도 칸이 오류로 보인다.
    addKindState.reset();
    pickExistingState.reset();
    const formData = new FormData(event.currentTarget);
    submittedBusinessNoRef.current = getStringField(formData, "businessNo");

    // 04.5-05: 수정은 그린 칸을 빈 값까지 모두 보낸다(서버 계약 — 키 없음 = 안 바꿈 · 빈 값 = 비움). 등록은 빈 칸을 뺀다.
    const customFields: Record<string, unknown> = {};
    for (const def of fieldDefs) {
      const raw = getStringField(formData, `cf_${def.key}`);
      if (!isEditing && raw === "" && !def.required) continue;
      customFields[def.key] = raw;
    }
    // 07-23 V7: 담당자 줄 — 수정은 목록 전체(빈 목록 = 모두 뺌), 등록은 줄이 있을 때만.
    const contactList = readContacts(formData);
    // select가 세 값만 내므로 좁히기는 타입용이다.
    const rawKind = getStringField(formData, "kind");
    const baseFields = {
      name: getStringField(formData, "name"),
      kind: isVendorKind(rawKind) ? rawKind : defaultKind,
      businessNo: getStringField(formData, "businessNo") || undefined,
      defaultEvidenceType: getStringField(formData, "defaultEvidenceType") || undefined,
      // 07-20 J5: 칸이 없으면(클라이언트) null — 서버가 갈래로 다시 판정한다.
      paymentTermDays: showTermDays ? paymentTermDaysValue(termDays) : null,
    };

    if (workplace) {
      // 07-23 SC-18: 일하는 자리 등록 — 이름 · 갈래 · 사업자 번호 · 계좌 세 칸만(그 밖의 칸은 그리지 않았다).
      workState.execute({
        name: baseFields.name,
        kind: baseFields.kind,
        businessNo: baseFields.businessNo,
        accountBank: getStringField(formData, "accountBank") || undefined,
        accountHolder: getStringField(formData, "accountHolder") || undefined,
        accountNumber: getStringField(formData, "accountNumber") || undefined,
      });
    } else if (isEditing) {
      // 07-20 R8 · B-P2-4: 읽기 줄이면 계좌 세 칸을 아예 보내지 않는다(서버가 저장값 유지). 입력 칸이면 빈 값까지 보낸다(빈 값 = 비움).
      // 계좌번호 — 「지우기」 체크 시 null(지움), 칸이 비었으면 undefined(안 바꿈, M-5), 값이 있으면 그 문자열(새 값으로 교체).
      const account = accountReadOnly
        ? {}
        : {
            accountBank: getStringField(formData, "accountBank"),
            accountHolder: getStringField(formData, "accountHolder"),
            accountNumber: clearAccountNumber ? null : getStringField(formData, "accountNumber") || undefined,
          };
      // 화면에 보이는 커스텀 필드 상태를 그대로 저장한다 — 전부 지웠어도(빈
      // 객체) 그 자체가 사용자의 의도이므로 domain에 "안 바꿈"으로 해석되지
      // 않게 명시적으로 보낸다. 필드 정의가 아예 없으면 보낼 것이 없다.
      updateState.execute({
        id: editing.id,
        version: editing.version,
        ...baseFields,
        ...account,
        customFields: fieldDefs.length === 0 ? undefined : customFields,
        contacts: contactList,
      });
    } else {
      createState.execute({
        ...baseFields,
        accountBank: getStringField(formData, "accountBank") || undefined,
        accountHolder: getStringField(formData, "accountHolder") || undefined,
        accountNumber: getStringField(formData, "accountNumber") || undefined,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        contacts: contactList.length > 0 ? contactList : undefined,
      });
    }
  }

  const nameError = result.validationErrors?.name?._errors?.[0];
  const kindError = result.validationErrors?.kind?._errors?.[0];
  const termDaysError = result.validationErrors?.paymentTermDays?._errors?.[0];
  // 06.5 D-6506 · DH-3: 계좌 칸 판정은 서버가 한다(필수 표시 · 클라이언트 사전 차단 없음 — UI-SPEC V3). 계좌번호 자릿수는 blur에서도(C-35).
  const accountBankError = result.validationErrors?.accountBank?._errors?.[0];
  const accountHolderError = result.validationErrors?.accountHolder?._errors?.[0];
  const accountNumberError = accountNumberBlurError ?? result.validationErrors?.accountNumber?._errors?.[0];
  // 담당자 오류는 목록 전체에 한 줄(domain VendorContactsError) — 줄별 모양(배열)은 쓰지 않는다.
  const contactsErrors = result.validationErrors?.contacts;
  const contactsError = contactsErrors && !Array.isArray(contactsErrors) && "_errors" in contactsErrors ? contactsErrors._errors?.[0] : undefined;
  const maskedCurrent = editing ? maskTail4(editing.accountNumberLast4) : "";

  // 04.5-06: 칸 오류는 칸 아래에, 요약은 1차 옆 이유 자리에 — 화면 순서(기본 칸 먼저, 그다음 커스텀 칸 정렬 순서).
  const customFieldErrors = result.validationErrors?.customFields;
  const errorFields: { label: string; id: string }[] = [];
  if (nameError) errorFields.push({ label: "이름", id: "name" });
  if (kindError) errorFields.push({ label: "갈래", id: "kind" });
  if (businessNoConflict) errorFields.push({ label: "사업자 번호", id: "businessNo" });
  if (termDaysError) errorFields.push({ label: "지급 기한", id: "paymentTermDays" });
  if (accountBankError) errorFields.push({ label: "계좌 은행", id: "accountBank" });
  if (accountHolderError) errorFields.push({ label: "예금주", id: "accountHolder" });
  if (accountNumberError) errorFields.push({ label: isEditing ? "새 계좌번호" : "계좌번호", id: "accountNumber" });
  if (contactsError) errorFields.push({ label: "담당자", id: CONTACTS_ADD_ID });
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

  // 서버 검증 오류가 돌아오면 포커스를 오류 난 첫 칸으로(UI-SPEC V3 「칸 오류」 · 07.1-02 S2 — 카드 폼과 같은 꼴). 계좌 칸도 aria-invalid라 이 한 곳이 받는다.
  useEffect(() => {
    if (result.validationErrors !== undefined) focusFirstInvalid("vendor-form");
  }, [result]);

  // 같은 사업자번호 오류 줄의 다음 한 수 — 「원인 · 다음 행동」 한 줄 안에 붙인다(field-definition-form 「보관함에서 복원」과 같은 모양).
  // 「거래처 정보」를 못 보면(name null) 링크를 내지 않고, 「갈래 더하기」가 실패하면 다시 눌러도 같은 실패라 치운다.
  // 07-20 V5 · K20: 같은 갈래면 3차 `열기`(`?editId=` 그 거래처 수정 패널), 갈래가 다르면 3차 `갈래 더하기`.
  // 07-23 K20: 일하는 자리에서는 3차가 `이 거래처로`(고를 수 있는 거래처만 — 숨김 · 보관이면 문구만).
  const workConflictAction =
    workplace && businessNoConflict?.selectable && !pickExistingState.result.serverError ? (
      <Button variant="tertiary" pending={pickExistingState.isExecuting} onClick={() => pickExistingState.execute({ id: businessNoConflict.id })}>
        이 거래처로
      </Button>
    ) : null;
  const conflictAction = workplace
    ? workConflictAction
    : businessNoConflict && businessNoConflict.name !== null && !addKindState.result.serverError ? (
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
          갈래 더하기
        </Button>
      ) : (
        <Link href={existingVendorHref(businessNoConflict)} className={buttonLinkClassName("tertiary")}>
          열기
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

  const businessNoError = conflictAction
    ? undefined
    : (pickExistingState.result.serverError ?? addKindState.result.serverError ?? businessNoConflict?.message ?? businessNoBlurError ?? undefined);

  return (
    <PanelForm
      ref={panelRef}
      id="vendor-form"
      label={isEditing ? "거래처 저장" : "거래처 등록"}
      intent={isEditing || workplace ? "edit" : "create"}
      onSubmit={handleSubmit}
      pending={isExecuting}
      blockedReason={blocked ? serverReason?.text : undefined}
      reason={reasonNode}
      reasonId="vendor-form-reason"
      onDirtyChange={setDirty}
    >
      {editing ? <VendorConfirmLine vendorId={editing.id} confirmed={editing.confirmedAt !== null} canConfirm={canEditAccount && !dirty} /> : null}
      {versionConflict ? (
        // 07-20 V3: 패널 상단 FormAlert + 3차 `새로 불러오기`(서버 값으로 다시 연다 — page의 VendorForm key가 version을 담아 새로 마운트).
        <div id="vendor-form-alert" ref={alertRef} tabIndex={-1} className={styles.formAlert}>
          <FormAlert>
            {versionConflict}{" "}
            <Button
              variant="tertiary"
              onClick={() => {
                refocusAfterReload = true;
                router.refresh();
              }}
            >
              새로 불러오기
            </Button>
          </FormAlert>
        </div>
      ) : null}
      <TextField id="name" name="name" label="이름" required defaultValue={editing?.name ?? workplace?.name} error={nameError} />
      {/* 게이트 P2: Form.Field 줄은 아래 간격이 없다(TextField 줄만 16px) — card-form.tsx `.field` 감싸개 결로 칸 사이 --s-4를 맞춘다. */}
      <div className={styles.field}>
        <Form.Field id="kind" label="갈래">
          <Select
            id="kind"
            name="kind"
            options={workplace ? WORK_KIND_OPTIONS : KIND_OPTIONS}
            hideEmptyOption
            defaultValue={defaultKind}
            error={kindError}
            onChange={(event) => {
              const next = event.target.value;
              if (!isVendorKind(next)) return;
              setKind(next);
              if (!servesSide(next, "supplier")) setTermDays("");
            }}
          />
        </Form.Field>
      </div>
      <div className={styles.businessNoGroup}>
        <TextField
          id="businessNo"
          name="businessNo"
          label="사업자 번호"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={editing?.businessNo ?? undefined}
          error={businessNoError}
          aria-invalid={conflictAction ? true : undefined}
          aria-describedby={conflictAction ? "businessNo-error" : undefined}
          onInput={(event) => {
            // 07-20 V5: 입력 중 숫자 · 하이픈만 남긴다.
            const input = event.currentTarget;
            const cleaned = input.value.replace(/[^0-9-]/g, "");
            if (cleaned !== input.value) input.value = cleaned;
            setBusinessNoBlurError(null);
          }}
          onBlur={(event) => setBusinessNoBlurError(businessNoProblem(event.currentTarget.value))}
        />
        {conflictAction && businessNoConflict ? (
          <Form.Error id="businessNo-error">
            {businessNoConflict.message} · {conflictAction}
          </Form.Error>
        ) : null}
      </div>

      {showTermDays ? (
        <div className={styles.withUnit}>
          <TextField
            id="paymentTermDays"
            name="paymentTermDays"
            label="지급 기한"
            inputMode="numeric"
            autoComplete="off"
            placeholder={String(paymentTermDefault)}
            value={termDays}
            onChange={(event) => setTermDays(event.target.value.replace(/[^0-9]/g, ""))}
            error={termDaysError}
            aria-describedby="paymentTermDays-unit"
            hintId="paymentTermDays-hint"
          />
          <span id="paymentTermDays-unit" className={styles.unit}>
            일
          </span>
          <p id="paymentTermDays-hint" className={styles.unitHint}>
            1~180
          </p>
        </div>
      ) : null}

      {workplace ? null : (
        <div className={styles.field}>
          <Form.Field id="defaultEvidenceType" label="기본 증빙 종류">
            <Select
              id="defaultEvidenceType"
              name="defaultEvidenceType"
              options={evidenceTypes}
              defaultValue={editing?.defaultEvidenceType ?? ""}
            />
          </Form.Field>
        </div>
      )}

      {accountHidden ? null : accountReadOnly && editing ? (
        // 07-20 R8: 계좌 수정 권한이 없으면 세 칸은 읽기 줄(번호는 마스킹) — 폼은 세 칸을 보내지 않는다.
        <KvList
          items={[
            { label: "계좌 은행", value: editing.accountBank ?? "—" },
            { label: "예금주", value: editing.accountHolder ?? "—" },
            { label: "계좌번호", value: maskedCurrent || "—" },
          ]}
        />
      ) : (
        <>
          <TextField id="accountBank" name="accountBank" label="계좌 은행" defaultValue={editing?.accountBank ?? undefined} error={accountBankError} />
          <TextField
            id="accountHolder"
            name="accountHolder"
            label="예금주"
            defaultValue={editing?.accountHolder ?? undefined}
            error={accountHolderError}
          />
          {isEditing ? (
            <div className={styles.accountEdit}>
              {!clearAccountNumber ? (
                <AccountNumberField label="새 계좌번호" hintId="accountNumber-current" error={accountNumberError} onBlurError={setAccountNumberBlurError} />
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
            <AccountNumberField label="계좌번호" error={accountNumberError} onBlurError={setAccountNumberBlurError} />
          )}
        </>
      )}

      {workplace ? null : <VendorContacts initial={contacts} error={contactsError} />}

      {fieldDefs.length > 0 && !workplace ? (
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
      {isEditing ? children : null}
    </PanelForm>
  );
}

// 07-23 V4 · N4 · U6: 수정 패널 머리 확인 표시 — `확인 전` 태그 + 3차 `확인됨으로 표시`(계좌 · 서류 권한자만, 누르면 즉시) → 태그 `확인됨` + 같은 줄
// 3차 `되돌리기`(알림 없음). 저장은 version을 올리고 목록을 다시 읽으므로 폼이 새로 마운트된다(page key) — 누른 뜻을 모듈에 두고 새 줄이 서면
// 그 단추로 포커스를 옮긴다(refocusAfterReload와 같은 꼴). 방금 확인한 거래처만 `확인됨` 줄을 보인다(이미 확인된 거래처는 머리 줄이 없다).
const CONFIRM_MARK_ID = "vendor-confirm-mark";
const CONFIRM_UNDO_ID = "vendor-confirm-undo";
let recentlyConfirmedId: string | null = null;
let confirmFocus: { id: string; target: "mark" | "undo" } | null = null;

function VendorConfirmLine({ vendorId, confirmed, canConfirm }: { vendorId: string; confirmed: boolean; canConfirm: boolean }) {
  // 같은 틱의 두 번째 누름(더블 클릭)을 막는 동기 잠금 — isExecuting은 다음 렌더에야 참이 된다.
  const lockRef = useRef(false);
  // 연결이 끊긴 실패(thrownError)는 serverError가 없다 — 이 값이 없으면 눌렀는데 아무 일도 없는 것처럼 보였다(07-23 DOM 감사 P2).
  const [networkFailed, setNetworkFailed] = useState<"mark" | "unmark" | null>(null);
  const settleFor = (which: "mark" | "unmark") => ({
    onSettled: () => {
      lockRef.current = false;
    },
    onError: ({ error }: { error: { thrownError?: Error } }) => {
      confirmFocus = null;
      // 되돌리기가 실패하면 아직 확인됨이다 — 줄(`확인됨` + `되돌리기` + 실패 한 줄)을 그대로 둔다.
      if (which === "unmark") recentlyConfirmedId = vendorId;
      if (error.thrownError) setNetworkFailed(which);
    },
  });
  const markState = useAction(markVendorConfirmedAction, settleFor("mark"));
  const unmarkState = useAction(unmarkVendorConfirmedAction, settleFor("unmark"));
  const busy = markState.isExecuting || unmarkState.isExecuting;
  const error =
    markState.result.serverError ??
    unmarkState.result.serverError ??
    (networkFailed === "mark" ? "확인 표시 실패 · 다시 시도" : networkFailed === "unmark" ? "되돌리기 실패 · 다시 시도" : undefined);

  useEffect(() => {
    const intent = confirmFocus;
    if (!intent || intent.id !== vendorId) return;
    if ((intent.target === "undo") !== confirmed) return;
    confirmFocus = null;
    document.getElementById(intent.target === "undo" ? CONFIRM_UNDO_ID : CONFIRM_MARK_ID)?.focus();
  }, [vendorId, confirmed]);

  function run(next: boolean) {
    if (lockRef.current || busy) return;
    lockRef.current = true;
    setNetworkFailed(null);
    recentlyConfirmedId = next ? vendorId : null;
    confirmFocus = { id: vendorId, target: next ? "undo" : "mark" };
    if (next) markState.execute({ id: vendorId });
    else unmarkState.execute({ id: vendorId });
  }

  if (confirmed && recentlyConfirmedId !== vendorId) return null;
  return (
    <div className={styles.confirmLine}>
      <StatusTag status={confirmed ? "확인됨" : "확인 전"} variant="text" />
      {canConfirm ? (
        <Button
          id={confirmed ? CONFIRM_UNDO_ID : CONFIRM_MARK_ID}
          variant="tertiary"
          pending={busy}
          aria-busy={busy ? "true" : undefined}
          onClick={() => run(!confirmed)}
        >
          {confirmed ? "되돌리기" : "확인됨으로 표시"}
        </Button>
      ) : null}
      {error ? <Form.Error>{error}</Form.Error> : null}
    </div>
  );
}

// 07-20 C-35: 계좌번호 칸 — 입력 중 숫자 · 하이픈 · 공백만 남기고, blur에서 하이픈 · 공백을 지운 뒤 10~16자리를 본다(서버와 같은 normalizeAccountDigits).
function AccountNumberField({
  label,
  hintId,
  error,
  onBlurError,
}: {
  label: string;
  hintId?: string;
  error?: string;
  onBlurError: (error: string | null) => void;
}) {
  return (
    <TextField
      id="accountNumber"
      name="accountNumber"
      label={label}
      autoComplete="off"
      inputMode="numeric"
      hintId={hintId}
      error={error}
      onInput={(event) => {
        const input = event.currentTarget;
        const cleaned = input.value.replace(/[^0-9\s-]/g, "");
        if (cleaned !== input.value) input.value = cleaned;
        onBlurError(null);
      }}
      onBlur={(event) => {
        const input = event.currentTarget;
        const { value, error: problem } = normalizeAccountDigits(input.value);
        input.value = value;
        onBlurError(problem);
      }}
    />
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
  const stringValue = customFieldDefaultValue(def, defaultValue);
  if (def.type === "select") {
    const options = def.options ?? [];
    // 04.5-06: 저장값이 활성 선택지에 없으면(보관된 선택지) 그 값을 「(보관됨)」 옵션으로 활성화한 채 목록 끝에 더한다 —
    // disabled 옵션은 FormData에서 빠져 「안 바꿈」과 「지움」을 구분할 수 없다(UI-SPEC O2). 판정은 서버(05)가 한다.
    const archivedValue = stringValue !== "" && !options.includes(stringValue) ? stringValue : null;
    return (
      <div className={styles.field}>
        <Form.Field id={id} label={def.label}>
          <Select
            id={id}
            name={id}
            options={[
              ...options.map((option) => ({ value: option, label: option })),
              ...(archivedValue !== null ? [{ value: archivedValue, label: `${archivedValue} (보관됨)` }] : []),
            ]}
            defaultValue={stringValue}
            error={error}
          />
        </Form.Field>
      </div>
    );
  }

  const inputType = def.type === "number" ? "number" : def.type === "date" ? "date" : "text";
  return (
    <TextField id={id} name={id} label={def.label} type={inputType} defaultValue={stringValue} error={error} />
  );
}

// §6-1 목록 행 3차 버튼 — 되돌릴 수 있는 상태 변경이라 확인 모달 없음, 즉시 반영.
// 06.5 OI-9 · SP-65-3(UI-SPEC V9): `?editId=`를 주소로 직접 열어 저장하면 포커스가 화면 제목으로 갔다(06.5-03 재현 2026-10-14) — 그 행 `수정` 링크로 돌린다.
// 서버 페이지는 함수를 넘길 수 없어(RSC) 여기서 returnFocusTo를 만든다(법인카드 CorpCardPanel과 같은 꼴). 등록 패널(`editId` 없음)은 그대로.
export function VendorPanel({ editId, title, closeHref, children }: { editId: string | null; title: string; closeHref: string; children: ReactNode }) {
  return (
    <SidePanel title={title} closeHref={closeHref} returnFocusTo={editId ? () => editLinkFor(editId) : undefined}>
      {children}
    </SidePanel>
  );
}

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
