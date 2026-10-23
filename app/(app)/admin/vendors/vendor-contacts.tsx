"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import styles from "./vendors.module.css";

// 07-23 SC-17 ⑦ · V7 · N4 · U12: 거래처 패널 `담당자` 반복 줄(이름 · 연락처 · 이메일, 최대 5명). 값은 폼 칸 그대로(FormData — 같은 이름의 칸을
// 문서 순서대로 읽는다, readContacts). 줄 `삭제`는 저장 전 폼 상태에서 바로 지운다 — 확인 창 · 알림 · 결과 줄 없음(패널 `취소 Esc`가 되돌리기).
// 줄 마지막 칸(이메일)의 Enter는 폼을 제출하지 않고 다음 줄 첫 칸(없으면 `담당자 더하기`)으로 포커스만 옮긴다.

export const VENDOR_CONTACTS_MAX = 5;
export const CONTACTS_ADD_ID = "vendor-contacts-add";

export type VendorContactValue = { id: string; name: string; phone: string | null; email: string | null };

type Row = { key: string; id: string; name: string; phone: string; email: string };

// 새 줄 키만 이 카운터로 만든다 — 저장된 줄은 담당자 id로 만든다. 모듈 카운터는 서버 렌더와 브라우저에서 값이 갈라져(서버는 요청마다 쌓인다)
// 저장된 줄 칸 id가 하이드레이션 뒤에도 서버 값으로 남고, Enter · `삭제` 포커스가 그 id를 못 찾았다(07-23 DOM 감사 P1).
let rowSeq = 0;
function nextKey(): string {
  rowSeq += 1;
  return `contact-${rowSeq}`;
}

function nameIdOf(key: string): string {
  return `${key}-name`;
}

// 저장할 담당자 목록 — 줄마다 같은 이름의 칸 넷(문서 순서 = 화면 순서 = 정한 순서). 새 줄은 id가 빈 값이라 보내지 않는다.
export function readContacts(formData: FormData): { id?: string; name: string; phone: string | null; email: string | null }[] {
  // 글자 칸만 있다 — 파일 값은 빈 글자로 본다.
  const texts = (key: string) => formData.getAll(key).map((value) => (typeof value === "string" ? value : ""));
  const ids = texts("contactId");
  const phones = texts("contactPhone");
  const emails = texts("contactEmail");
  return texts("contactName").map((name, index) => {
    const id = ids[index] ?? "";
    return { ...(id ? { id } : {}), name, phone: phones[index] || null, email: emails[index] || null };
  });
}

export function VendorContacts({ initial, error }: { initial: VendorContactValue[]; error?: string }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((item) => ({ key: `contact-${item.id}`, id: item.id, name: item.name, phone: item.phone ?? "", email: item.email ?? "" })),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  // 줄을 더하거나 지운 뒤 옮길 포커스 — 그린 다음에 옮긴다.
  const focusAfterRef = useRef<string | null>(null);
  const firstRenderRef = useRef(true);
  const full = rows.length >= VENDOR_CONTACTS_MAX;

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    // 줄을 더하거나 지운 것도 바뀐 칸이다 — 패널의 「입력 버리기」 판정(PanelForm은 입력 이벤트마다 다시 센다)에 알린다.
    containerRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    const target = focusAfterRef.current;
    focusAfterRef.current = null;
    if (target) document.getElementById(target)?.focus();
  }, [rows]);

  function addRow() {
    if (full) return;
    const row: Row = { key: nextKey(), id: "", name: "", phone: "", email: "" };
    focusAfterRef.current = nameIdOf(row.key);
    setRows((current) => [...current, row]);
  }

  function removeRow(key: string) {
    const index = rows.findIndex((row) => row.key === key);
    const next = rows[index + 1];
    // 누른 `삭제`가 사라진다 — 다음 줄의 `삭제`로(키보드로 이어서 지운다), 없으면 `담당자 더하기`로.
    focusAfterRef.current = next ? `${next.key}-remove` : CONTACTS_ADD_ID;
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function moveOnEnter(event: KeyboardEvent<HTMLInputElement>, key: string) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const index = rows.findIndex((row) => row.key === key);
    const next = rows[index + 1];
    document.getElementById(next ? nameIdOf(next.key) : CONTACTS_ADD_ID)?.focus();
  }

  return (
    <div ref={containerRef} className={styles.contacts} role="group" aria-labelledby="vendor-contacts-title">
      <p id="vendor-contacts-title" className={styles.contactsTitle}>
        담당자
      </p>
      {rows.map((row) => (
        <div key={row.key} className={styles.contactRow} data-contact-row="">
          <input type="hidden" name="contactId" value={row.id} />
          <TextField id={nameIdOf(row.key)} name="contactName" label="이름" defaultValue={row.name} autoComplete="off" />
          <TextField id={`${row.key}-phone`} name="contactPhone" label="연락처" defaultValue={row.phone} inputMode="tel" autoComplete="off" />
          <TextField
            id={`${row.key}-email`}
            name="contactEmail"
            label="이메일"
            defaultValue={row.email}
            inputMode="email"
            autoComplete="off"
            onKeyDown={(event) => moveOnEnter(event, row.key)}
          />
          <span className={styles.contactRemove}>
            <Button id={`${row.key}-remove`} variant="tertiary" onClick={() => removeRow(row.key)}>
              삭제
            </Button>
          </span>
        </div>
      ))}
      {error ? <Form.Error id="vendor-contacts-error">{error}</Form.Error> : null}
      <Button id={CONTACTS_ADD_ID} variant="tertiary" disabled={full} disabledReason={full ? `최대 ${VENDOR_CONTACTS_MAX}명` : undefined} onClick={addRow}>
        담당자 더하기
      </Button>
    </div>
  );
}
