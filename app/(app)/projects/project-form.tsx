"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createProjectAction } from "./actions";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { isCtrlCombo } from "@/lib/shortcut";
import type { ProjectCopySource, ProjectInputFieldError } from "@/domain/projects";
import type { Currency } from "@/domain/money";
import { useCommaInput } from "@/ui/input/use-comma-input";
import styles from "./projects.module.css";

export type ProjectFormOption = { id: string; name: string };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// Esc(DR-27) 판정에 쓰는 칸 목록 — 이 칸들의 값이 처음 연 값과 하나라도
// 다르면 입력이 있다고 본다. isFormPristine은 04-46의 「취소 Esc」 버튼·
// 확인 모달 부제의 칸 수 계산이 같은 비교를 쓴다.
const PRISTINE_FIELDS = [
  "clientId",
  "name",
  "pmUserId",
  "teamId",
  "startDate",
  "endDate",
  "preEstimateAmount",
  "preEstimateCurrency",
  "preEstimateFxRate",
] as const;

// 04-15 — 1차 옆 `등록하지 못했습니다 · {칸} {n}칸`의 칸 이름(라벨 그대로).
const FIELD_LABELS: Record<ProjectInputFieldError["field"], string> = {
  startDate: "시작일",
  endDate: "종료일",
  preEstimateAmount: "총 매출 예상가",
  preEstimateFxRate: "총 매출 예상가",
};

function snapshotFormValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of PRISTINE_FIELDS) {
    values[key] = getStringField(formData, key);
  }
  return values;
}

function isFormPristine(initial: Record<string, string>, current: Record<string, string>): boolean {
  return PRISTINE_FIELDS.every((key) => initial[key] === current[key]);
}

// 04-46 Task 2(⑤, DR-27) — 「입력 버리기」 확인 부제의 칸 수. isFormPristine과
// 같은 비교에서 다른 칸만 센다.
function countDifferences(initial: Record<string, string>, current: Record<string, string>): number {
  return PRISTINE_FIELDS.filter((key) => initial[key] !== current[key]).length;
}

