"use client";

import { createContext, useContext, useId, useState, type FormEvent, type ReactNode } from "react";
import { Form } from "@/ui/form/Form";
import { TextField } from "@/ui/input/TextField";
import { PanelForm } from "@/ui/side-panel/PanelForm";
import { usePanel } from "@/ui/side-panel/SidePanel";
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

// 04.3-10 Task 1 ⑧ — I′2 옆 패널 폼(UI-SPEC I′2 · T6 · T9). 04.6-23(Q1 A): 패널은 서버 `page.tsx`가 `?new=1`로 판정해 그리는 URL `SidePanel`이고
// 여는 요소는 목록 1차 링크 · 빈 목록 링크다(R4 — 패널이 열려도 렌더에 남는다). 이 파일은 폼(`RequestForm`)과, 패널이 URL로 사라진 뒤에도
// 남아야 하는 성공 토스트의 자리(`RequestToastHost` — 목록을 감싸는 클라이언트 경계)만 가진다. 판정(막힘 · 계산 줄 · 응답 갈래)은
// request-rules.ts만 부른다. 요청 키는 보낸 이름 · 날짜에 묶는다 — 같은 내용 재시도는 같은 키, 고쳐 보내면 새 키.

const FORM_ID = "cert-qr-request";
const NAME_ID = "cert-qr-request-name";
const WON_ON_ID = "cert-qr-request-won-on";
const RESPONSE_TIMEOUT_MS = 20_000;
const FOCUS_TRIES = 100;

const ToastContext = createContext<((message: string | null) => void) | null>(null);

/** 목록을 감싼다 — 토스트 상태를 패널 밖에 둬서 패널이 URL로 닫혀도 성공 토스트가 사라지지 않는다(Q2 A). */
export function RequestToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  return (
    <ToastContext.Provider value={setToast}>
      {children}
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </ToastContext.Provider>
  );
}

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

// 패널이 URL로 사라지고 액션이 다시 그린 목록에 새 행이 붙으면 그 행 링크로 포커스(다시 그리기 · 패널 닫힘은 응답과 같은 틱이 아닐 수 있다).
// 패널이 아직 있으면 뒤 목록이 비활성이라 기다린다 — 닫히는 쪽이 포커스를 가져가지 않으므로(`returnFocus: false`) 여기서 한 번만 옮긴다.
function focusRowWhenPresent(eventId: string, tries = FOCUS_TRIES): void {
  const panelOpen = document.querySelector('dialog[data-ui="side-panel"]') !== null;
  const link = panelOpen ? null : document.querySelector<HTMLElement>(`a[data-row-link][href="/certs/events/${eventId}"]`);
  if (link) {
    link.focus();
    return;
  }
  if (tries > 0) setTimeout(() => focusRowWhenPresent(eventId, tries - 1), 50);
}

export function RequestForm({
  today,
  nowIso,
  contactMissing: initialContactMissing,
  canOpenSettings,
  linkExpireHours,
}: {
  /** 서버가 렌더 때 준 오늘(KST) — 지난 날짜 막힘 · 날짜 칸 min. */
  today: string;
  /** 서버가 렌더 때 준 지금 — 계산 줄의 「지금」(렌더 중 시각을 읽지 않는다). */
  nowIso: string;
  contactMissing: boolean;
  canOpenSettings: boolean;
  linkExpireHours: number;
}) {
  const hintId = useId();
  const panel = usePanel();
  const setToast = useContext(ToastContext);
  const [name, setName] = useState("");
  const [wonOn, setWonOn] = useState("");
  const [requestKey, setRequestKey] = useState<RequestKey | null>(null);
  const [pending, setPending] = useState(false);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; wonOn?: string }>({});
  const [contactMissing, setContactMissing] = useState(initialContactMissing);
  const [now] = useState(() => new Date(nowIso));

  // 성공 닫기 — 포커스는 여는 링크가 아니라 새 줄이 가져간다(`focusRowWhenPresent`).
  function resetAndClose(focusOpener: boolean) {
    panel?.requestClose("success", { returnFocus: focusOpener });
  }

  const block = requestBlockReason({ contactMissing, canOpenSettings, name, wonOn, today });
  const windowLine = linkWindowLine({ wonOn, today, now, expireHours: linkExpireHours });

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
      setToast?.(`QR 생성 신청 · ${sentName}`);
      focusRowWhenPresent(outcome.eventId);
      return;
    }
    if (outcome.kind === "contactMissing") setContactMissing(true);
    else if (outcome.kind === "invalid") setFieldErrors(requestFieldErrorText(outcome.fieldErrors));
    else setResultLine(REQUEST_UNKNOWN_TEXT);
  }

  return (
    <PanelForm
      id={FORM_ID}
      label="QR 생성 신청"
      intent="create"
      onSubmit={(event) => void handleSubmit(event)}
      pending={pending}
      blockedReason={block?.text}
      status={resultLine ?? undefined}
    >
      <TextField
        id={NAME_ID}
        name="name"
        label="행사 이름"
        autoComplete="off"
        maxLength={80}
        readOnly={pending}
        value={name}
        onChange={(event) => {
          setName(event.currentTarget.value);
          setFieldErrors((prev) => ({ ...prev, name: undefined }));
          setResultLine(null);
        }}
        error={fieldErrors.name}
      />
      <TextField
        id={WON_ON_ID}
        name="wonOn"
        label="당첨일"
        type="date"
        min={today}
        readOnly={pending}
        value={wonOn}
        onChange={(event) => {
          setWonOn(event.currentTarget.value);
          setFieldErrors((prev) => ({ ...prev, wonOn: undefined }));
          setResultLine(null);
        }}
        error={fieldErrors.wonOn}
        hintId={windowLine ? hintId : undefined}
      />
      {windowLine ? (
        <div id={hintId}>
          <Form.Hint>{windowLine}</Form.Hint>
        </div>
      ) : null}
    </PanelForm>
  );
}
