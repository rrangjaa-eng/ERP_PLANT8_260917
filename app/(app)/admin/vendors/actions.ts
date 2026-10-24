"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { authedActionClient } from "@/lib/actions/client";
import {
  createVendor,
  updateVendor,
  setVendorHidden,
  revealAccountNumber,
  addVendorKind,
  markVendorConfirmed,
  unmarkVendorConfirmed,
  DuplicateBusinessNoError,
  InvalidBusinessNoError,
  PaymentTermDaysError,
  VendorVersionConflictError,
} from "@/domain/vendors";
import { exportVendorsCsv } from "@/domain/vendors/export";
import { VendorContactsError } from "@/domain/vendors/contacts";
import { requestVendorDocumentUpload } from "@/domain/vendors/document-upload";
import { CustomFieldsInvalidError } from "@/domain/custom-fields/preserve";
import { AccountFieldsError } from "@/domain/vendors/account-fields";
import { archive } from "@/domain/archive";
import { VENDOR_KINDS } from "@/domain/vendors/kind";
import "./actions.registry";

// MAST-01: domain/vendors만 부른다. 등록은 ./actions.registry로 분리(03-03
// 선례 — 누수 스캔이 server-only 의존 체인인 이 파일을 직접 import할 수 없다).
const customFieldsSchema = z.record(z.string(), z.unknown()).optional();
// 07-23 V7: 담당자 줄 — 상한(5) · 이름 · 이메일 판정은 domain(VendorContactsError → 담당자 칸 오류). id는 이미 있는 줄만.
const contactsSchema = z
  .array(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().max(100),
      phone: z.string().max(50).nullable().optional(),
      email: z.string().max(200).nullable().optional(),
    }),
  )
  .optional();

// 04.5-05: 스키마는 모듈 안 비공개 상수 — "use server" 파일은 async 함수 밖을 내보낼 수 없다.
const createVendorSchema = z.object({
  name: z.string().min(1, "이름 필요 · 이름 입력"),
  // D-745(SC-17): 갈래가 아닌 값은 거부 — 문구 `갈래 선택`.
  kind: z.enum(VENDOR_KINDS, { error: "갈래 선택" }),
  businessNo: z.string().optional(),
  defaultEvidenceType: z.string().optional(),
  accountBank: z.string().optional(),
  accountHolder: z.string().optional(),
  accountNumber: z.string().optional(),
  // 07-20 J5: 지급 기한(일) — null = 회사 기본. 범위 · 갈래 판정은 domain(PaymentTermDaysError).
  paymentTermDays: z.number().nullable().optional(),
  customFields: customFieldsSchema,
  contacts: contactsSchema,
});

const updateVendorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "이름 필요 · 이름 입력"),
  kind: z.enum(VENDOR_KINDS, { error: "갈래 선택" }),
  // 07-20 V3: 패널이 읽은 version — 그 사이 누가 고쳤으면 덮어쓰지 않는다(VendorVersionConflictError).
  version: z.number().int(),
  businessNo: z.string().optional(),
  defaultEvidenceType: z.string().optional(),
  accountBank: z.string().optional(),
  accountHolder: z.string().optional(),
  // M-5: undefined(키 자체를 보내지 않음) = 안 바꿈 · null = 지움 · 문자열 =
  // 새 값. ""는 여기서 막지 않고 domain의 planAccountNumberUpdate가 "안
  // 바꿈"으로 처리한다(편집 폼이 빈 칸을 그냥 보낼 수도 있어 액션 계층에서
  // 거부하면 자연스러운 "안 바꿈" 조작이 에러가 된다).
  accountNumber: z.string().nullable().optional(),
  paymentTermDays: z.number().nullable().optional(),
  customFields: customFieldsSchema,
  contacts: contactsSchema,
});

// 04.5-05: 커스텀 칸 오류는 폼 전체 serverError가 아니라 칸별 validationErrors.customFields.{key}._errors로 돌려준다
// (칸 정렬 순서 그대로 — 06이 칸 아래 · 이유 자리에 그린다). 다른 오류는 그대로 던져 handleServerError로 간다.
// 사업자번호 중복은 칸 오류 문자열로는 부족하다(링크 · 「구분 더하기」에 기존 거래처 id가 필요) — 던지지 않고 데이터로 돌려준다.
// 「거래처 정보」를 못 보는 사람(existing null)에게는 문구만 — id는 빈 값이고 화면은 name null이면 링크 · 단추를 내지 않는다.
function businessNoConflict(error: DuplicateBusinessNoError) {
  return {
    businessNoConflict: {
      id: error.existing?.id ?? "",
      name: error.existing?.name ?? null,
      archived: error.existing?.archived ?? false,
      hidden: error.existing?.hidden ?? false,
      addSide: error.addSide,
      message: error.message,
    },
  };
}

// 사업자번호 모양 · 검증 숫자 오류는 같은 통로(링크 · 단추 없는 문구만, name null)로 돌려준다 — 칸 아래 오류 줄이 이미 이를 그려 화면을 안 고친다.
function invalidBusinessNo(error: InvalidBusinessNoError) {
  return { businessNoConflict: { id: "", name: null, archived: false, hidden: false, addSide: null, message: error.message } };
}

function customFieldErrors(error: CustomFieldsInvalidError): Record<string, { _errors: string[] }> {
  return Object.fromEntries(Object.entries(error.fieldErrors).map(([key, message]) => [key, { _errors: [message] }]));
}

// 06.5 D-6506 · DH-3: 계좌 칸 판정 오류는 칸별 validationErrors.accountBank · accountHolder로(폼이 칸 아래에 그린다).
function accountFieldErrors(error: AccountFieldsError): Record<string, { _errors: string[] }> {
  return Object.fromEntries(Object.entries(error.fieldErrors).map(([key, message]) => [key, { _errors: [message] }]));
}