// SYSTEM.md §7-15 — 프로젝트 등록 폼. 필수 넷(클라이언트·프로젝트명·담당
// PM·팀), 기간은 선택(D-49). 상태·번호는 폼에 없다 — 등록은 항상
// 수주중이고 번호는 서버가 매긴다(D-42). `noValidate`는 `Form`이 이미
// 걸고 있어 이 파일 어디에도 `required`/`pattern` 네이티브 검증이 없다.
export function ProjectForm({
  clients,
  teams,
  pmUsers,
  cancelHref,
  usdDefaultFxRate,
  copySource = null,
}: {
  clients: ProjectFormOption[];
  teams: ProjectFormOption[];
  pmUsers: ProjectFormOption[];
  cancelHref: string;
  /** 04-15(D-71) — 통화를 USD로 고르면 환율 칸의 기본값(설정의 최근 USD 환율 실제 값). */
  usdDefaultFxRate: number;
  /** 04-15(D-70) — 복사 등록이면 출처 기본 정보(미리 채움 = Esc 판정의 처음 값, DR-27)와 줄 수. */
  copySource?: (ProjectCopySource & { projectId: string }) | null;
}) {
  const router = useRouter();

  // C-06 · 엔지 리뷰 C §1 P2 — 제출 래치. 성공 뒤 상세로 이동하기 전까지
  // isExecuting은 이미 거짓으로 돌아오므로 그 가드만으로는 이동 지연 사이의
  // 두 번째 제출을 막지 못한다. 래치는 오류(검증·서버) 응답에서만 내리고,
  // 성공이면 이동할 때까지 서 있는다(컴포넌트가 언마운트된다).
  const submittedRef = useRef(false);
  // Esc(DR-27) 판정 — 렌더 때 한 번 기록한 값 스냅숏. 복사 등록으로 칸이
  // 채워져 있으면 그 값이 「처음 연 값」이 된다.
  const initialValuesRef = useRef<Record<string, string> | null>(null);
  // 04-46 Task 2(⑤, DR-27) — 입력이 있는 폼의 Esc·「취소 Esc」가 여는 확인.
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardFieldCount, setDiscardFieldCount] = useState(0);

  // 04-15(D-52 · S2) — 총 매출 예상가(금액 + 통화 + 환율). 금액 칸은 04-09 쉼표 입력, KRW면 환율 칸이 숨는다.
  const [preEstimateCurrency, setPreEstimateCurrency] = useState<Currency>("KRW");
  const {
    inputRef: amountRef,
    value: amountText,
    onChange: onAmountChange,
    error: amountInputError,
    rawValue: amountRawValue,
  } = useCommaInput(preEstimateCurrency === "KRW" ? "krw" : "foreign", "");
  const {
    inputRef: fxRateRef,
    value: fxRateText,
    onChange: onFxRateChange,
    error: fxRateInputError,
    rawValue: fxRateRawValue,
  } = useCommaInput("fxRate", String(usdDefaultFxRate));

  const { execute, result, isExecuting } = useAction(createProjectAction, {
    onSuccess: ({ data }) => {
      if (data && "project" in data) router.push(`/projects/${data.project.id}`);
      // 칸 거부(rejected)면 이동하지 않는다 — 래치를 내려 다시 제출할 수 있게 한다.
      else submittedRef.current = false;
    },
    onError: () => {
      submittedRef.current = false;
    },
  });

  useEffect(() => {
    const form = document.getElementById("project-form");
    if (form instanceof HTMLFormElement) {
      initialValuesRef.current = snapshotFormValues(new FormData(form));
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittedRef.current || isExecuting) return;
    submittedRef.current = true;
    const formData = new FormData(event.currentTarget);
    const amountRaw = getStringField(formData, "preEstimateAmount");
    const currency: Currency = getStringField(formData, "preEstimateCurrency") === "USD" ? "USD" : "KRW";
    const fxRaw = getStringField(formData, "preEstimateFxRate");
    execute({
      clientId: getStringField(formData, "clientId"),
      name: getStringField(formData, "name"),
      pmUserId: getStringField(formData, "pmUserId"),
      teamId: getStringField(formData, "teamId"),
      startDate: getStringField(formData, "startDate") || undefined,
      endDate: getStringField(formData, "endDate") || undefined,
      copyFromProjectId: getStringField(formData, "copyFromProjectId") || undefined,
      // 빈 금액 칸은 보내지 않는다 — 04-01 기본 저장(원화 0 · KRW · 환율 1, B-37).
      preEstimate:
        amountRaw === ""
          ? undefined
          : { currency, amount: Number(amountRaw), fxRate: currency === "KRW" ? 1 : fxRaw === "" ? null : Number(fxRaw) },
      preEstimateFxRateTouched: currency !== "KRW" && fxRaw !== initialValuesRef.current?.preEstimateFxRate,
    });
  }

  // D-94 · C-07 ① · DR-27 — Ctrl+Enter 제출과 Esc 취소를 한 keydown에서
  // 배선한다. 둘 다 폼 표준 제출·표준 라우터 이동을 부르고 새 경로를
  // 만들지 않는다.
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (isCtrlCombo(event, "Enter")) {
      if (isExecuting || submittedRef.current) return;
      event.preventDefault();
      event.currentTarget.requestSubmit();
      return;
    }
    if (event.key === "Escape") {
      // 열린 네이티브 선택 목록·자동 완성이 이벤트를 이미 처리했으면(DR-27
      // 「내부 컨트롤 먼저」) 이 폼은 아무것도 하지 않는다.
      if (event.defaultPrevented || event.nativeEvent.isComposing || isExecuting) return;
      const initial = initialValuesRef.current;
      if (!initial) return;
      // 04-46 편차(Rule 1 — ENG-D11) — 이 브라우저 기본 동작(Escape가 열린
      // 최상위 모달을 닫는다)을 막아 둔다. 막지 않으면 이 Escape 한 번이
      // 폼 처리(아래 setDiscardOpen(true))로 ConfirmDialog를 연 직후, 같은
      // keydown의 브라우저 기본 처리가 방금 연 다이얼로그를 즉시 다시
      // 닫아버린다(showModal()이 React의 동기 discrete-event 플러시 안에서
      // 실행돼 같은 이벤트 턴에 dialog가 이미 open 상태가 되기 때문 —
      // 실측: ConfirmDialog effect가 open:true 뒤 바로 open:false로
      // 두 번 연달아 불렸다). Ctrl+Enter 갈래는 이미 이 줄이 있다.
      event.preventDefault();
      const current = snapshotFormValues(new FormData(event.currentTarget));
      if (isFormPristine(initial, current)) {
        router.push(cancelHref);
      } else {
        // 04-46 Task 2(⑤, DR-27) — 값이 하나라도 다르면 「입력 버리기」 확인을 연다.
        setDiscardFieldCount(countDifferences(initial, current));
        setDiscardOpen(true);
      }
    }
  }

  // 04-46 Task 2(⑤, DR-27) — 버튼 줄의 2차 「취소 Esc」도 같은 판정을 탄다.
  function handleCancelClick() {
    if (isExecuting) return;
    const form = document.getElementById("project-form");
    const initial = initialValuesRef.current;
    if (!(form instanceof HTMLFormElement) || !initial) return;
    const current = snapshotFormValues(new FormData(form));
    if (isFormPristine(initial, current)) {
      router.push(cancelHref);
    } else {
      setDiscardFieldCount(countDifferences(initial, current));
      setDiscardOpen(true);
    }
  }

  const clientError = result.validationErrors?.clientId?._errors?.[0];
  const nameError = result.validationErrors?.name?._errors?.[0];
  const pmError = result.validationErrors?.pmUserId?._errors?.[0];
  const teamError = result.validationErrors?.teamId?._errors?.[0];
  // 04-15 — 칸 거부(서버 domain)와 스키마의 총 매출 예상가 칸 오류. 둘 다 같은 칸 아래에 그린다.
  const rejectedErrors = result.data && "rejected" in result.data ? result.data.rejected.errors : [];
  const rejectedOf = (field: ProjectInputFieldError["field"]) => rejectedErrors.find((error) => error.field === field)?.reason;
  const preEstimateErrors = result.validationErrors?.preEstimate;
  const startDateError = rejectedOf("startDate");
  const endDateError = rejectedOf("endDate");
  const amountError =
    amountInputError ?? preEstimateErrors?.amount?._errors?.[0] ?? rejectedOf("preEstimateAmount");
  const fxRateError =
    fxRateInputError ?? preEstimateErrors?.fxRate?._errors?.[0] ?? rejectedOf("preEstimateFxRate");
  const submitFieldErrors: ProjectInputFieldError["field"][] = [
    ...(startDateError ? (["startDate"] as const) : []),
    ...(endDateError ? (["endDate"] as const) : []),
    ...(preEstimateErrors?.amount?._errors?.[0] || rejectedOf("preEstimateAmount") ? (["preEstimateAmount"] as const) : []),
    ...(preEstimateErrors?.fxRate?._errors?.[0] || rejectedOf("preEstimateFxRate") ? (["preEstimateFxRate"] as const) : []),
  ];

  // §7-15 검증 관문 — 필수인데 비면 제출 버튼이 이유를 말한다(막힘 자리는
  // 서버 응답 없이도 클라이언트 상태로 계산할 수 있지만, 이 플랜은
  // 서버 오류 문구를 그대로 옆에 붙이는 것으로 같은 계약을 만족한다).
  // 04-15 — 필수 칸이 아닌 칸 거부는 Copywriting `Error — 등록 폼 제출` 한 줄(`등록하지 못했습니다 · 총 매출 예상가 1칸`).
  const firstSubmitField = submitFieldErrors[0];
  const submitReason = firstSubmitField
    ? `등록하지 못했습니다 · ${FIELD_LABELS[firstSubmitField]} ${submitFieldErrors.length}칸`
    : undefined;
  const blockedReason = [clientError, nameError, pmError, teamError, submitReason].filter(Boolean)[0];

  return (
    <>
      {copySource ? (
        <p className={styles.copySource}>{`${copySource.number} ${copySource.name}에서 복사 · ${copySource.lineCount}줄`}</p>
      ) : null}
      <Form id="project-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        {copySource ? <input type="hidden" name="copyFromProjectId" value={copySource.projectId} /> : null}
        <Form.Field id="clientId" label="클라이언트" width="select">
          <Select
            id="clientId"
            name="clientId"
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            defaultValue={copySource?.clientId}
            error={clientError}
          />
        </Form.Field>

        <Form.Field id="name" label="프로젝트명" width="long">
          <input
            id="name"
            name="name"
            type="text"
            className={styles.textInput}
            autoComplete="off"
            defaultValue={copySource?.name}
            aria-describedby={nameError ? "name-error" : undefined}
          />
          {nameError ? <Form.Error id="name-error">{nameError}</Form.Error> : null}
        </Form.Field>

        <Form.Field id="pmUserId" label="담당 PM" width="select">
          <Select
            id="pmUserId"
            name="pmUserId"
            options={pmUsers.map((u) => ({ value: u.id, label: u.name }))}
            defaultValue={copySource?.pmUserId}
            error={pmError}
          />
        </Form.Field>

        <Form.Field id="teamId" label="팀" width="select">
          <Select
            id="teamId"
            name="teamId"
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
            defaultValue={copySource?.teamId ?? (teams.length === 1 ? teams[0]?.id : undefined)}
            error={teamError}
          />
        </Form.Field>

        <Form.Field id="startDate" label="시작일" width="short">
          <input
            id="startDate"
            name="startDate"
            type="date"
            className={styles.textInput}
            aria-invalid={startDateError ? true : undefined}
            aria-describedby={startDateError ? "startDate-error" : undefined}
          />
          {startDateError ? <Form.Error id="startDate-error">{startDateError}</Form.Error> : null}
        </Form.Field>

        <Form.Field id="endDate" label="종료일" width="short">
          <input
            id="endDate"
            name="endDate"
            type="date"
            className={styles.textInput}
            aria-invalid={endDateError ? true : undefined}
            aria-describedby={endDateError ? "endDate-error" : undefined}
          />
          {endDateError ? <Form.Error id="endDate-error">{endDateError}</Form.Error> : null}
        </Form.Field>

        <Form.Field id="preEstimateAmount" label="총 매출 예상가" width="short">
          <input
            id="preEstimateAmount"
            ref={amountRef}
            type="text"
            inputMode={preEstimateCurrency === "KRW" ? "numeric" : "decimal"}
            autoComplete="off"
            className={`${styles.textInput} ${styles.numericInput}`}
            value={amountText}
            onChange={onAmountChange}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? "preEstimateAmount-error" : undefined}
          />
          <input type="hidden" name="preEstimateAmount" value={amountRawValue} readOnly />
          {amountError ? <Form.Error id="preEstimateAmount-error">{amountError}</Form.Error> : null}
        </Form.Field>

        <Form.Field id="preEstimateCurrency" label="통화" width="select">
          <Select
            id="preEstimateCurrency"
            name="preEstimateCurrency"
            value={preEstimateCurrency}
            options={[
              { value: "KRW", label: "KRW" },
              { value: "USD", label: "USD" },
            ]}
            onChange={(event) => setPreEstimateCurrency(event.target.value === "USD" ? "USD" : "KRW")}
          />
        </Form.Field>

        {/* KRW는 환율 1이라 칸이 숨는다. 값은 숨은 칸으로 늘 실어 Esc 판정(처음 연 값)이 통화 전환만 센다. */}
        {preEstimateCurrency === "KRW" ? null : (
          <Form.Field id="preEstimateFxRate" label="환율" width="short">
            <input
              id="preEstimateFxRate"
              ref={fxRateRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={`${styles.textInput} ${styles.numericInput}`}
              value={fxRateText}
              onChange={onFxRateChange}
              aria-invalid={fxRateError ? true : undefined}
              aria-describedby={fxRateError ? "preEstimateFxRate-error" : undefined}
            />
            {fxRateError ? <Form.Error id="preEstimateFxRate-error">{fxRateError}</Form.Error> : null}
          </Form.Field>
        )}
        <input type="hidden" name="preEstimateFxRate" value={fxRateRawValue} readOnly />

        {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}

        <Form.Actions>
          <Button type="submit" variant="primary" pending={isExecuting} shortcut="Ctrl+Enter">
            프로젝트 등록
          </Button>
          {blockedReason ? <span className={styles.blockedReason}>{blockedReason}</span> : null}
          <Button variant="secondary" shortcut="Esc" disabled={isExecuting} onClick={handleCancelClick}>
            취소
          </Button>
        </Form.Actions>
      </Form>

      {/* 04-46 Task 2(⑤, DR-27) — <form> 밖(형제)에 렌더해 다이얼로그 안의
          Esc·Enter가 폼 keydown·폼 제출로 가지 않게 한다. */}
      <ConfirmDialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="입력 버리기"
        subtitle={`프로젝트 등록 · ${discardFieldCount}칸`}
        primary={{ label: "입력 버리기", onConfirm: () => router.push(cancelHref) }}
      />
    </>
  );
}
