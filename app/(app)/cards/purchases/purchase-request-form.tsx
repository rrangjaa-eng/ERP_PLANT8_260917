"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { Form } from "@/ui/form/Form";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { formatKrw } from "@/lib/format-number";
import type { NumberInputKind } from "@/lib/format-number";
import selectStyles from "@/ui/select/Select.module.css";
import textFieldStyles from "@/ui/input/TextField.module.css";
import cardStyles from "../cards.module.css";
import { LinkPicker, type PickedLine, type PickedProject } from "../link-picker";
import { createPurchaseRequestAction, previewPurchaseSupplyAction } from "./actions";

// 06-08(UI-SPEC S12 · C12): 구매 요청 신청 옆 패널 본문 — `PanelForm intent="create"` + `Form layout="panel"`. 사람은 품목 · 링크 · 예상 금액만 적고
// 공급가 추정 · 남은 실행가는 서버가 정한다(Q3). 신청 뒤 패널은 열린 채 칸이 기본값(진입 줄은 남는다)으로 돌아가고 결과 한 줄
// `구매 요청됨 · {번호}`가 선다(토스트 · 되돌리기 없음 — 지우는 길은 S11 행 `요청 취소` + 결과 줄 `되돌리기`).
// 06-14: 목록 1차(`?new=1`만)로 열면 연결 `팀 비용`이 골라진 채 서고(라디오는 남아 `견적 줄`로 바꿀 수 있다) 팀 값은 요청자의 오늘 소속 텍스트(힌트 없음 — M-5).
// 예상 금액은 통화 + 금액, 외화면 환율 칸(기본 = 최근 환율)과 서버가 계산한 원화 환산액 `Form.Hint`.
//
// 칸은 비제어(defaultValue)이고 신청 뒤 `gen` 키로 새로 그린 다음 `succeed`를 부른다 — `form.reset()`이 새 기본값으로 돌아가게(카드 패널과 같은 꼴).

export type PurchaseEntry = {
  project: PickedProject;
  line: PickedLine;
};

export type PurchaseTeam = { teamName: string | null; blockedReason: string | null };

type LinkKind = "quote_line" | "team_cost";
type Currency = "KRW" | "USD";

export const LINK_URL_ERROR = "링크 형식 오류 · https://로 시작하는 주소";
const rowStyles = { row: textFieldStyles.row, label: textFieldStyles.label };

function blankBlock(blanks: { label: string; verb: string }[]): string | undefined {
  const first = blanks[0];
  if (!first) return undefined;
  return `${blanks.map((blank) => blank.label).join(" · ")} ${blanks.length}칸 비어 있음 · ${first.label} ${first.verb}`;
}

function AmountField({ kind, error, onRaw }: { kind: NumberInputKind; error: string | undefined; onRaw: (raw: string) => void }) {
  const { inputRef, value, onChange, error: inputError, rawValue } = useCommaInput(kind, "");
  useEffect(() => onRaw(rawValue), [rawValue, onRaw]);
  const shown = inputError ?? error;
  return (
    <>
      {/* 이름은 보이는 칸에 — PanelForm이 입력 이벤트 순간의 FormData로 바뀐 칸을 센다. 제출 값은 상태(rawValue). */}
      <input
        id="purchase-estimate"
        name="estimate"
        ref={inputRef}
        type="text"
        inputMode={kind === "krw" ? "numeric" : "decimal"}
        autoComplete="off"
        value={value}
        onChange={onChange}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? "purchase-estimate-error" : undefined}
        className={[textFieldStyles.input, textFieldStyles.numeric, shown ? textFieldStyles.inputError : ""].filter(Boolean).join(" ")}
      />
      {shown ? <Form.Error id="purchase-estimate-error">{shown}</Form.Error> : null}
    </>
  );
}

