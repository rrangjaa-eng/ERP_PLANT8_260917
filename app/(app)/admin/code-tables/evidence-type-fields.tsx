"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { setEvidenceTypePrivateToOwnerAction, setEvidenceTypeTaxRuleAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Select } from "@/ui/select/Select";
import { parseNumberInput } from "@/lib/format-number";
import { PcOnly, PhoneOnly } from "../pc-only";
import styles from "./code-tables.module.css";

type RuleKind = "none" | "vat_surcharge" | "withholding" | "company_borne";
type RoundingMethod = "truncate" | "round" | "ceil";
type BasisDate = "payment_date" | "scheduled_payment_date" | "evidence_date" | "document_date";

export type TaxRuleValue = {
  ruleKind: RuleKind;
  roundingUnit?: 1 | 10;
  roundingMethod?: RoundingMethod;
  minWithholdingAmount?: number;
  basisDate?: BasisDate;
};

const RULE_KIND_OPTIONS: { value: RuleKind; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "vat_surcharge", label: "부가세 가산율" },
  { value: "withholding", label: "원천징수율과 면제 기준" },
  { value: "company_borne", label: "원천징수 회사 대납" },
];

const ROUNDING_UNIT_OPTIONS = [
  { value: "1", label: "1원" },
  { value: "10", label: "10원" },
];

const ROUNDING_METHOD_OPTIONS: { value: RoundingMethod; label: string }[] = [
  { value: "truncate", label: "절사" },
  { value: "round", label: "반올림" },
  { value: "ceil", label: "올림" },
];

const BASIS_DATE_OPTIONS: { value: BasisDate; label: string }[] = [
  { value: "payment_date", label: "지급일" },
  { value: "scheduled_payment_date", label: "지급 예정일" },
  { value: "evidence_date", label: "증빙일" },
  { value: "document_date", label: "작성일" },
];

