"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Form } from "@/ui/form/Form";
import { Button } from "@/ui/button/Button";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { PanelForm } from "@/ui/side-panel/PanelForm";
import { Toast } from "@/ui/toast/Toast";
import { requestCertQrAction } from "./actions";
import {
  REQUEST_UNKNOWN_TEXT,
  linkWindowLine,
  requestBlockReason,
  requestFieldErrorText,
  requestKeyFor,
  requestOutcome,
  type RequestKey,
} from "./request-rules";
import styles from "./events.module.css";

// 04.3-10 Task 1 ⑧ — I′1 표 위 1차 「QR 생성 신청」 · EMPTY 3차 · I′2 옆 패널(UI-SPEC I′1 · I′2 · T6 · T9). 1차는 모든 폭에
// 있다(칸 둘 폼이라 D-10 제한이 풀린다). 04.6-04(Q1 A): 패널은 새 `SidePanel`(모든 폭 모달 · 제어 형태 `onClose`) + `PanelForm`이고,
// 패널이 열려 있어도 여는 요소는 렌더에 남는다(R4 — 뒤는 네이티브 모달이 막는다). 판정(막힘 · 계산 줄 ·
// 응답 갈래)은 request-rules.ts만 부른다. 요청 키는 보낸 이름 · 날짜에 묶는다 — 같은 내용 재시도는 같은 키, 고쳐 보내면 새 키.

const FORM_ID = "cert-qr-request";
const NAME_ID = "cert-qr-request-name";
const WON_ON_ID = "cert-qr-request-won-on";
const RESPONSE_TIMEOUT_MS = 20_000;
const FOCUS_TRIES = 40;

