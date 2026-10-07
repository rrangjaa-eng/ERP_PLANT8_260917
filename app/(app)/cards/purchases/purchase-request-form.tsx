"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { Form } from "@/ui/form/Form";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { formatKrw } from "@/lib/format-number";
import textFieldStyles from "@/ui/input/TextField.module.css";
import cardStyles from "../cards.module.css";
import { LinkPicker, type PickedLine, type PickedProject } from "../link-picker";
import { createPurchaseRequestAction, previewPurchaseSupplyAction } from "./actions";

// 06-08(UI-SPEC S12 · C12): 구매 요청 신청 옆 패널 본문 — `PanelForm intent="create"` + `Form layout="panel"`. 사람은 품목 · 링크 · 예상 금액만 적고
// 공급가 추정 · 남은 실행가는 서버가 정한다(Q3). 신청 뒤 패널은 열린 채 칸이 기본값(진입 줄은 남는다)으로 돌아가고 결과 한 줄
// `구매 요청됨 · {번호}`가 선다(토스트 · 되돌리기 없음 — 지우는 길은 06-14의 S11 행 `요청 취소`). 팀 비용 라디오는 06-14가 더한다.
//
// 칸은 비제어(defaultValue)이고 신청 뒤 `gen` 키로 새로 그린 다음 `succeed`를 부른다 — `form.reset()`이 새 기본값으로 돌아가게(카드 패널과 같은 꼴).

export type PurchaseEntry = {
  project: PickedProject;
  line: PickedLine;
};

export const LINK_URL_ERROR = "링크 형식 오류 · https://로 시작하는 주소";
const rowStyles = { row: textFieldStyles.row, label: textFieldStyles.label };

function blankBlock(blanks: { label: string; verb: string }[]): string | undefined {
  const first = blanks[0];
  if (!first) return undefined;
  return `${blanks.map((blank) => blank.label).join(" · ")} ${blanks.length}칸 비어 있음 · ${first.label} ${first.verb}`;
}

function AmountField({ error, onRaw }: { error: string | undefined; onRaw: (raw: string) => void }) {
  const { inputRef, value, onChange, error: inputError, rawValue } = useCommaInput("krw", "");
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
        inputMode="numeric"
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

export function PurchaseRequestForm({ entry }: { entry: PurchaseEntry | null }) {
  const panelRef = useRef<PanelFormHandle>(null);
  const [gen, setGen] = useState(0);
  // 진입 줄(`&line=`)이면 연결은 텍스트 — 프로젝트 · 줄은 서버가 준 값을 그대로 쓴다(신청 뒤 페이지 재렌더가 남은 실행가 힌트를 새로 보낸다).
  const [linkProject, setLinkProject] = useState<PickedProject | null>(null);
  const [linkLine, setLinkLine] = useState<PickedLine | null>(null);
  const [linkStep, setLinkStep] = useState<"project" | "line" | null>(null);
  const project = entry ? entry.project : linkProject;
  const line = entry ? entry.line : linkLine;
  const [itemName, setItemName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  const [supplyPreview, setSupplyPreview] = useState<{ key: string; krw: number | null } | null>(null);
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
      // 줄 · 입력은 건마다 다르다 — 진입 줄이면 남고, 고른 줄이면 프로젝트는 남고 줄은 빈다(카드 패널 M-4와 같은 꼴).
      setLinkLine(null);
      setItemName("");
      setLinkUrl("");
      setLinkError(undefined);
      setSupplyPreview(null);
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

  // 서버 계산 한 줄 — 예상 금액이 바뀌면 짧은 지연 뒤 공급가 추정을 묻는다(늦은 응답은 버린다). 실행가 초과 막힘의 한쪽 값.
  const previewSeq = useRef(0);
  const lineId = line?.id ?? null;
  const previewKey = `${lineId ?? ""}|${amountRaw}`;
  useEffect(() => {
    const seq = ++previewSeq.current;
    const amount = amountRaw === "" ? null : Number(amountRaw);
    if (lineId === null || amount === null || !Number.isFinite(amount) || amount <= 0) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        let outcome: Awaited<ReturnType<typeof previewPurchaseSupplyAction>> | undefined;
        try {
          outcome = await previewPurchaseSupplyAction({ lineId, amount });
        } catch {
          outcome = undefined;
        }
        if (seq !== previewSeq.current) return;
        setSupplyPreview({ key: previewKey, krw: outcome?.data ? outcome.data.supplyKrw : null });
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [lineId, amountRaw, previewKey]);
  // 지금 칸 값에 맞는 응답만 쓴다(칸이 바뀐 뒤 늦게 온 값은 키가 달라 버려진다).
  const supplyKrw = supplyPreview?.key === previewKey ? supplyPreview.krw : null;

  // 칸을 고치면 지난 서버 거부 줄은 걷는다.
  const editKey = JSON.stringify([project?.id ?? "", line?.id ?? "", itemName, linkUrl, amountRaw]);
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
  const linkBlock = !line ? "연결 없음 · 연결 고르기" : undefined;
  // 실행가 초과(Q3) — 고른 줄 DTO의 남은 실행가와 서버 계산 공급가 추정을 견준다. 서버도 잠근 뒤 같은 판정으로 거부한다.
  const overCap = line && line.remainingKrw !== null && supplyKrw !== null && supplyKrw > line.remainingKrw ? `실행가 초과 · 남은 실행가 ${formatKrw(line.remainingKrw)} · ` : undefined;
  const blockedReason = blankBlock(blanks) ?? linkBlock ?? (overCap ? `${overCap}다른 줄 고르기` : undefined);

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
    execute({
      lineId: line?.id ?? "",
      itemName: itemName.trim(),
      linkUrl: url === "" ? null : url,
      amount: Number(amountRaw),
      memo: typeof memo === "string" && memo.trim() !== "" ? memo.trim() : null,
    });
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
        reason={result.serverError ?? lineReason}
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
                <label className={cardStyles.linkOption}>
                  <input type="radio" name="linkKind" value="quote_line" checked readOnly /> 견적 줄
                </label>
              </div>
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
              <AmountField error={fieldErrors?.amount?._errors?.[0]} onRaw={onAmountRaw} />
            </Form.Field>
          </div>
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
          onOutOfQuote={() => setLinkStep(null)}
        />
      )}
    </>
  );
}
