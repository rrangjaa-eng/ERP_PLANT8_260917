"use client";

import { useId, useState } from "react";
import { Button } from "@/ui/button/Button";
import styles from "./intake.module.css";

// 04.3-06 Task 2 ③ — 동의 블록(UI-SPEC E4 「동의」 · 개정 ①-f · ①-g). 서명 바로
// 위, 위아래 1px 선. 「전문 보기」는 같은 블록 안 제자리 펼침이다.
// 전문은 **법무 확인 전 초안**이다 — 바꾸면 domain/certs/consent.ts의
// CERT_CONSENT_VERSION을 올린다. 수령자 화면 금지어 둘은 쓰지 않는다.
export const CONSENT_CHECKBOX_ID = "cert-consent";

function consentSummary(parcel: boolean, retentionYears: number): string {
  return `수집 항목 이름 · 주민등록번호 · ${parcel ? "주소 · " : ""}연락처 · 서명 — 기타소득 세무 신고와 경품 전달에만 씁니다. 제출한 해가 끝나고 법정 신고기한이 지난 날부터 ${retentionYears}년 동안 보관한 뒤 파기합니다. 동의하지 않으면 경품을 드릴 수 없습니다.`;
}

function consentFullText(parcel: boolean, retentionYears: number): { title: string; body: string }[] {
  return [
    {
      title: "근거 법령",
      body: "개인정보 보호법 제15조(개인정보의 수집·이용) · 제24조의2(주민등록번호 처리의 제한)와 소득세법의 기타소득 세무 신고 규정에 따라 처리합니다.",
    },
    {
      title: "수집 항목",
      body: `이름 · 주민등록번호 · ${parcel ? "주소 · " : ""}연락처 · 서명 이미지, 그리고 담당자가 당첨자로 등록한 이름과 전화번호.`,
    },
    { title: "이용 목적", body: "기타소득 세무 신고와 경품 전달." },
    {
      title: "보존 기간",
      body: `제출한 해가 끝나고 법정 신고기한이 지난 날부터 ${retentionYears}년.`,
    },
    { title: "파기", body: "보존 기간이 지나면 위 항목을 지웁니다." },
    { title: "제공", body: "국세청 세무 신고 목적으로만 제공합니다." },
    {
      title: "거부 권리와 불이익",
      body: "동의하지 않을 수 있습니다. 동의하지 않으면 기타소득 세무 신고를 할 수 없어 경품을 드릴 수 없습니다.",
    },
  ];
}

export function ConsentBlock({
  checked,
  parcel,
  retentionYears,
  invalid,
  onChange,
}: {
  checked: boolean;
  parcel: boolean;
  retentionYears: number;
  invalid?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const summaryId = useId();
  const fullId = useId();

  return (
    <div className={styles.consentBlock}>
      <label className={styles.consentLabel}>
        <input
          id={CONSENT_CHECKBOX_ID}
          type="checkbox"
          className={styles.consentBox}
          checked={checked}
          aria-describedby={summaryId}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        <span>개인정보 수집·이용에 동의합니다</span>
      </label>
      <p id={summaryId} className={styles.consentSummary}>
        {consentSummary(parcel, retentionYears)}
      </p>
      <Button
        variant="tertiary"
        className={styles.consentToggle}
        aria-expanded={open}
        aria-controls={fullId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "전문 접기" : "전문 보기"}
      </Button>
      <div id={fullId} hidden={!open} className={styles.consentFull}>
        {consentFullText(parcel, retentionYears).map((section) => (
          <p key={section.title}>
            <strong>{section.title}</strong> · {section.body}
          </p>
        ))}
      </div>
    </div>
  );
}