// 증빙 종류(evidence_type) 코드표 항목에만 붙는 세금 규칙 편집 섹션(03-06
// Task 2). 규칙 종류가 "없음"이면 나머지 필드가 사라진다. §7-13 격자와 같은
// 즉시 저장(선택 상자는 변경 시, 수치 입력은 초점 이탈 시) — 별도 저장
// 버튼이 없다. 이 항목이 적용되는 비율 값 자체는 여기서 받지 않는다 —
// 그 값은 별도 화면의 이력형 키가 적용 시작일과 함께 관리한다.
export function EvidenceTypeFields({ itemId, initialValue, initialPrivate = false }: { itemId: string; initialValue: TaxRuleValue | null; initialPrivate?: boolean }) {
  const [value, setValue] = useState<TaxRuleValue>(initialValue ?? { ruleKind: "none" });
  const { execute } = useAction(setEvidenceTypeTaxRuleAction);
  // 06.1-14(G15 · SYSTEM §7-2 boolean): 네이티브 체크박스 하나 — 라벨 자체가 클릭 영역, 바뀌면 즉시 저장(확인 창 없음 · 다시 누르면 되돌아간다).
  const [privateToOwner, setPrivateToOwner] = useState(initialPrivate);
  const privateAction = useAction(setEvidenceTypePrivateToOwnerAction);

  function save(next: TaxRuleValue) {
    setValue(next);
    execute({ id: itemId, taxRule: next });
  }

  // 폰은 읽기만(사용자 결정 2026-10-03 14:57 KST 카드) — 선택 상자 · 입력 칸은 폰에서 CSS로 숨고 값만 한 줄로 보인다.
  const labelOf = (options: { value: string | number; label: string }[], current: string | number | undefined) =>
    options.find((option) => option.value === current)?.label;
  const phoneText = [
    labelOf(RULE_KIND_OPTIONS, value.ruleKind),
    ...(value.ruleKind === "none"
      ? []
      : [
          `${value.roundingUnit ?? 1}원`,
          labelOf(ROUNDING_METHOD_OPTIONS, value.roundingMethod ?? "round"),
          `${(value.minWithholdingAmount ?? 0).toLocaleString("ko-KR")}원`,
          labelOf(BASIS_DATE_OPTIONS, value.basisDate ?? "payment_date"),
        ]),
  ].join(" · ");

  return (
    <>
      <PhoneOnly>
        <div className={styles.taxRuleSection}>{privateToOwner ? `올린 사람 · 경영관리만 · ${phoneText}` : phoneText}</div>
      </PhoneOnly>
      <PcOnly>
        <div className={styles.taxRuleSection}>
          <div className={styles.selectLabel}>
            <label htmlFor={`private-to-owner-${itemId}`}>올린 사람 · 경영관리만 보기</label>
            <input
              id={`private-to-owner-${itemId}`}
              type="checkbox"
              checked={privateToOwner}
              onChange={(event) => {
                const next = event.target.checked;
                setPrivateToOwner(next);
                privateAction.execute({ id: itemId, value: next });
              }}
            />
          </div>

          <div className={styles.selectLabel}>
            <label htmlFor={`rule-kind-${itemId}`}>규칙 종류</label>
            <Select
              id={`rule-kind-${itemId}`}
              hideEmptyOption
              options={RULE_KIND_OPTIONS}
              value={value.ruleKind}
              onChange={(event) => {
                const ruleKind = event.target.value as RuleKind;
                if (ruleKind === "none") {
                  save({ ruleKind });
                  return;
                }
                save({
                  ruleKind,
                  roundingUnit: value.roundingUnit ?? 1,
                  roundingMethod: value.roundingMethod ?? "round",
                  minWithholdingAmount: value.minWithholdingAmount ?? 0,
                  basisDate: value.basisDate ?? "payment_date",
                });
              }}
            />
          </div>

          {value.ruleKind !== "none" ? (
            <>
              <div className={styles.selectLabel}>
                <label htmlFor={`rounding-unit-${itemId}`}>절사 단위</label>
                <Select
                  id={`rounding-unit-${itemId}`}
                  hideEmptyOption
                  options={ROUNDING_UNIT_OPTIONS}
                  value={String(value.roundingUnit ?? 1)}
                  onChange={(event) => save({ ...value, roundingUnit: Number(event.target.value) as 1 | 10 })}
                />
              </div>

              <div className={styles.selectLabel}>
                <label htmlFor={`rounding-method-${itemId}`}>절사 방식</label>
                <Select
                  id={`rounding-method-${itemId}`}
                  hideEmptyOption
                  options={ROUNDING_METHOD_OPTIONS}
                  value={value.roundingMethod ?? "round"}
                  onChange={(event) => save({ ...value, roundingMethod: event.target.value as RoundingMethod })}
                />
              </div>

              <TextField
                id={`min-withholding-${itemId}`}
                name={`min-withholding-${itemId}`}
                label="최소 징수액"
                numberKind="krw"
                defaultValue={value.minWithholdingAmount ?? 0}
                onBlur={(event) => {
                  const parsed = parseNumberInput(event.target.value);
                  // "-"·"." 만 남은 칸은 NaN이다 — 0으로 대체하지 않고(??는
                  // null만 대체한다) 이전 값을 유지한 채 저장을 건너뛴다.
                  if (parsed !== null && !Number.isFinite(parsed)) return;
                  save({ ...value, minWithholdingAmount: parsed ?? 0 });
                }}
              />

              <div className={styles.selectLabel}>
                <label htmlFor={`basis-date-${itemId}`}>적용 기준일 종류</label>
                <Select
                  id={`basis-date-${itemId}`}
                  hideEmptyOption
                  options={BASIS_DATE_OPTIONS}
                  value={value.basisDate ?? "payment_date"}
                  onChange={(event) => save({ ...value, basisDate: event.target.value as BasisDate })}
                />
              </div>
            </>
          ) : null}

          <p className={styles.taxRuleHint}>세율은 설정 화면에서 적용 시작일과 함께 관리합니다</p>
        </div>
      </PcOnly>
    </>
  );
}
