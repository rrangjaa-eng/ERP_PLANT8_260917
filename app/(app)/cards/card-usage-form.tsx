"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { PickDialog, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { formatKrw } from "@/lib/format-number";
import textFieldStyles from "@/ui/input/TextField.module.css";
import { createCardUsageAction, previewCardAmountsAction, searchMerchantsAction } from "./actions";

// 06-05(UI-SPEC S9 · C12): 카드 사용 등록 옆 패널 본문 — `PanelForm intent="create"` + `Form layout="panel"`. 사람은 결제 합계만 적고
// 공급가 · 부가세는 서버 계산 한 줄이다(D-607). 등록 뒤 패널은 열린 채 칸이 「새 건의 기본값」(직전 등록 = 방금 등록)으로 돌아가고
// 결과 한 줄 `카드 사용 등록됨 · {합계}`가 선다(토스트 · 되돌리기 없음). 06-07 · 06-09 · 06-12 · 06-25가 이 파일에 모드 · 칸을 더한다(CF-4).
//
// 칸은 비제어(defaultValue)이고 등록 뒤 `gen` 키로 새로 그린 다음 `succeed`를 부른다 — `form.reset()`이 새 기본값으로 돌아가게.

export type CardOption = { id: string; label: string };
export type EvidenceTypeOption = { value: string; label: string };
export type CardUsageDefaults = {
  usedOn: string;
  corpCardId: string | null;
  linkKind: "team_cost" | null;
  evidenceTypeCode: string | null;
};

type Merchant = { id: string; name: string; defaultEvidenceType: string | null; defaultEvidenceName: string | null };

type Preview = {
  split: { supplyKrw: number; vatKrw: number; residualKrw: number; ruleKind: string; evidenceLabel: string } | null;
  teamName: string | null;
};


function blankBlock(blanks: { label: string; verb: string }[]): string | undefined {
  const first = blanks[0];
  if (!first) return undefined;
  return `${blanks.map((blank) => blank.label).join(" · ")} ${blanks.length}칸 비어 있음 · ${first.label} ${first.verb}`;
}

function calcLine(split: NonNullable<Preview["split"]>): string {
  if (split.ruleKind === "none") return `공급가 ${formatKrw(split.supplyKrw)} · 규칙 없음`;
  return `공급가 ${formatKrw(split.supplyKrw)} · 부가세 ${formatKrw(split.vatKrw)} · ${split.evidenceLabel} 규칙`;
}

// 칸 줄 · 라벨 모양은 TextField 줄과 같은 클래스(ui/input) — 패널 칸 간격이 한 규칙이다.
const rowStyles = { row: textFieldStyles.row, label: textFieldStyles.label };

function AmountField({ error, onRaw }: { error: string | undefined; onRaw: (raw: string) => void }) {
  const { inputRef, value, onChange, error: inputError, rawValue } = useCommaInput("krw", "");
  useEffect(() => onRaw(rawValue), [rawValue, onRaw]);
  const shown = inputError ?? error;
  return (
    <>
      <input
        id="card-amount"
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={onChange}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? "card-amount-error" : undefined}
        className={[textFieldStyles.input, textFieldStyles.numeric, shown ? textFieldStyles.inputError : ""].filter(Boolean).join(" ")}
      />
      <input type="hidden" name="amount" value={rawValue} readOnly />
      {shown ? <Form.Error id="card-amount-error">{shown}</Form.Error> : null}
    </>
  );
}

function MerchantPickDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (merchant: Merchant) => void }) {
  const known = useRef(new Map<string, Merchant>());
  const search = useCallback(async (query: string): Promise<PickResult | null> => {
    const data = (await searchMerchantsAction({ query }))?.data;
    if (!data) return null;
    const items: PickRow[] = [];
    for (const row of data.rows) {
      if (!row.id || row.name === undefined) continue;
      known.current.set(row.id, {
        id: row.id,
        name: row.name,
        defaultEvidenceType: row.defaultEvidenceType ?? null,
        defaultEvidenceName: row.defaultEvidenceName ?? null,
      });
      items.push({ type: "row", id: row.id, title: row.name, subtitle: row.defaultEvidenceName ? `기본 증빙 ${row.defaultEvidenceName}` : null, selectable: true });
    }
    return { items, truncated: data.truncated, subtitle: `거래처 ${items.length}` };
  }, []);
  return (
    <PickDialog
      open={open}
      onClose={onClose}
      title="가맹점 바꾸기"
      searchLabel="거래처 이름 검색"
      noun="거래처"
      primaryLabel="이 거래처로"
      search={search}
      onPick={(row) => {
        const merchant = known.current.get(row.id);
        if (!merchant) return false;
        onPick(merchant);
      }}
    />
  );
}