async function callWithin(call: () => Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<unknown>((resolve) => {
    timer = setTimeout(() => resolve("unreachable"), RESPONSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([call(), timeout]);
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

// 액션이 다시 그린 목록에 새 행이 붙으면 그 행 링크로 포커스(다시 그리기는 응답과 같은 틱이 아닐 수 있다).
function focusRowWhenPresent(eventId: string, tries = FOCUS_TRIES): void {
  const link = document.querySelector<HTMLElement>(`a[data-row-link][href="/certs/events/${eventId}"]`);
  if (link) {
    link.focus();
    return;
  }
  if (tries > 0) setTimeout(() => focusRowWhenPresent(eventId, tries - 1), 50);
}

export function RequestEntry({
  canRequest,
  empty,
  today,
  contactMissing: initialContactMissing,
  canOpenSettings,
  linkExpireHours,
  children,
}: {
  canRequest: boolean;
  empty: boolean;
  /** 서버가 렌더 때 준 오늘(KST) — 지난 날짜 막힘 · 날짜 칸 min. */
  today: string;
  contactMissing: boolean;
  canOpenSettings: boolean;
  linkExpireHours: number;
  children: ReactNode;
}) {
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState(true);
  const [name, setName] = useState("");
  const [wonOn, setWonOn] = useState("");
  const [requestKey, setRequestKey] = useState<RequestKey | null>(null);
  const [pending, setPending] = useState(false);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; wonOn?: string }>({});
  const [contactMissing, setContactMissing] = useState(initialContactMissing);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  if (!canRequest) return empty ? <ListEmpty message="확인증 행사가 없습니다" /> : <>{children}</>;

  function openPanel() {
    // 계산 줄의 「지금」 — 패널을 열 때 한 번(렌더 중 시각을 읽지 않는다).
    setNow(new Date());
    setRequestKey(null);
    setReturnFocus(true);
    setResultLine(null);
    setFieldErrors({});
    setOpen(true);
  }

  function resetAndClose(focusOpener: boolean) {
    // 같은 렌더에서 패널이 사라지므로 returnFocus를 먼저 반영한다 — 거짓이면 SidePanel이 연 요소로 포커스를 돌리지 않는다.
    flushSync(() => setReturnFocus(focusOpener));
    setOpen(false);
    setName("");
    setWonOn("");
    setResultLine(null);
    setFieldErrors({});
  }

  const block = requestBlockReason({ contactMissing, canOpenSettings, name, wonOn, today });
  const windowLine = now ? linkWindowLine({ wonOn, today, now, expireHours: linkExpireHours }) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || block) return;
    setPending(true);
    setResultLine(null);
    const sentName = name.normalize("NFC").trim();
    const sent = requestKeyFor(requestKey, { name, wonOn }, () => crypto.randomUUID());
    setRequestKey(sent);
    const outcome = requestOutcome(await callWithin(() => requestCertQrAction({ name, wonOn, requestId: sent.key })));
    setPending(false);
    if (outcome.kind === "ok") {
      resetAndClose(false);
      setToast(`QR 생성 신청 · ${sentName}`);
      focusRowWhenPresent(outcome.eventId);
      return;
    }
    if (outcome.kind === "contactMissing") setContactMissing(true);
    else if (outcome.kind === "invalid") setFieldErrors(requestFieldErrorText(outcome.fieldErrors));
    else setResultLine(REQUEST_UNKNOWN_TEXT);
  }

  const nameError = fieldErrors.name;
  const wonOnError = fieldErrors.wonOn;

  return (
    <>
      {/* 여는 요소는 패널이 열린 동안에도 렌더에 남는다(R4) — 닫힌 뒤 포커스가 돌아갈 자리다. 뒤는 모달이 막는다. */}
      {!empty ? (
        <div className={styles.actionRow}>
          <Button variant="primary" onClick={openPanel}>
            QR 생성 신청
          </Button>
        </div>
      ) : null}

      {empty ? (
        <ListEmpty message="확인증 행사가 없습니다" action={{ label: "QR 생성 신청", onClick: openPanel }} />
      ) : (
        children
      )}

      {open ? (
        <SidePanel title="QR 생성 신청" onClose={() => resetAndClose(true)} returnFocus={returnFocus}>
          <PanelForm
            id={FORM_ID}
            label="QR 생성 신청"
            intent="create"
            onSubmit={(event) => void handleSubmit(event)}
            pending={pending}
            blockedReason={block?.text}
            status={resultLine ?? undefined}
          >
            <Form.Field id={NAME_ID} label="행사 이름" width="long">
              <input
                id={NAME_ID}
                name="name"
                type="text"
                autoComplete="off"
                maxLength={80}
                readOnly={pending}
                className={styles.textInput}
                value={name}
                onChange={(event) => {
                  setName(event.currentTarget.value);
                  setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  setResultLine(null);
                }}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `${NAME_ID}-error` : undefined}
              />
              {nameError ? <Form.Error id={`${NAME_ID}-error`}>{nameError}</Form.Error> : null}
            </Form.Field>
            <Form.Field id={WON_ON_ID} label="당첨일" width="short">
              <input
                id={WON_ON_ID}
                name="wonOn"
                type="date"
                min={today}
                readOnly={pending}
                className={styles.textInput}
                value={wonOn}
                onChange={(event) => {
                  setWonOn(event.currentTarget.value);
                  setFieldErrors((prev) => ({ ...prev, wonOn: undefined }));
                  setResultLine(null);
                }}
                aria-invalid={wonOnError ? true : undefined}
                aria-describedby={[wonOnError ? `${WON_ON_ID}-error` : null, windowLine ? hintId : null].filter(Boolean).join(" ") || undefined}
              />
              {wonOnError ? <Form.Error id={`${WON_ON_ID}-error`}>{wonOnError}</Form.Error> : null}
              {windowLine ? (
                <div id={hintId}>
                  <Form.Hint>{windowLine}</Form.Hint>
                </div>
              ) : null}
            </Form.Field>
          </PanelForm>
        </SidePanel>
      ) : null}

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
