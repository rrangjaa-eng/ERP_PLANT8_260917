"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { createProjectAction } from "./actions";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import type { ProjectCopySource, ProjectInputFieldError } from "@/domain/projects";
import type { Currency } from "@/domain/money";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { resolveDefaultOptionId } from "./copy-defaults";
import styles from "./projects.module.css";

export type ProjectFormOption = { id: string; name: string };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// 입력 버리기(DR-27 · DR1 A) 판정에 쓰는 칸 목록 — 이 칸들의 값이 처음 연 값과 하나라도 다르면 입력이 있다고 본다.
// `PanelForm`의 `dirtyFields`로 넘겨 `SidePanel`의 「입력 버리기」 확인이 뜨는 때와 부제의 칸 수를 정한다(복사 등록의 미리 채운 값이 처음 값).
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

// 04-15 — 1차 옆 `등록 실패 · {칸} {n}칸`의 칸 이름(라벨 그대로).
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

// SYSTEM.md §7-15 · §6-3 — 프로젝트 등록 옆 패널 폼(04.6-10: `SidePanel` 안 `PanelForm`). 필수 넷(클라이언트·프로젝트명·담당
// PM·팀), 기간은 선택(D-49). 상태·번호는 폼에 없다 — 등록은 항상
// 수주중이고 번호는 서버가 매긴다(D-42). `noValidate`는 `Form`이 이미
// 걸고 있어 이 파일 어디에도 `required`/`pattern` 네이티브 검증이 없다.
// 성공 뒤(R9 D · 사용자 답 04.6-ANSWERS.md): 새 프로젝트 상세로 이동한다 — 이동은 `PanelForm`의 `succeed({ href })`가 맡는다.
export function ProjectForm({
  clients,
  teams,
  pmUsers,
  usdDefaultFxRate,
  copySource = null,
  creatorDefaults = null,
}: {
  clients: ProjectFormOption[];
  teams: ProjectFormOption[];
  pmUsers: ProjectFormOption[];
  /** 04-15(D-71) — 통화를 USD로 고르면 환율 칸의 기본값(설정의 최근 USD 환율 실제 값). */
  usdDefaultFxRate: number;
  /** 04-15(D-70) — 복사 등록이면 출처 기본 정보(미리 채움 = Esc 판정의 처음 값, DR-27)와 줄 수. */
  copySource?: (ProjectCopySource & { projectId: string }) | null;
  /** 결정 2 — 담당 PM은 등록하는 사람, 팀은 그 사람의 오늘 소속 팀. 좁힌 옵션에 없으면 빈 칸. */
  creatorDefaults?: { pmUserId: string; teamId: string | null } | null;
}) {
  const panelRef = useRef<PanelFormHandle>(null);

  // C-06 · 엔지 리뷰 C §1 P2 — 제출 래치. 성공 뒤 상세로 이동하기 전까지
  // isExecuting은 이미 거짓으로 돌아오므로 그 가드만으로는 이동 지연 사이의
  // 두 번째 제출을 막지 못한다. 래치는 오류(검증·서버) 응답에서만 내리고,
  // 성공이면 이동할 때까지 서 있는다(컴포넌트가 언마운트된다).
  const submittedRef = useRef(false);
  // 처음 연 값 스냅숏 — 환율 칸을 손댔는지(preEstimateFxRateTouched) 가리는 기준. 복사 등록으로 칸이 채워져 있으면 그 값이 처음 값이다.
  const initialValuesRef = useRef<Record<string, string> | null>(null);

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
      if (data && "project" in data) {
        // R9 D — 새 프로젝트에 상세가 있으므로 상세로 이동한다(패널에 남지 않는다). 래치는 이동할 때까지 선 채로 둔다.
        const successHref = `/projects/${data.project.id}`;
        panelRef.current?.succeed({ href: successHref });
      }
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

  // PR #104 [지시] (다) — S19 「오류로 이동」을 §7-15 폼에: 거부 응답이 올 때만 첫 오류 칸으로.
  useEffect(() => {
    const rejected = result.validationErrors !== undefined || (result.data !== undefined && "rejected" in result.data);
    if (!rejected) return;
    document.getElementById("project-form")?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [result]);

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
  // 04-15 — 필수 칸이 아닌 칸 거부는 Copywriting `Error — 등록 폼 제출` 한 줄(`등록 실패 · 총 매출 예상가 1칸`).
  const firstSubmitField = submitFieldErrors[0];
  const submitReason = firstSubmitField
    ? `등록 실패 · ${FIELD_LABELS[firstSubmitField]} ${submitFieldErrors.length}칸`
    : undefined;
  const blockedReason = [clientError, nameError, pmError, teamError, submitReason].filter(Boolean)[0];

  return (
    <PanelForm
      ref={panelRef}
      id="project-form"
      label="프로젝트 등록"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={blockedReason}
      dirtyFields={PRISTINE_FIELDS}
    >
      {copySource ? (
        <p className={styles.copySource}>{`${copySource.number} ${copySource.name}에서 복사 · ${copySource.lineCount}줄`}</p>
      ) : null}
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
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "name-error" : undefined}
        />
        {nameError ? <Form.Error id="name-error">{nameError}</Form.Error> : null}
      </Form.Field>

      <Form.Field id="pmUserId" label="담당 PM" width="select">
        <Select
          id="pmUserId"
          name="pmUserId"
          options={pmUsers.map((u) => ({ value: u.id, label: u.name }))}
          defaultValue={resolveDefaultOptionId(
            copySource?.pmUserId,
            pmUsers,
            resolveDefaultOptionId(creatorDefaults?.pmUserId, pmUsers),
          )}
          error={pmError}
        />
      </Form.Field>

      <Form.Field id="project-team" label="팀" width="select">
        <Select
          id="project-team"
          name="teamId"
          options={teams.map((t) => ({ value: t.id, label: t.name }))}
          defaultValue={resolveDefaultOptionId(
            copySource?.teamId,
            teams,
            resolveDefaultOptionId(creatorDefaults?.teamId ?? undefined, teams, teams.length === 1 ? teams[0]?.id : undefined),
          )}
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

      {/* KRW는 환율 1이라 칸이 숨는다. 값은 숨은 칸으로 늘 실어 입력 버리기 판정(처음 연 값)이 통화 전환만 센다. */}
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

    </PanelForm>
  );
}
