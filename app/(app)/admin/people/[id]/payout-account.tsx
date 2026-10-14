"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { revealPersonAccountNumberAction, updatePersonPayoutAccountAction } from "./actions";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList } from "@/ui/kv-list/KvList";
import { TextField } from "@/ui/input/TextField";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { fieldErrorsReason, formReason } from "@/lib/actions/form-reason";
import { AccountNumberCell } from "@/app/(app)/admin/vendors/account-number";
import vendorStyles from "@/app/(app)/admin/vendors/vendors.module.css";

// 06.5-04(D-6505 · UI-SPEC V2): 사람 상세 「지급 계좌」 — 읽기는 섹션 안 KvList 3행, 입력은 옆 패널(`?editAccount=1`).
// 게이트(`expenses.payments` 쓰기 ∧ `admin.people` 보기) 밖이면 페이지가 이 파일을 그리지 않는다(문구 없음).
// 칸 이름 · 순서는 거래처 폼(vendor-form.tsx)과 같다. 판정(예금주 필요 · 은행 코드 · 예금주 바이트)은 서버가 한다.

export type PayoutAccountView = {
  bank: string | null;
  holder: string | null;
  /** 서버가 maskTail4로 만든 문자열 — 번호가 없으면 빈 문자열. */
  masked: string;
};

export function PayoutAccountSection({
  userId,
  account,
  canReveal,
  editHref,
}: {
  userId: string;
  account: PayoutAccountView;
  /** 해제 항목(`vendor.account_number_unmasked`) — 거짓이면 `번호 보기`를 그리지 않는다(문구 없음). */
  canReveal: boolean;
  editHref: string;
}) {
  const empty = !account.bank && !account.holder && !account.masked;
  return (
    // 섹션 틀은 `DetailScreen.Section` — 접근 가능한 이름은 바깥 region이 지킨다(연차 섹션과 같은 꼴).
    <div role="region" aria-label="지급 계좌">
      <DetailScreen.Section title="지급 계좌">
        <div className="single-column">
          <KvList
            items={[
              { label: "은행", value: account.bank ?? "—" },
              { label: "예금주", value: account.holder ?? "—" },
              {
                label: "계좌번호",
                value: <AccountNumberCell id={userId} masked={account.masked} canReveal={canReveal} revealAction={revealPersonAccountNumberAction} />,
              },
            ]}
          />
          {/* 3차는 글자만 바뀌는 같은 요소 — 저장 뒤 SidePanel이 연 요소(이 링크)로 포커스를 돌린다. */}
          <p style={{ margin: "var(--s-4) 0 0" }}>
            <Link href={editHref} className={buttonLinkClassName("tertiary")}>
              {empty ? "계좌 적기" : "계좌 바꾸기"}
            </Link>
          </p>
        </div>
      </DetailScreen.Section>
    </div>
  );
}

const FIELD_LABELS = { accountBank: "계좌 은행", accountHolder: "예금주" } as const;

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function PayoutAccountPanel({ userId, account }: { userId: string; account: PayoutAccountView }) {
  const panelRef = useRef<PanelFormHandle>(null);
  const [clearAccountNumber, setClearAccountNumber] = useState(false);
  const { execute, result, isExecuting } = useAction(updatePersonPayoutAccountAction, {
    onSuccess: () => panelRef.current?.succeed(),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      id: userId,
      accountBank: getStringField(formData, "accountBank"),
      accountHolder: getStringField(formData, "accountHolder"),
      // 「지우기」 체크 = null(지움) · 빈 칸 = 안 바꿈 · 값 = 새 번호(거래처 폼과 같은 규칙).
      accountNumber: clearAccountNumber ? null : getStringField(formData, "accountNumber") || undefined,
    });
  }

  const bankError = result.validationErrors?.accountBank?._errors?.[0];
  const holderError = result.validationErrors?.accountHolder?._errors?.[0];
  const errorFields: { label: string; id: string }[] = [];
  if (bankError) errorFields.push({ label: FIELD_LABELS.accountBank, id: "accountBank" });
  if (holderError) errorFields.push({ label: FIELD_LABELS.accountHolder, id: "accountHolder" });
  const firstErrorId = errorFields[0]?.id;
  const summary = errorFields.length > 0 ? fieldErrorsReason("수정", errorFields.map((field) => field.label)) : null;
  const serverReason = !summary && result.serverError ? formReason("수정", result.serverError) : null;

  // 칸 오류가 오면 첫 오류 칸으로 포커스(SYSTEM §7-2 · UI-SPEC V3 「칸 오류」).
  useEffect(() => {
    if (firstErrorId) document.getElementById(firstErrorId)?.focus();
  }, [result.validationErrors, firstErrorId]);

  const reasonNode = summary ? (
    <>
      {summary.text}
      <Button variant="tertiary" onClick={() => document.getElementById(firstErrorId ?? "")?.focus()}>
        {summary.fix}
      </Button>
    </>
  ) : (
    (serverReason?.text ?? null)
  );

  return (
    <PanelForm
      ref={panelRef}
      id="payout-account-form"
      label="계좌 저장"
      intent="edit"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={reasonNode}
      reasonId="payout-account-form-reason"
    >
      <TextField id="accountBank" name="accountBank" label={FIELD_LABELS.accountBank} defaultValue={account.bank ?? undefined} error={bankError} />
      <TextField
        id="accountHolder"
        name="accountHolder"
        label={FIELD_LABELS.accountHolder}
        defaultValue={account.holder ?? undefined}
        error={holderError}
      />
      <div className={vendorStyles.accountEdit}>
        {!clearAccountNumber ? (
          <TextField
            id="accountNumber"
            name="accountNumber"
            label="새 계좌번호"
            autoComplete="off"
            inputMode="numeric"
            hintId="accountNumber-current"
          />
        ) : null}
        <p id="accountNumber-current" className={vendorStyles.hint}>
          {account.masked ? `현재 ${account.masked}` : "등록된 계좌번호 없음"}
        </p>
        {account.masked ? (
          <label className={vendorStyles.clearRow}>
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
    </PanelForm>
  );
}