// 07-20 J5: 지급 기한 범위 · 갈래 오류는 그 칸 아래(validationErrors.paymentTermDays).
function paymentTermDaysErrors(error: PaymentTermDaysError) {
  return { paymentTermDays: { _errors: [error.message] } };
}

export const createVendorAction = authedActionClient
  .schema(createVendorSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const result = await createVendor(ctx.viewer, parsedInput);
      revalidatePath("/admin/vendors");
      return result;
    } catch (error) {
      if (error instanceof DuplicateBusinessNoError) return businessNoConflict(error);
      if (error instanceof InvalidBusinessNoError) return invalidBusinessNo(error);
      if (error instanceof CustomFieldsInvalidError) {
        returnValidationErrors(createVendorSchema, { customFields: customFieldErrors(error) });
      }
      if (error instanceof AccountFieldsError) returnValidationErrors(createVendorSchema, accountFieldErrors(error));
      if (error instanceof PaymentTermDaysError) returnValidationErrors(createVendorSchema, paymentTermDaysErrors(error));
      if (error instanceof VendorContactsError) returnValidationErrors(createVendorSchema, { contacts: { _errors: [error.message] } });
      throw error;
    }
  });

export const updateVendorAction = authedActionClient
  .schema(updateVendorSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, version, ...input } = parsedInput;
    try {
      const vendor = await updateVendor(ctx.viewer, id, { ...input, expectedVersion: version });
      revalidatePath("/admin/vendors");
      return { vendor };
    } catch (error) {
      if (error instanceof DuplicateBusinessNoError) return businessNoConflict(error);
      if (error instanceof InvalidBusinessNoError) return invalidBusinessNo(error);
      if (error instanceof CustomFieldsInvalidError) {
        returnValidationErrors(updateVendorSchema, { customFields: customFieldErrors(error) });
      }
      if (error instanceof AccountFieldsError) returnValidationErrors(updateVendorSchema, accountFieldErrors(error));
      if (error instanceof PaymentTermDaysError) returnValidationErrors(updateVendorSchema, paymentTermDaysErrors(error));
      if (error instanceof VendorContactsError) returnValidationErrors(updateVendorSchema, { contacts: { _errors: [error.message] } });
      // 07-20 V3: 패널 상단 FormAlert + `새로 불러오기`를 그리도록 데이터로 돌려준다(입력은 덮어쓰지 않았다).
      if (error instanceof VendorVersionConflictError) return { versionConflict: error.message };
      throw error;
    }
  });

export const setVendorHiddenAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), hidden: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await setVendorHidden(ctx.viewer, parsedInput.id, parsedInput.hidden);
    revalidatePath("/admin/vendors");
  });

// 「갈래 더하기」 — 같은 사업자번호 거래처의 갈래만 켠다.
export const addVendorKindAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), kind: z.enum(["client", "supplier"]), businessNo: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    await addVendorKind(ctx.viewer, parsedInput.id, parsedInput.kind, parsedInput.businessNo);
    revalidatePath("/admin/vendors");
  });

// 평문은 이 액션의 반환값으로만 나간다 — URL·쿠키·헤더에 담지 않는다.
export const revealVendorAccountNumberAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const value = await revealAccountNumber(ctx.viewer, parsedInput.id);
    return { value };
  });

// 03-07: 「삭제」 — domain/archive의 보관 함수만 부른다.
export const archiveVendorAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "vendor", parsedInput.id);
    revalidatePath("/admin/vendors");
    revalidatePath("/admin/archive");
  });

// 07-20 V1 · D-736: 필터 줄 `파일 받기` — 목록과 같은 거르개로 서버가 CSV를 만든다(domain/vendors/export.ts).
export const exportVendorsCsvAction = authedActionClient
  .schema(z.object({ includeHidden: z.boolean(), kind: z.enum(["client", "supplier"]).nullable(), q: z.string() }))
  .action(async ({ parsedInput, ctx }) => exportVendorsCsv(ctx.viewer, parsedInput));

// 07-23 V4 · N4: 확인 표시 켬 · 끔 — 즉시 저장 컨트롤(UI-SPEC 공통 10). 권한(vendors.account 쓰기) · 상태 판정은 domain.
export const markVendorConfirmedAction = authedActionClient
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const state = await markVendorConfirmed(ctx.viewer, parsedInput);
    revalidatePath("/admin/vendors");
    return state;
  });

export const unmarkVendorConfirmedAction = authedActionClient
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const state = await unmarkVendorConfirmed(ctx.viewer, parsedInput);
    revalidatePath("/admin/vendors");
    return state;
  });

// 07-23 V8 · SC-17 ⑨: 거래처 서류 붙이기 시작 — 종류 · 선언만 받는다. 권리(vendors.account 쓰기) · 서류 행은 domain이 정한다.
// 마침 · 보기는 05 증빙 액션(completeEvidenceUploadAction · createEvidenceViewUrlAction) 그대로 — 교체는 주인 표 beforeAdd가 마침 트랜잭션에서.
export const requestVendorDocumentUploadAction = authedActionClient
  .schema(
    z.object({
      vendorId: z.string().uuid(),
      kind: z.enum(["registration", "bankbook"]),
      size: z.number().int().min(0),
      contentType: z.string().min(1).max(100),
      sha256: z.string().max(64),
      name: z.string().min(1).max(255),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const intent = await requestVendorDocumentUpload(ctx.viewer, parsedInput);
    return { intentId: intent.intentId, url: intent.url, method: intent.method, headers: intent.headers };
  });
