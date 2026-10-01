"use client";

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Form } from "@/ui/form/Form";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { Toast } from "@/ui/toast/Toast";
import { requestCertQrAction } from "./actions";
import {
  REQUEST_UNKNOWN_TEXT,
  linkWindowLine,
  requestBlockReason,
  requestFieldErrorText,
  requestOutcome,
} from "./request-rules";
import styles from "./events.module.css";

// 04.3-10 Task 1 ⑧ — I′1 표 위 1차 「QR 생성 신청」 · EMPTY 3차 · I′2 옆 패널(UI-SPEC I′1 · I′2 · T6 · T9). 1차는 모든 폭에
// 있고(칸 둘 폼이라 D-10 제한이 풀린다) 패널이 열린 동안 렌더하지 않는다(한 화면 1차 하나 — DR-9). 판정(막힘 · 계산 줄 ·
// 응답 갈래)은 request-rules.ts만 부른다. 요청 키는 패널을 열 때 한 번 만들고 결과 불명 재시도에 같은 키를 쓴다.

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
  const blockId = useId();
  const [open, setOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState(true);
  const [name, setName] = useState("");
  const [wonOn, setWonOn] = useState("");
  const [requestId, setRequestId] = useState("");
  const [pending, setPending] = useState(false);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; wonOn?: string }>({});
  const [contactMissing, setContactMissing] = useState(initialContactMissing);
  const [discardCount, setDiscardCount] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  // 닫히면 연 자리(표 위 1차 · EMPTY 3차)의 버튼으로 — 패널이 열린 동안 1차는 없으니 닫힌 뒤 DOM에서 찾는다.
  const primaryWrapRef = useRef<HTMLSpanElement>(null);
  const emptyWrapRef = useRef<HTMLDivElement>(null);
  const openedFromRef = useRef<"primary" | "empty">("primary");
  const opener = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const wrap = openedFromRef.current === "empty" ? emptyWrapRef.current : primaryWrapRef.current;
        return wrap?.querySelector<HTMLElement>("button") ?? null;
      },
    }),
    [],
  );

  if (!canRequest) return empty ? <ListEmpty message="확인증 행사가 없습니다" /> : <>{children}</>;

  function openPanel(from: "primary" | "empty") {
    openedFromRef.current = from;
    // 계산 줄의 「지금」 — 패널을 열 때 한 번(렌더 중 시각을 읽지 않는다).
    setNow(new Date());
    setRequestId(crypto.randomUUID());
    setReturnFocus(true);
    setResultLine(null);
    setFieldErrors({});
    setOpen(true);
  }

  function resetAndClose(focusOpener: boolean) {
    setReturnFocus(focusOpener);
    setOpen(false);
    setName("");
    setWonOn("");
    setResultLine(null);
    setFieldErrors({});
  }

  // Esc · × · 2차 — 칸 둘 가운데 적은 칸이 있으면 입력 버리기 확인(기존 규칙 — 칸 둘만 센다).
  function requestClose() {
    if (pending) return;
    const changed = (name.trim() === "" ? 0 : 1) + (wonOn === "" ? 0 : 1);
    if (changed === 0) resetAndClose(true);
    else setDiscardCount(changed);
  }

  const block = requestBlockReason({ contactMissing, canOpenSettings, name, wonOn, today });
  const windowLine = now ? linkWindowLine({ wonOn, today, now, expireHours: linkExpireHours }) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || block) return;
    setPending(true);
    setResultLine(null);
    const sentName = name.normalize("NFC").trim();
    const outcome = requestOutcome(await callWithin(() => requestCertQrAction({ name, wonOn, requestId })));
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
      {/* 행동 줄은 패널이 열린 동안에도 자리를 지킨다 — 1차만 렌더하지 않아(DR-9) 목록 표가 위로 움직이지 않는다(DOM 감사 A-M2). */}
      {!empty ? (
        <div className={styles.actionRow}>
          {!open ? (
            <span ref={primaryWrapRef}>
              <Button variant="primary" onClick={() => openPanel("primary")}>
                QR 생성 신청
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}

      {empty ? (
        <div ref={emptyWrapRef}>
          {/* 패널이 열린 동안에는 여는 3차도 없다 — 화면에 같은 이름의 버튼이 패널 1차 하나뿐(DR-9와 같은 결). */}
          <ListEmpty
            message="확인증 행사가 없습니다"
            action={open ? undefined : { label: "QR 생성 신청", onClick: () => openPanel("empty") }}
          />
        </div>
      ) : (
        children
      )}

      <SidePanel
        open={open}
        onClose={requestClose}
        title="QR 생성 신청"
        opener={opener}
        returnFocus={returnFocus}
        actions={
          <>
            {/* 막힘 이유는 행동 줄 맨 앞 전폭 한 줄 — 버튼 둘은 늘 2차 왼쪽 · 1차 오른쪽 끝에 서고 이유 유무로 움직이지 않는다
                (SYSTEM §7-8 · DOM 감사 A-M1). 1차는 aria-describedby로 이 줄을 가리킨다. */}
            {block && !pending ? (
              <p id={blockId} className={styles.resultLine}>
                {block.text}
              </p>
            ) : null}
            {resultLine ? (
              <p className={styles.resultLine} role="status">
                {resultLine}
              </p>
            ) : null}
            <Button variant="secondary" shortcut="Esc" disabled={pending} onClick={requestClose}>
              취소
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              variant="primary"
              pending={pending}
              disabled={block !== null}
              aria-describedby={block && !pending ? blockId : undefined}
            >
              QR 생성 신청
            </Button>
          </>
        }
      >
        <Form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)}>
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
        </Form>
      </SidePanel>

      <ConfirmDialog
        open={discardCount !== null}
        onClose={() => setDiscardCount(null)}
        title="입력 버리기"
        subtitle={`QR 생성 신청 · ${discardCount ?? 0}칸`}
        primary={{
          label: "입력 버리기",
          onConfirm: () => {
            setDiscardCount(null);
            resetAndClose(true);
          },
        }}
      />

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
