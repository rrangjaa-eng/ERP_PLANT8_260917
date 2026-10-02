"use client";

import { useId, useState } from "react";
import { Button } from "@/ui/button/Button";
import { CONTACT_PHONE_SLOT, certCollectionNotice } from "@/domain/certs/consent";
import { formatContactPhone } from "@/domain/certs/format";
import styles from "./intake.module.css";

// 04.3-06 Task 2 ③ · 04.3-14 사용자 결정 ① — 수집 안내 블록(SYSTEM §6-5 「수집 안내」). 동의가 아니라 법령에 따른 수집
// 안내 + 안내 확인 체크다. 서명 바로 위, 위아래 1px 선. 「전문 보기」는 같은 블록 안 제자리 펼침이다. 요약 · 전문 문장은
// domain/certs/consent.ts에서만 받는다(화면에 문장을 두지 않는다 — 판별 전문). 전문은 <dl>(절 제목 <dt> · 본문 <dd> — G0 DR-7),
// 1절의 문의 전화는 그 행사 문의 전화의 tel: 링크다(G9 a).
export const CONSENT_CHECKBOX_ID = "cert-consent";

function SectionBody({ body, contactPhone }: { body: string; contactPhone: string }) {
  const at = body.indexOf(CONTACT_PHONE_SLOT);
  if (at < 0) return body;
  return (
    <>
      {body.slice(0, at)}
      <a href={`tel:${contactPhone}`} className={styles.telLink}>
        {formatContactPhone(contactPhone)}
      </a>
      {body.slice(at + CONTACT_PHONE_SLOT.length)}
    </>
  );
}

export function ConsentBlock({
  checked,
  parcel,
  retentionYears,
  contactPhone,
  invalid,
  onChange,
}: {
  checked: boolean;
  parcel: boolean;
  retentionYears: number;
  contactPhone: string;
  invalid?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const summaryId = useId();
  const fullId = useId();
  const notice = certCollectionNotice({ parcel, retentionYears });

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
        <span>수집 안내를 확인했습니다</span>
      </label>
      <p id={summaryId} className={styles.consentSummary}>
        {notice.summary}
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
        <dl>
          {notice.sections.map((section) => (
            <div key={section.title}>
              <dt>{section.title}</dt>
              <dd>
                <SectionBody body={section.body} contactPhone={contactPhone} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