// 환율 칸 — 기본값 = 설정 최근 환율, 없으면 빈 칸(1차가 막힌다 — 저장된 요청은 늘 환율 · 원화가 있다).
function FxField({ initial, error, onRaw }: { initial: number | null; error: string | undefined; onRaw: (raw: string) => void }) {
  const { inputRef, value, onChange, error: inputError, rawValue } = useCommaInput("fxRate", initial === null ? "" : String(initial));
  useEffect(() => onRaw(rawValue), [rawValue, onRaw]);
  const shown = inputError ?? error;
  return (
    <Form.Field id="purchase-fx-rate" label="환율">
      <input
        id="purchase-fx-rate"
        name="fxRate"
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={onChange}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? "purchase-fx-rate-error" : undefined}
        className={[textFieldStyles.input, textFieldStyles.numeric, shown ? textFieldStyles.inputError : ""].filter(Boolean).join(" ")}
      />
      {shown ? <Form.Error id="purchase-fx-rate-error">{shown}</Form.Error> : null}
    </Form.Field>
  );
}

export function PurchaseRequestForm({ entry, team, usdFxRate }: { entry: PurchaseEntry | null; team: PurchaseTeam; usdFxRate: number | null }) {
  const panelRef = useRef<PanelFormHandle>(null);
  const [gen, setGen] = useState(0);
  // 진입 줄(`&line=`)이면 연결은 텍스트 — 프로젝트 · 줄은 서버가 준 값을 그대로 쓴다(신청 뒤 페이지 재렌더가 남은 실행가 힌트를 새로 보낸다).
  // 목록 1차(`?new=1`만)는 `팀 비용`이 골라진 채 열린다(라디오는 남는다).
  const [linkKind, setLinkKind] = useState<LinkKind>(entry ? "quote_line" : "team_cost");
  const [linkProject, setLinkProject] = useState<PickedProject | null>(null);
  const [linkLine, setLinkLine] = useState<PickedLine | null>(null);
  const [linkStep, setLinkStep] = useState<"project" | "line" | null>(null);
  const project = entry ? entry.project : linkProject;
  const line = entry ? entry.line : linkLine;
  const [itemName, setItemName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [currency, setCurrency] = useState<Currency>("KRW");
  const [amountRaw, setAmountRaw] = useState("");
  const [fxRaw, setFxRaw] = useState(usdFxRate === null ? "" : String(usdFxRate));
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<{ key: string; estimateKrw: number; supplyKrw: number | null } | null>(null);
  const [showingResult, setShowingResult] = useState(false);
  const doneStatusRef = useRef<string | null>(null);

  const linkInputRef = useRef<HTMLInputElement>(null);
  const linkPickedRef = useRef<string | null>(null);
  useEffect(() => {
    const focusId = linkPickedRef.current;
    if (focusId === null) return;
    linkPickedRef.current = null;
    linkInputRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
    // 고르기 목록이 닫히며 누른 버튼으로 돌린 포커스 뒤에 — 다음 빈 「바꾸기」(프로젝트 뒤 = 견적 줄), 없으면 방금 바뀐 칸.
    window.setTimeout(() => document.getElementById(focusId)?.focus(), 0);
  }, [linkProject, linkLine]);

  const { execute, result, isExecuting, reset } = useAction(createPurchaseRequestAction, {
    onSuccess: ({ data }) => {
      // 줄 · 입력은 건마다 다르다 — 진입 줄이면 남고, 고른 줄이면 프로젝트는 남고 줄은 빈다(카드 패널 M-4와 같은 꼴). 연결 종류 · 통화는 이어 입력하기 좋게 둔다.
      setLinkLine(null);
      setItemName("");
      setLinkUrl("");
      setLinkError(undefined);
      setPreview(null);
      setShowingResult(true);
      doneStatusRef.current = `구매 요청됨 · ${data?.number ?? ""}`;
      setGen((value) => value + 1);
    },
  });

  // 새 기본값으로 다시 그린 뒤에 성공 신호 — PanelForm이 reset · 스냅숏 · 결과 한 줄 · 첫 칸 포커스를 한다.
  useEffect(() => {
    const status = doneStatusRef.current;
    if (status === null) return;
    doneStatusRef.current = null;
    panelRef.current?.succeed({ status });
  }, [gen]);

  const onAmountRaw = useCallback((raw: string) => setAmountRaw(raw), []);
  const onFxRaw = useCallback((raw: string) => setFxRaw(raw), []);
  const fxValue = currency === "KRW" ? undefined : fxRaw === "" ? null : Number(fxRaw);
  const teamMode = linkKind === "team_cost";

  // 서버 계산 한 줄 — 예상 금액 · 환율이 바뀌면 짧은 지연 뒤 원화 환산액(외화) · 공급가 추정(견적 줄)을 묻는다(늦은 응답은 버린다). 실행가 초과 막힘의 한쪽 값.
  const previewSeq = useRef(0);
  const lineId = teamMode ? null : (line?.id ?? null);
  const previewKey = `${lineId ?? ""}|${currency}|${amountRaw}|${currency === "KRW" ? "" : fxRaw}`;
  useEffect(() => {
    const seq = ++previewSeq.current;
    const amount = amountRaw === "" ? null : Number(amountRaw);
    if (amount === null || !Number.isFinite(amount) || amount <= 0) return;
    if (lineId === null && currency === "KRW") return;
    if (currency !== "KRW" && (fxValue === null || fxValue === undefined || !Number.isFinite(fxValue) || fxValue <= 0)) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        let outcome: Awaited<ReturnType<typeof previewPurchaseSupplyAction>> | undefined;
        try {
          outcome = await previewPurchaseSupplyAction({ lineId, currency, amount, ...(currency === "KRW" || !fxValue ? {} : { fxRate: fxValue }) });
        } catch {
          outcome = undefined;
        }
        if (seq !== previewSeq.current) return;
        if (outcome?.data) setPreview({ key: previewKey, estimateKrw: outcome.data.estimateKrw, supplyKrw: outcome.data.supplyKrw });
        else setPreview(null);
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [lineId, currency, amountRaw, fxValue, previewKey]);
  // 지금 칸 값에 맞는 응답만 판정에 쓴다(칸이 바뀐 뒤 늦게 온 값은 키가 달라 이전 값으로 흐리게만 보인다).
  const freshPreview = preview?.key === previewKey ? preview : null;
  const supplyKrw = freshPreview?.supplyKrw ?? null;

  // 칸을 고치면 지난 서버 거부 줄은 걷는다.
  const editKey = JSON.stringify([linkKind, project?.id ?? "", line?.id ?? "", itemName, linkUrl, currency, amountRaw, fxRaw]);
  const lastEditKey = useRef(editKey);
  useEffect(() => {
    if (editKey === lastEditKey.current) return;
    lastEditKey.current = editKey;
    if (result.serverError || result.validationErrors) reset();
  }, [editKey, result.serverError, result.validationErrors, reset]);

  const blanks = [
    ...(itemName.trim() ? [] : [{ label: "품목", verb: "적기" }]),
    ...(amountRaw ? [] : [{ label: "예상 금액", verb: "적기" }]),
  ];
  const teamBlock = teamMode ? (team.blockedReason ?? undefined) : undefined;
  const fxBlock = currency !== "KRW" && fxRaw === "" ? `환율 없음 · ${currency} 환율 적기` : undefined;
  const linkBlock = !teamMode && !line ? "연결 없음 · 연결 고르기" : undefined;
  // 실행가 초과(Q3) — 고른 줄 DTO의 남은 실행가와 서버 계산 공급가 추정을 견준다. 서버도 잠근 뒤 같은 판정으로 거부한다.
  const overCap = !teamMode && line && line.remainingKrw !== null && supplyKrw !== null && supplyKrw > line.remainingKrw ? `실행가 초과 · 남은 실행가 ${formatKrw(line.remainingKrw)} · ` : undefined;
  const blockedReason = blankBlock(blanks) ?? teamBlock ?? fxBlock ?? linkBlock ?? (overCap ? (entry ? overCap.replace(/ · $/, "") : `${overCap}다른 줄 고르기`) : undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockedReason) {
      setShowingResult(false);
      return;
    }
    const url = linkUrl.trim();
    if (url !== "" && !/^https?:\/\//i.test(url)) {
      setLinkError(LINK_URL_ERROR);
      setShowingResult(false);
      return;
    }
    const formData = new FormData(event.currentTarget);
    const memo = formData.get("memo");
    const fields = {
      itemName: itemName.trim(),
      linkUrl: url === "" ? null : url,
      currency,
      amount: Number(amountRaw),
      ...(currency !== "KRW" && fxValue ? { fxRate: fxValue } : {}),
      memo: typeof memo === "string" && memo.trim() !== "" ? memo.trim() : null,
    };
    execute(teamMode ? { linkKind: "team_cost", ...fields } : { linkKind: "quote_line", lineId: line?.id ?? "", ...fields });
  }

  const fieldErrors = result.validationErrors;
  const lineReason =
    overCap && !entry && !showingResult && blankBlock(blanks) === undefined ? (
      <>
        {overCap}
        <Button variant="tertiary" onClick={() => document.getElementById("purchase-line-change")?.focus()}>
          다른 줄 고르기
        </Button>
      </>
    ) : null;

  return (
    <>
      <PanelForm
        ref={panelRef}
        id="purchase-request-form"
        label="구매 요청"
        intent="create"
        onSubmit={handleSubmit}
        pending={isExecuting}
        blockedReason={showingResult ? undefined : blockedReason}
        reason={entry ? result.serverError?.replace(/ · 다른 줄 고르기$/, "") : (result.serverError ?? lineReason)}
        reasonId="purchase-request-form-reason"
      >
        {/* 입력이 시작되면 결과 한 줄 대신 막힘 줄. */}
        <div key={gen} onInput={() => setShowingResult(false)} onChange={() => setShowingResult(false)}>
          {entry ? (
            <>
              <div data-ui="field-row" className={rowStyles.row}>
                <span className={rowStyles.label}>프로젝트</span>
                <span>{entry.project.label}</span>
              </div>
              <div data-ui="field-row" className={rowStyles.row}>
                <span className={rowStyles.label}>견적 줄</span>
                <span>{entry.line.itemName}</span>
                {entry.line.hint ? <Form.Hint>{entry.line.hint}</Form.Hint> : null}
              </div>
            </>
          ) : (
            <>
              <div data-ui="field-row" className={rowStyles.row} role="radiogroup" aria-labelledby="purchase-link-label">
                <span id="purchase-link-label" className={rowStyles.label}>
                  연결
                </span>
                {(
                  [
                    ["quote_line", "견적 줄"],
                    ["team_cost", "팀 비용"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className={cardStyles.linkOption}>
                    <input
                      type="radio"
                      name="linkKind"
                      value={value}
                      checked={linkKind === value}
                      onChange={() => {
                        setLinkKind(value);
                        setLinkStep(null);
                      }}
                    />{" "}
                    {label}
                  </label>
                ))}
                {/* 팀 비용 = 요청자의 오늘 소속(읽기 텍스트 · 힌트 없음 — M-5). 소속이 없으면 값 자리는 비고 1차가 막힌다. */}
                {teamMode && team.teamName ? <div data-ui="purchase-team">{team.teamName}</div> : null}
              </div>
              {teamMode ? null : (
                <>
                  <input ref={linkInputRef} type="hidden" name="linkTarget" value={`${project?.id ?? ""}:${line?.id ?? ""}`} readOnly />
                  <div data-ui="field-row" className={rowStyles.row}>
                    <span className={rowStyles.label}>프로젝트</span>
                    <span>{project ? project.label : "—"}</span>{" "}
                    <Button id="purchase-project-change" variant="tertiary" aria-label="프로젝트 바꾸기" onClick={() => setLinkStep("project")}>
                      {project ? "바꾸기" : "고르기"}
                    </Button>
                  </div>
                  {project ? (
                    <div data-ui="field-row" className={rowStyles.row}>
                      <span className={rowStyles.label}>견적 줄</span>
                      <span>{line ? line.itemName : "—"}</span>{" "}
                      <Button id="purchase-line-change" variant="tertiary" aria-label="견적 줄 바꾸기" onClick={() => setLinkStep("line")}>
                        {line ? "바꾸기" : "고르기"}
                      </Button>
                      {line?.hint ? <Form.Hint>{line.hint}</Form.Hint> : null}
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
          <TextField id="purchase-item" name="itemName" label="품목" maxLength={200} defaultValue="" onChange={(event) => setItemName(event.target.value)} />
          <TextField
            id="purchase-link-url"
            name="linkUrl"
            label="링크"
            placeholder="https://"
            inputMode="url"
            maxLength={2000}
            defaultValue=""
            onChange={(event) => {
              setLinkUrl(event.target.value);
              setLinkError(undefined);
            }}
            error={linkError ?? fieldErrors?.linkUrl?._errors?.[0]}
          />
          <div data-ui="field-row" className={rowStyles.row}>
            <Form.Field id="purchase-estimate" label="예상 금액">
              <select
                aria-label="통화"
                name="currency"
                className={selectStyles.select}
                value={currency}
                onChange={(event) => setCurrency(event.target.value === "USD" ? "USD" : "KRW")}
              >
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
              <AmountField key={currency} kind={currency === "KRW" ? "krw" : "foreign"} error={fieldErrors?.amount?._errors?.[0]} onRaw={onAmountRaw} />
              {/* 서버가 `toKrw`로 계산한 원화 환산액 — 다시 셈하는 동안 이전 값은 흐린 글자(UI-SPEC S12 loading). */}
              {currency !== "KRW" && preview ? (
                <Form.Hint>
                  <span style={freshPreview ? undefined : { color: "var(--text-faint)" }} data-ui="purchase-krw-line">
                    {formatKrw(preview.estimateKrw)}
                  </span>
                </Form.Hint>
              ) : null}
            </Form.Field>
          </div>
          {currency !== "KRW" ? (
            <div data-ui="field-row" className={rowStyles.row}>
              <FxField initial={usdFxRate} error={fieldErrors?.fxRate?._errors?.[0]} onRaw={onFxRaw} />
            </div>
          ) : null}
          <TextField id="purchase-memo" name="memo" label="메모" maxLength={500} defaultValue="" />
        </div>
      </PanelForm>
      {entry ? null : (
        <LinkPicker
          mode="purchase"
          step={linkStep}
          projectId={project?.id ?? null}
          currentLineId={line?.id ?? null}
          onClose={() => setLinkStep(null)}
          onPickProject={(picked) => {
            setShowingResult(false);
            setLinkStep(null);
            if (picked.id !== linkProject?.id) setLinkLine(null);
            linkPickedRef.current = "purchase-line-change";
            setLinkProject(picked);
          }}
          onPickLine={(picked) => {
            setShowingResult(false);
            setLinkStep(null);
            linkPickedRef.current = "purchase-line-change";
            setLinkLine(picked);
          }}
          // 고를 줄이 없을 때의 3차 `팀 비용으로` — 연결 라디오를 `팀 비용`으로 바꾸고 목록을 닫는다.
          onOutOfQuote={() => {
            setShowingResult(false);
            setLinkKind("team_cost");
            setLinkStep(null);
          }}
        />
      )}
    </>
  );
}