export function CardUsageForm({
  cards,
  evidenceTypes,
  teamName: initialTeamName,
  userName,
  today,
  defaults: initialDefaults,
}: {
  cards: CardOption[];
  evidenceTypes: EvidenceTypeOption[];
  teamName: string | null;
  userName: string;
  today: string;
  defaults: CardUsageDefaults;
}) {
  const panelRef = useRef<PanelFormHandle>(null);
  const [gen, setGen] = useState(0);
  const [defaults, setDefaults] = useState(initialDefaults);
  const [cardId, setCardId] = useState(initialDefaults.corpCardId ?? (cards.length === 1 ? (cards[0]?.id ?? "") : ""));
  const [usedOn, setUsedOn] = useState(initialDefaults.usedOn);
  const [amountRaw, setAmountRaw] = useState("");
  const [evidenceTypeCode, setEvidenceTypeCode] = useState(initialDefaults.evidenceTypeCode ?? "");
  const [linkKind, setLinkKind] = useState<"team_cost" | null>(initialDefaults.linkKind);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  // 가맹점으로 증빙 종류를 채우면 그 칸을 새 기본값으로 다시 그린다(비제어 칸).
  const [evidenceSeed, setEvidenceSeed] = useState(0);
  const [preview, setPreview] = useState<Preview>({ split: null, teamName: initialTeamName });
  const [previewing, setPreviewing] = useState(false);
  // 등록 성공의 결과 한 줄 — 새 기본값으로 다시 그린(gen) 뒤에 `succeed`로 넘긴다.
  const doneStatusRef = useRef<string | null>(null);
  // 결과 한 줄이 선 동안(다음 입력 전) — 같은 자리의 막힘 이유가 그 줄을 가리지 않게 막힘 줄을 미룬다(제출은 handleSubmit이 막는다).
  const [showingResult, setShowingResult] = useState(false);
  const submittedRef = useRef<{ corpCardId: string; linkKind: "team_cost" | null } | null>(null);

  const { execute, result, isExecuting, reset } = useAction(createCardUsageAction, {
    onSuccess: ({ data }) => {
      const submitted = submittedRef.current;
      const next: CardUsageDefaults = {
        usedOn: today,
        corpCardId: submitted?.corpCardId ?? null,
        linkKind: submitted?.linkKind ?? null,
        evidenceTypeCode: initialDefaults.evidenceTypeCode,
      };
      setDefaults(next);
      setCardId(next.corpCardId ?? "");
      setUsedOn(next.usedOn);
      setEvidenceTypeCode(next.evidenceTypeCode ?? "");
      setLinkKind(next.linkKind);
      setMerchant(null);
      setPreview({ split: null, teamName: initialTeamName });
      setShowingResult(true);
      doneStatusRef.current = `카드 사용 등록됨 · ${formatKrw(data?.totalKrw ?? 0)}`;
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

  // 서버 계산 한 줄 · 사용일 소속 — 결제 합계 · 사용일 · 증빙 종류가 바뀌면 짧은 지연 뒤 서버에 묻는다(늦은 응답은 버린다).
  const previewSeq = useRef(0);
  const previewKey = JSON.stringify([usedOn, amountRaw, evidenceTypeCode]);
  const firstPreviewKey = useRef(previewKey);
  useEffect(() => {
    if (previewKey === firstPreviewKey.current) return;
    firstPreviewKey.current = "";
    const seq = ++previewSeq.current;
    setPreviewing(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const amount = amountRaw === "" ? null : Number(amountRaw);
        let outcome: Awaited<ReturnType<typeof previewCardAmountsAction>> | undefined;
        try {
          outcome = usedOn
            ? await previewCardAmountsAction({
                usedOn,
                currency: "KRW",
                amount: amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
                evidenceTypeCode: evidenceTypeCode || null,
              })
            : undefined;
        } catch {
          outcome = undefined;
        }
        if (seq !== previewSeq.current) return;
        setPreviewing(false);
        if (outcome?.data) setPreview(outcome.data);
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [previewKey, usedOn, amountRaw, evidenceTypeCode]);

  // 칸을 고치면 지난 서버 거부 줄은 걷는다.
  const editKey = JSON.stringify([cardId, usedOn, amountRaw, evidenceTypeCode, linkKind, merchant?.id ?? ""]);
  const lastEditKey = useRef(editKey);
  useEffect(() => {
    if (editKey === lastEditKey.current) return;
    lastEditKey.current = editKey;
    if (result.serverError || result.validationErrors) reset();
  }, [editKey, result.serverError, result.validationErrors, reset]);

  const blanks = [
    ...(cardId ? [] : [{ label: "카드", verb: "고르기" }]),
    ...(usedOn ? [] : [{ label: "사용일", verb: "고르기" }]),
    ...(amountRaw ? [] : [{ label: "결제 합계", verb: "적기" }]),
  ];
  const evidenceBlock = evidenceTypeCode
    ? undefined
    : evidenceTypes.length === 0
      ? "카드에 쓸 증빙 종류 없음 · 코드표 세금 규칙은 관리자"
      : "카드 전표 카드에 없음 · 증빙 종류 고르기";
  const teamBlock = linkKind === "team_cost" && preview.teamName === null ? `${userName} ${usedOn.slice(5)} 소속 없음 · 소속 발령은 관리자` : undefined;
  const blockedReason = blankBlock(blanks) ?? evidenceBlock ?? (linkKind ? teamBlock : "연결 없음 · 연결 고르기");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockedReason) {
      setShowingResult(false);
      return;
    }
    const formData = new FormData(event.currentTarget);
    const memo = formData.get("memo");
    submittedRef.current = { corpCardId: cardId, linkKind };
    execute({
      corpCardId: cardId,
      usedOn,
      merchantVendorId: merchant?.id ?? null,
      currency: "KRW",
      amount: Number(amountRaw),
      evidenceTypeCode,
      linkKind,
      memo: typeof memo === "string" && memo.trim() !== "" ? memo.trim() : null,
    });
  }

  function pickMerchant(next: Merchant) {
    setShowingResult(false);
    setMerchant(next);
    setPickOpen(false);
    if (next.defaultEvidenceType && evidenceTypes.some((option) => option.value === next.defaultEvidenceType)) {
      setEvidenceTypeCode(next.defaultEvidenceType);
      setEvidenceSeed((value) => value + 1);
    }
  }

  const fieldErrors = result.validationErrors;
  const singleCard = cards.length === 1 ? cards[0] : undefined;

  return (
    <>
      <PanelForm
        ref={panelRef}
        id="card-usage-form"
        label="카드 사용 등록"
        intent="create"
        onSubmit={handleSubmit}
        pending={isExecuting}
        blockedReason={showingResult ? undefined : blockedReason}
        reason={result.serverError ?? null}
        reasonId="card-usage-form-reason"
      >
        {/* 칸 줄 간격은 TextField 줄(`--s-4`)과 같은 클래스로 맞춘다(새 CSS 모듈 없음). 입력이 시작되면 결과 한 줄 대신 막힘 줄. */}
        <div key={gen} onInput={() => setShowingResult(false)} onChange={() => setShowingResult(false)}>
          {singleCard ? (
            <div className={rowStyles.row}>
              <span className={rowStyles.label}>카드</span>
              <span>{singleCard.label}</span>
              <input type="hidden" name="corpCardId" value={singleCard.id} readOnly />
            </div>
          ) : (
            <div className={rowStyles.row}>
              <Form.Field id="card-usage-card" label="카드">
                <Select
                  id="card-usage-card"
                  name="corpCardId"
                  options={cards.map((card) => ({ value: card.id, label: card.label }))}
                  defaultValue={defaults.corpCardId ?? ""}
                  onChange={(event) => setCardId(event.target.value)}
                />
              </Form.Field>
            </div>
          )}
          <TextField
            id="card-usage-used-on"
            name="usedOn"
            label="사용일"
            type="date"
            defaultValue={defaults.usedOn}
            onChange={(event) => setUsedOn(event.target.value)}
            error={fieldErrors?.usedOn?._errors?.[0]}
          />
          <div className={rowStyles.row}>
            <span className={rowStyles.label}>가맹점</span>
            <span>{merchant ? merchant.name : "—"}</span>{" "}
            <Button variant="tertiary" aria-label="가맹점 바꾸기" onClick={() => setPickOpen(true)}>
              {merchant ? "바꾸기" : "고르기"}
            </Button>
            <input type="hidden" name="merchantVendorId" value={merchant?.id ?? ""} readOnly />
          </div>
          <div className={rowStyles.row}>
            <Form.Field id="card-amount" label="결제 합계">
              <AmountField error={fieldErrors?.amount?._errors?.[0]} onRaw={onAmountRaw} />
              {preview.split ? (
                <Form.Hint>
                  {/* 서버가 다시 셈하는 동안 이전 값은 흐린 글자(UI-SPEC S9 loading — 토큰 하나, 새 CSS 모듈 없음). */}
                  <span style={previewing ? { color: "var(--text-faint)" } : undefined} data-ui="card-calc-line">
                    {calcLine(preview.split)}
                  </span>
                </Form.Hint>
              ) : null}
            </Form.Field>
          </div>
          <div className={rowStyles.row}>
            <Form.Field id="card-usage-evidence" label="증빙 종류">
              <Select
                key={evidenceSeed}
                id="card-usage-evidence"
                name="evidenceTypeCode"
                options={evidenceTypes}
                defaultValue={evidenceTypeCode}
                onChange={(event) => setEvidenceTypeCode(event.target.value)}
              />
            </Form.Field>
          </div>
          <div className={rowStyles.row} role="radiogroup" aria-labelledby="card-usage-link-label">
            <span id="card-usage-link-label" className={rowStyles.label}>
              연결
            </span>
            <label>
              <input
                type="radio"
                name="linkKind"
                value="team_cost"
                defaultChecked={defaults.linkKind === "team_cost"}
                onChange={() => setLinkKind("team_cost")}
              />{" "}
              팀 비용
            </label>
            {/* 팀 비용 = 사용한 사람의 사용일 소속(읽기 텍스트 · 힌트 없음 — M-5). */}
            {linkKind === "team_cost" && preview.teamName ? <div data-ui="card-usage-team">{preview.teamName}</div> : null}
          </div>
          <TextField id="card-usage-memo" name="memo" label="메모" maxLength={500} defaultValue="" />
        </div>
      </PanelForm>
      <MerchantPickDialog open={pickOpen} onClose={() => setPickOpen(false)} onPick={pickMerchant} />
    </>
  );
}
