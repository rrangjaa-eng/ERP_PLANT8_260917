"use client";

import { useState, type FormEvent } from "react";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { PanelForm } from "@/ui/side-panel/PanelForm";
import { TextField } from "@/ui/input/TextField";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { Num } from "@/ui/num/Num";
import { commissionAmount } from "@/domain/money";
import { commissionBase, commissionMajors, type CommissionBaseRow, type CommissionBasis } from "@/domain/quotes/commission";
import styles from "./project-detail.module.css";

// 07.2-06(PU3 · D-7223 · UI-SPEC S5) — 수수료 줄 「계산」 옆 패널. 율 · 기준을 적으면 지금 표 값으로 기준 합 · 수수료를 보이고,
// 「금액 채우기」가 그 금액을 호출부(견적 표)에 넘긴다. 율은 이 패널 상태로만 있다 — 서버로 보내지 않는다(줄 단가가 보낸 숫자다).
// 패널은 계산 도우미라 버릴 입력이 없다(dirtyFields 빈 배열 — 「입력 버리기」 확인 없이 닫힌다).

const RATE_EMPTY = "율 없음 · 율 적기";
const RATE_INVALID = "숫자 아님 · 5처럼";

function basisFromValue(value: string): CommissionBasis {
  if (value.startsWith("only:")) return { kind: "only", major: value.slice("only:".length) };
  if (value.startsWith("except:")) return { kind: "except", major: value.slice("except:".length) };
  return { kind: "all" };
}

// 율 글자 — 비면 null, 숫자가 아니거나 0 ~ 100 밖이면 NaN.
function parseRate(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const rate = Number(trimmed);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : Number.NaN;
}

export function CommissionPanel({
  rows,
  subcategoryLabel,
  onFill,
  onClose,
}: {
  rows: readonly CommissionBaseRow[];
  subcategoryLabel: (value: string) => string;
  onFill: (amountKrw: number, ratePercent: number) => void;
  onClose: () => void;
}) {
  const [rateText, setRateText] = useState("");
  const [basisValue, setBasisValue] = useState("all");
  const majors = commissionMajors(rows, subcategoryLabel);
  const rate = parseRate(rateText);
  const base = commissionBase(rows, basisFromValue(basisValue), subcategoryLabel);
  const fee = rate !== null && !Number.isNaN(rate) ? commissionAmount(base, rate) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rate === null || Number.isNaN(rate) || fee === null) return;
    onFill(fee, rate);
  }

  return (
    <SidePanel title="수수료 계산" onClose={onClose} returnFocus={false}>
      <PanelForm id="commission-calc" label="금액 채우기" intent="edit" onSubmit={handleSubmit} blockedReason={rate === null ? RATE_EMPTY : undefined} dirtyFields={[]}>
        <TextField
          id="commission-rate"
          label="율(%)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="5"
          value={rateText}
          onChange={(event) => setRateText(event.target.value)}
          error={rate !== null && Number.isNaN(rate) ? RATE_INVALID : undefined}
        />
        <Form.Field id="commission-basis" label="기준" width="select">
          <Select
            id="commission-basis"
            options={[
              { value: "all", label: "전체" },
              ...majors.flatMap((major) => [
                { value: `only:${major}`, label: `${major}만` },
                { value: `except:${major}`, label: `${major} 제외` },
              ]),
            ]}
            hideEmptyOption
            value={basisValue}
            onChange={(event) => setBasisValue(event.target.value)}
          />
        </Form.Field>
        <p className={styles.commissionResult}>
          {base === 0 ? (
            <>
              기준 합 <strong>0</strong> · 기준 바꾸기
            </>
          ) : (
            <>
              기준 합 <strong><Num value={base} /></strong>
              {fee !== null ? (
                <>
                  {" "}· 수수료 <strong><Num value={fee} /></strong>
                </>
              ) : null}
            </>
          )}
        </p>
      </PanelForm>
    </SidePanel>
  );
}
