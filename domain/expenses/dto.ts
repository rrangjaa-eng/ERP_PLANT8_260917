import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { Money } from "@/domain/money";

// 05-03: 지출결의 DTO 둘 — 문서 칸은 expense.value, 금액 칸(공급가액 · 세율 · 세액 · 지급 총액)은 expense.amount.

export type ExpenseDraftDto = {
  id: string;
  projectId: string | null;
  quoteLineId: string | null;
  vendorId: string | null;
  evidenceType: string | null;
  paymentMethod: string | null;
  scheduledPaymentDate: string | null;
  note: string | null;
  installment: boolean;
  version: number;
  supply: Money | null;
};

export const EXPENSE_DRAFT_DTO_SPEC: DtoSpec<ExpenseDraftDto, ExpenseDraftDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "projectId", from: "projectId", infoItem: "expense.value" },
    { key: "quoteLineId", from: "quoteLineId", infoItem: "expense.value" },
    { key: "vendorId", from: "vendorId", infoItem: "expense.value" },
    { key: "evidenceType", from: "evidenceType", infoItem: "expense.value" },
    { key: "paymentMethod", from: "paymentMethod", infoItem: "expense.value" },
    { key: "scheduledPaymentDate", from: "scheduledPaymentDate", infoItem: "expense.value" },
    { key: "note", from: "note", infoItem: "expense.value" },
    { key: "installment", from: "installment", infoItem: "expense.value" },
    { key: "version", from: "version", infoItem: "expense.value" },
    { key: "supply", from: "supply", infoItem: "expense.amount" },
  ],
};

export type ExpenseDocumentDto = ExpenseDraftDto & {
  number: string | null;
  drafterName: string;
  projectName: string | null;
  itemName: string | null;
  vendorName: string | null;
  installmentSeq: number | null;
  statusWord: string;
  instanceId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  taxRuleKind: string | null;
  taxRate: string | null;
  vatKrw: number | null;
  withholdingKrw: number | null;
  companyBorneKrw: number | null;
  payableKrw: number | null;
};

export const EXPENSE_DOCUMENT_DTO_SPEC: DtoSpec<ExpenseDocumentDto, ExpenseDocumentDto> = {
  fields: [
    ...EXPENSE_DRAFT_DTO_SPEC.fields,
    { key: "number", from: "number", infoItem: "expense.value" },
    { key: "drafterName", from: "drafterName", infoItem: "expense.value" },
    { key: "projectName", from: "projectName", infoItem: "expense.value" },
    { key: "itemName", from: "itemName", infoItem: "expense.value" },
    { key: "vendorName", from: "vendorName", infoItem: "expense.value" },
    { key: "installmentSeq", from: "installmentSeq", infoItem: "expense.value" },
    { key: "statusWord", from: "statusWord", infoItem: "expense.value" },
    { key: "instanceId", from: "instanceId", infoItem: "expense.value" },
    { key: "submittedAt", from: "submittedAt", infoItem: "expense.value" },
    { key: "createdAt", from: "createdAt", infoItem: "expense.value" },
    { key: "taxRuleKind", from: "taxRuleKind", infoItem: "expense.value" },
    { key: "taxRate", from: "taxRate", infoItem: "expense.amount" },
    { key: "vatKrw", from: "vatKrw", infoItem: "expense.amount" },
    { key: "withholdingKrw", from: "withholdingKrw", infoItem: "expense.amount" },
    { key: "companyBorneKrw", from: "companyBorneKrw", infoItem: "expense.amount" },
    { key: "payableKrw", from: "payableKrw", infoItem: "expense.amount" },
  ],
};

registerDto({ name: "expenseDraft", fields: EXPENSE_DRAFT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "expenseDocument", fields: EXPENSE_DOCUMENT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
