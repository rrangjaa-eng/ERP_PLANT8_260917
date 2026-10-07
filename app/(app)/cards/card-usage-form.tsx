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
import { CARD_RECEIPT_CODE, cardEvidenceDefault } from "@/domain/corp-card-usages/amounts";
import { formatKrw } from "@/lib/format-number";
import type { NumberInputKind } from "@/lib/format-number";
import selectStyles from "@/ui/select/Select.module.css";
import textFieldStyles from "@/ui/input/TextField.module.css";
import cardStyles from "./cards.module.css";
import { createCardUsageAction, previewCardAmountsAction, searchMerchantsAction, updateCardUsageAction } from "./actions";
import { LinkPicker, type PickedLine, type PickedProject } from "./link-picker";

// 06-05(UI-SPEC S9 · C12): 카드 사용 등록 옆 패널 본문 — `PanelForm intent="create"` + `Form layout="panel"`. 사람은 결제 합계만 적고
// 공급가 · 부가세는 서버 계산 한 줄이다(D-607). 등록 뒤 패널은 열린 채 칸이 「새 건의 기본값」(직전 등록 = 방금 등록)으로 돌아가고
// 결과 한 줄 `카드 사용 등록됨 · {합계}`가 선다(토스트 · 되돌리기 없음). 06-07 · 06-09 · 06-12 · 06-25가 이 파일에 모드 · 칸을 더한다(CF-4).
//
// 칸은 비제어(defaultValue)이고 등록 뒤 `gen` 키로 새로 그린 다음 `succeed`를 부른다 — `form.reset()`이 새 기본값으로 돌아가게.

/** `proxyHint` — 대리 등록 권한자가 남의 카드를 고르면 카드 아래 서는 글자(서버가 정한다 — 화면이 판정하지 않는다). */
export type CardOption = { id: string; label: string; proxyHint?: string | null };
export type EvidenceTypeOption = { value: string; label: string };
type LinkKind = "team_cost" | "quote_line" | "out_of_quote";

export type CardUsageDefaults = {
  usedOn: string;
  corpCardId: string | null;
  linkKind: LinkKind | null;
  /** 06-07 M-4 — 진입 줄 · 진입 프로젝트 · 직전 등록의 프로젝트(서버가 고를 수 있을 때만 채운다). 견적 줄은 진입 줄일 때만. */
  project: PickedProject | null;
  line: PickedLine | null;
  evidenceTypeCode: string | null;
};

type Merchant = { id: string; name: string; defaultEvidenceType: string | null; defaultEvidenceName: string | null };

/** 06-09 수정 모드(`?editId=`) — 저장된 건(서버 투영 값). 카드는 읽기 텍스트, 저장 = 패널 닫힘. */
export type CardUsageEdit = {
  id: string;
  version: number;
  cardId: string;
  cardText: string;
  proxyHint: string | null;
  usedOn: string;
  merchant: Merchant | null;
  evidenceTypeCode: string;
  linkKind: LinkKind;
  project: PickedProject | null;
  line: PickedLine | null;
  usedByUserId: string;
  memo: string | null;
  currency: "KRW" | "USD";
  amount: number | null;
  fxRate: number | null;
  /** 연결을 바꿀 수 있나(O-11 — 구매 완료로 생긴 건은 못 바꾼다). */
  changeLink: boolean;
};

type Preview = {
  split: { supplyKrw: number; vatKrw: number; residualKrw: number; ruleKind: string; evidenceLabel: string } | null;
  teamName: string | null;
  teamAssigned: boolean;
  /** 사용일 기준 쓸 카드(서버 투영) — 없으면(첫 미리보기 전 · 등록 뒤 오늘로 돌아감) 페이지가 준 오늘 기준 카드. */
  cards?: { id?: string; label?: string; proxyHint?: string | null }[];
};


function blankBlock(blanks: { label: string; verb: string }[]): string | undefined {
  const first = blanks[0];
  if (!first) return undefined;
  return `${blanks.map((blank) => blank.label).join(" · ")} ${blanks.length}칸 비어 있음 · ${first.label} ${first.verb}`;
}

// 「표시 — 카드 사용 폼 서버 계산 한 줄」 — 잔차가 0이 아니면 끝에 `· 반올림 차이 N`(부호 포함, D-607 · CROSS R-1).
function calcLine(split: NonNullable<Preview["split"]>): string {
  if (split.ruleKind === "none") return `공급가 ${formatKrw(split.supplyKrw)} · 규칙 없음`;
  const residual = split.residualKrw === 0 ? "" : ` · 반올림 차이 ${split.residualKrw > 0 ? "+" : ""}${formatKrw(split.residualKrw)}`;
  return `공급가 ${formatKrw(split.supplyKrw)} · 부가세 ${formatKrw(split.vatKrw)} · ${split.evidenceLabel} 규칙${residual}`;
}

// 가맹점 기본 증빙 종류 → 카드 옵션 밖이면 `카드 전표`(옵션 안에 있을 때만, UI-SPEC S9) — 서버와 같은 순수 함수.
function evidenceForMerchant(vendorDefault: string | null, options: readonly EvidenceTypeOption[]): { code: string | null; outside: boolean } {
  const picked = cardEvidenceDefault(vendorDefault, options.map((option) => option.value));
  return { code: picked.code, outside: picked.outsideDefault !== null };
}

// 칸 줄 · 라벨 모양은 TextField 줄과 같은 클래스(ui/input) — 패널 칸 간격이 한 규칙이다.
const rowStyles = { row: textFieldStyles.row, label: textFieldStyles.label };

function AmountField({ kind, initial, error, onRaw }: { kind: NumberInputKind; initial: string; error: string | undefined; onRaw: (raw: string) => void }) {
  const { inputRef, value, onChange, error: inputError, rawValue } = useCommaInput(kind, initial);
  useEffect(() => onRaw(rawValue), [rawValue, onRaw]);
  const shown = inputError ?? error;
  return (
    <>
      {/* 이름은 보이는 칸에 — PanelForm이 입력 이벤트 순간의 FormData로 바뀐 칸을 센다(숨은 칸은 다음 렌더에야 바뀐다). 제출 값은 상태(rawValue). */}
      <input
        id="card-amount"
        name="amount"
        ref={inputRef}
        type="text"
        inputMode={kind === "krw" ? "numeric" : "decimal"}
        autoComplete="off"
        value={value}
        onChange={onChange}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? "card-amount-error" : undefined}
        className={[textFieldStyles.input, textFieldStyles.numeric, shown ? textFieldStyles.inputError : ""].filter(Boolean).join(" ")}
      />
      {shown ? <Form.Error id="card-amount-error">{shown}</Form.Error> : null}
    </>
  );
}

// 환율 칸(O-7) — 기본값 = 설정 최근 환율(FX-01), 없으면 빈 칸.
function FxField({ initial, error, onRaw }: { initial: number | null; error: string | undefined; onRaw: (raw: string) => void }) {
  const { inputRef, value, onChange, error: inputError, rawValue } = useCommaInput("fxRate", initial === null ? "" : String(initial));
  useEffect(() => onRaw(rawValue), [rawValue, onRaw]);
  const shown = inputError ?? error;
  return (
    <Form.Field id="card-fx-rate" label="환율">
      <input
        id="card-fx-rate"
        name="fxRate"
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={onChange}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? "card-fx-rate-error" : undefined}
        className={[textFieldStyles.input, textFieldStyles.numeric, shown ? textFieldStyles.inputError : ""].filter(Boolean).join(" ")}
      />
      {shown ? <Form.Error id="card-fx-rate-error">{shown}</Form.Error> : null}
    </Form.Field>
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
  teamAssigned: initialTeamAssigned,
  userName,
  today,
  usdFxRate,
  defaults: initialDefaults,
  edit = null,
}: {
  cards: CardOption[];
  evidenceTypes: EvidenceTypeOption[];
  teamName: string | null;
  teamAssigned: boolean;
  userName: string;
  today: string;
  usdFxRate: number | null;
  defaults: CardUsageDefaults;
  edit?: CardUsageEdit | null;
}) {
  const panelRef = useRef<PanelFormHandle>(null);
  const [gen, setGen] = useState(0);
  const [defaults, setDefaults] = useState(initialDefaults);
  const [cardId, setCardId] = useState(initialDefaults.corpCardId ?? (cards.length === 1 ? (cards[0]?.id ?? "") : ""));
  const [usedOn, setUsedOn] = useState(initialDefaults.usedOn);
  const [currency, setCurrency] = useState<"KRW" | "USD">(edit?.currency ?? "KRW");
  const initialAmount = edit?.amount === null || edit?.amount === undefined ? "" : String(edit.amount);
  const [amountRaw, setAmountRaw] = useState(initialAmount);
  const initialFx = edit && edit.currency !== "KRW" && edit.fxRate !== null ? edit.fxRate : usdFxRate;
  const [fxRaw, setFxRaw] = useState(initialFx === null ? "" : String(initialFx));
  // 수정 모드: 저장된 증빙 종류가 지금 카드 옵션에 없으면 `—`에 선다(UI-SPEC S9 — 그 값을 옵션에 되살리지 않는다).
  const [evidenceTypeCode, setEvidenceTypeCode] = useState(
    edit ? (evidenceTypes.some((option) => option.value === edit.evidenceTypeCode) ? edit.evidenceTypeCode : "") : (initialDefaults.evidenceTypeCode ?? ""),
  );
  const [linkKind, setLinkKind] = useState<LinkKind | null>(initialDefaults.linkKind);
  // 06-07 견적 줄 연결 — 프로젝트 · 줄은 패널 위 고르기(S10)로만 채운다. 줄 DTO의 남은 실행가 · 힌트를 그대로 보인다(새 셈 없음).
  const [linkProject, setLinkProject] = useState<PickedProject | null>(initialDefaults.project);
  const [linkLine, setLinkLine] = useState<PickedLine | null>(initialDefaults.line);
  // 견적 외 비용 항목 — 사람이 고치기 전(null)에는 가맹점 이름을 따른다(UI-SPEC S9 「기본값 = 가맹점 이름」).
  const [itemName, setItemName] = useState<string | null>(null);
  const [linkStep, setLinkStep] = useState<"project" | "line" | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const linkPickedRef = useRef<string | null>(null);
  useEffect(() => {
    const focusId = linkPickedRef.current;
    if (focusId === null) return;
    linkPickedRef.current = null;
    linkInputRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
    // 고르기 목록이 닫히며 누른 버튼으로 돌린 포커스 뒤에 — 다음 빈 「바꾸기」(프로젝트 뒤 = 견적 줄), 없으면 방금 바뀐 칸.
    window.setTimeout(() => document.getElementById(focusId)?.focus(), 0);
  }, [linkProject, linkLine, linkKind]);
  const [merchant, setMerchant] = useState<Merchant | null>(edit?.merchant ?? null);
  const [pickOpen, setPickOpen] = useState(false);
  // 가맹점은 이름 없는 상태 + 숨은 칸이라 입력 이벤트가 없다 — 고른 뒤 숨은 칸 값이 바뀌면 change를 쏴 PanelForm이 바뀐 칸으로 센다(DR1 · SP-8).
  const merchantInputRef = useRef<HTMLInputElement>(null);
  const merchantPickedRef = useRef(false);
  useEffect(() => {
    if (!merchantPickedRef.current) return;
    merchantPickedRef.current = false;
    merchantInputRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [merchant]);
  // 가맹점으로 증빙 종류를 채우면 그 칸을 새 기본값으로 다시 그린다(비제어 칸).
  const [evidenceSeed, setEvidenceSeed] = useState(0);
  const [preview, setPreview] = useState<Preview>({ split: null, teamName: initialTeamName, teamAssigned: initialTeamAssigned });
  const [previewing, setPreviewing] = useState(false);
  // 등록 성공의 결과 한 줄 — 새 기본값으로 다시 그린(gen) 뒤에 `succeed`로 넘긴다.
  const doneStatusRef = useRef<string | null>(null);
  // 결과 한 줄이 선 동안(다음 입력 전) — 같은 자리의 막힘 이유가 그 줄을 가리지 않게 막힘 줄을 미룬다(제출은 handleSubmit이 막는다).
  const [showingResult, setShowingResult] = useState(false);
  const submittedRef = useRef<{ corpCardId: string; linkKind: LinkKind | null; project: PickedProject | null } | null>(null);

  // 수정 저장 — 성공하면 패널이 닫히고 포커스가 연 요소(그 행 `수정`)로 돌아간다(PanelForm intent="edit").
  const update = useAction(updateCardUsageAction, { onSuccess: () => panelRef.current?.succeed() });
  const create = useAction(createCardUsageAction, {
    onSuccess: ({ data }) => {
      const submitted = submittedRef.current;
      const next: CardUsageDefaults = {
        usedOn: today,
        corpCardId: submitted?.corpCardId ?? null,
        linkKind: submitted?.linkKind ?? null,
        // 방금 등록 = 직전 등록(M-4) — 종류 · 프로젝트는 남고 견적 줄은 빈다(줄은 건마다 다르다).
        project: submitted?.project ?? null,
        line: null,
        evidenceTypeCode: initialDefaults.evidenceTypeCode,
      };
      setDefaults(next);
      setCardId(next.corpCardId ?? "");
      setUsedOn(next.usedOn);
      setEvidenceTypeCode(next.evidenceTypeCode ?? "");
      setLinkKind(next.linkKind);
      setLinkProject(next.project);
      setLinkLine(null);
      setItemName(null);
      setMerchant(null);
      setCurrency("KRW");
      setFxRaw(usdFxRate === null ? "" : String(usdFxRate));
      setPreview({ split: null, teamName: initialTeamName, teamAssigned: initialTeamAssigned });
      setShowingResult(true);
      doneStatusRef.current = `카드 사용 등록됨 · ${formatKrw(data?.totalKrw ?? 0)}`;
      setGen((value) => value + 1);
    },
  });

  const { execute: executeCreate, result: createResult, isExecuting: creating, reset: resetCreate } = create;
  const result = edit ? update.result : createResult;
  const isExecuting = edit ? update.isExecuting : creating;
  const reset = edit ? update.reset : resetCreate;

  // 새 기본값으로 다시 그린 뒤에 성공 신호 — PanelForm이 reset · 스냅숏 · 결과 한 줄 · 첫 칸 포커스를 한다.
  useEffect(() => {
    const status = doneStatusRef.current;
    if (status === null) return;
    doneStatusRef.current = null;
    panelRef.current?.succeed({ status });
  }, [gen]);

  // 카드 자격은 사용일 소속으로 정해진다 — 사용일을 바꾸면 그날 쓸 카드로 선택지를 바꾸고, 고른 카드가 빠지면 비운다(한 장이면 그 카드).
  const usableCards: CardOption[] = preview.cards
    ? preview.cards.flatMap((card) => (card.id && card.label ? [{ id: card.id, label: card.label, proxyHint: card.proxyHint ?? null }] : []))
    : cards;
  // 수정 모드의 카드 = 저장된 카드(여는 사람의 카드 옵션을 보지 않는다 — 옵션 0장이어도 선다).
  const selectedCardId = edit ? edit.cardId : usableCards.some((card) => card.id === cardId) ? cardId : usableCards.length === 1 ? (usableCards[0]?.id ?? "") : "";
  const proxyHint = edit ? edit.proxyHint : (usableCards.find((card) => card.id === selectedCardId)?.proxyHint ?? null);

  const onAmountRaw = useCallback((raw: string) => setAmountRaw(raw), []);
  const onFxRaw = useCallback((raw: string) => setFxRaw(raw), []);
  const fxValue = currency === "KRW" ? undefined : fxRaw === "" ? null : Number(fxRaw);

  // 서버 계산 한 줄 · 사용일 소속 — 결제 합계 · 사용일 · 증빙 종류가 바뀌면 짧은 지연 뒤 서버에 묻는다(늦은 응답은 버린다).
  const previewSeq = useRef(0);
  const previewKey = JSON.stringify([usedOn, currency, amountRaw, currency === "KRW" ? "" : fxRaw, evidenceTypeCode]);
  // 수정 모드는 열자마자 서버 계산 한 줄을 받는다(저장된 값의 역산 · 실행가 초과 판정).
  const firstPreviewKey = useRef(edit ? "" : previewKey);
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
                currency,
                amount: amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
                ...(fxValue !== undefined && fxValue !== null && Number.isFinite(fxValue) && fxValue > 0 ? { fxRate: fxValue } : {}),
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
  }, [previewKey, usedOn, currency, amountRaw, fxValue, evidenceTypeCode]);

  // 칸을 고치면 지난 서버 거부 줄은 걷는다.
  const editKey = JSON.stringify([
    selectedCardId,
    usedOn,
    currency,
    amountRaw,
    fxRaw,
    evidenceTypeCode,
    linkKind,
    linkProject?.id ?? "",
    linkLine?.id ?? "",
    itemName ?? "",
    merchant?.id ?? "",
  ]);
  const lastEditKey = useRef(editKey);
  useEffect(() => {
    if (editKey === lastEditKey.current) return;
    lastEditKey.current = editKey;
    if (result.serverError || result.validationErrors) reset();
  }, [editKey, result.serverError, result.validationErrors, reset]);

  const shownItemName = itemName ?? merchant?.name ?? "";
  const blanks = [
    ...(selectedCardId ? [] : [{ label: "카드", verb: "고르기" }]),
    ...(usedOn ? [] : [{ label: "사용일", verb: "고르기" }]),
    ...(amountRaw ? [] : [{ label: "결제 합계", verb: "적기" }]),
    ...(linkKind === "out_of_quote" && linkProject && shownItemName.trim() === "" ? [{ label: "항목", verb: "적기" }] : []),
  ];
  const evidenceBlock = evidenceTypeCode
    ? undefined
    : evidenceTypes.length === 0
      ? "카드에 쓸 증빙 종류 없음 · 코드표 세금 규칙은 관리자"
      : evidenceTypes.some((option) => option.value === CARD_RECEIPT_CODE)
        ? blankBlock([{ label: "증빙 종류", verb: "고르기" }])
        : "카드 전표 카드에 없음 · 증빙 종류 고르기";
  const fxBlock = currency !== "KRW" && (fxValue === null || fxValue === undefined) ? "환율 없음 · USD 환율 적기" : undefined;
  const teamBlock = linkKind === "team_cost" && !preview.teamAssigned ? `${userName} ${usedOn.slice(5)} 소속 없음 · 소속 발령은 관리자` : undefined;
  const linkBlock =
    linkKind === null || (linkKind === "quote_line" && !linkLine) || (linkKind === "out_of_quote" && !linkProject) ? "연결 없음 · 연결 고르기" : undefined;
  // 실행가 초과(Q3) — 고른 줄 DTO의 남은 실행가와 서버 계산 공급가를 견준다. 서버도 잠근 뒤 같은 판정으로 거부한다.
  const overCap =
    linkKind === "quote_line" && linkLine && linkLine.remainingKrw !== null && preview.split && preview.split.supplyKrw > linkLine.remainingKrw
      ? `실행가 초과 · 남은 실행가 ${formatKrw(linkLine.remainingKrw)} · `
      : undefined;
  const blockedReason = blankBlock(blanks) ?? fxBlock ?? evidenceBlock ?? linkBlock ?? teamBlock ?? (overCap ? `${overCap}다른 줄 고르기` : undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockedReason) {
      setShowingResult(false);
      return;
    }
    const formData = new FormData(event.currentTarget);
    const memo = formData.get("memo");
    submittedRef.current = { corpCardId: selectedCardId, linkKind, project: linkKind === "team_cost" ? null : linkProject };
    // 수정: 저장된 견적 외 비용 줄을 그대로 두면 그 줄 id로 보낸다(연결 그대로 — 새 줄을 만들지 않는다, UC-1 상한).
    const keptOutOfQuote = edit && edit.linkKind === "out_of_quote" && linkKind === "out_of_quote" && linkProject?.id === edit.project?.id && edit.line;
    const payload = {
      corpCardId: selectedCardId,
      usedOn,
      merchantVendorId: merchant?.id ?? null,
      currency,
      amount: Number(amountRaw),
      ...(currency !== "KRW" && fxValue ? { fxRate: fxValue } : {}),
      evidenceTypeCode,
      link: keptOutOfQuote
        ? { kind: "line" as const, lineId: edit.line?.id ?? "" }
        : linkKind === "team_cost"
          ? { kind: "team" as const }
          : linkKind === "quote_line" && linkLine
            ? { kind: "line" as const, lineId: linkLine.id }
            : linkKind === "out_of_quote" && linkProject
              ? { kind: "out_of_quote" as const, projectId: linkProject.id, itemName: shownItemName.trim() || null }
              : null,
      memo: typeof memo === "string" && memo.trim() !== "" ? memo.trim() : null,
    };
    if (edit) update.execute({ ...payload, id: edit.id, version: edit.version, usedByUserId: edit.usedByUserId });
    else executeCreate(payload);
  }

  function pickMerchant(next: Merchant) {
    setShowingResult(false);
    merchantPickedRef.current = true;
    setMerchant(next);
    setPickOpen(false);
    const evidence = evidenceForMerchant(next.defaultEvidenceType, evidenceTypes);
    setEvidenceTypeCode(evidence.code ?? "");
    setEvidenceSeed((value) => value + 1);
  }

  const fieldErrors = result.validationErrors;
  const singleCard = usableCards.length === 1 ? usableCards[0] : undefined;

  return (
    <>
      <PanelForm
        ref={panelRef}
        id="card-usage-form"
        label={edit ? "카드 사용 저장" : "카드 사용 등록"}
        intent={edit ? "edit" : "create"}
        onSubmit={handleSubmit}
        pending={isExecuting}
        blockedReason={showingResult ? undefined : blockedReason}
        reason={
          result.serverError ??
          (overCap && !showingResult && blankBlock(blanks) === undefined && !fxBlock && !evidenceBlock ? (
            <>
              {overCap}
              <Button variant="tertiary" onClick={() => document.getElementById("card-usage-line-change")?.focus()}>
                다른 줄 고르기
              </Button>
            </>
          ) : null)
        }
        reasonId="card-usage-form-reason"
      >
        {/* 칸 줄 간격은 TextField 줄(`--s-4`)과 같은 클래스로 맞춘다(새 CSS 모듈 없음). 입력이 시작되면 결과 한 줄 대신 막힘 줄. */}
        <div key={gen} onInput={() => setShowingResult(false)} onChange={() => setShowingResult(false)}>
          {edit ? (
            <div data-ui="field-row" className={rowStyles.row}>
              <span className={rowStyles.label}>카드</span>
              <span>{edit.cardText}</span>
              {proxyHint ? <Form.Hint>{proxyHint}</Form.Hint> : null}
            </div>
          ) : singleCard ? (
            <div data-ui="field-row" className={rowStyles.row}>
              <span className={rowStyles.label}>카드</span>
              <span>{singleCard.label}</span>
              <input type="hidden" name="corpCardId" value={singleCard.id} readOnly />
              {proxyHint ? <Form.Hint>{proxyHint}</Form.Hint> : null}
            </div>
          ) : (
            <div data-ui="field-row" className={rowStyles.row}>
              <Form.Field id="card-usage-card" label="카드">
                <Select
                  key={usableCards.map((card) => card.id).join()}
                  id="card-usage-card"
                  name="corpCardId"
                  options={usableCards.map((card) => ({ value: card.id, label: card.label }))}
                  defaultValue={selectedCardId}
                  onChange={(event) => setCardId(event.target.value)}
                />
                {proxyHint ? <Form.Hint>{proxyHint}</Form.Hint> : null}
              </Form.Field>
            </div>
          )}
          <TextField
            id="card-usage-used-on"
            name="usedOn"
            label="사용일"
            type="date"
            max={today}
            defaultValue={defaults.usedOn}
            onChange={(event) => setUsedOn(event.target.value)}
            error={fieldErrors?.usedOn?._errors?.[0]}
          />
          <div data-ui="field-row" className={rowStyles.row}>
            <span className={rowStyles.label}>가맹점</span>
            <span>{merchant ? merchant.name : "—"}</span>{" "}
            <Button variant="tertiary" aria-label="가맹점 바꾸기" onClick={() => setPickOpen(true)}>
              {merchant ? "바꾸기" : "고르기"}
            </Button>
            <input ref={merchantInputRef} type="hidden" name="merchantVendorId" value={merchant?.id ?? ""} readOnly />
            {merchant?.defaultEvidenceName && evidenceForMerchant(merchant.defaultEvidenceType, evidenceTypes).outside ? (
              <Form.Hint>{`기본 증빙 ${merchant.defaultEvidenceName} · 카드에 없음`}</Form.Hint>
            ) : null}
          </div>
          <div data-ui="field-row" className={rowStyles.row}>
            <Form.Field id="card-amount" label="결제 합계">
              <select
                aria-label="통화"
                name="currency"
                className={selectStyles.select}
                defaultValue={edit?.currency ?? "KRW"}
                onChange={(event) => setCurrency(event.target.value === "USD" ? "USD" : "KRW")}
              >
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
              <AmountField
                key={currency}
                kind={currency === "KRW" ? "krw" : "foreign"}
                initial={edit && currency === edit.currency ? initialAmount : ""}
                error={fieldErrors?.amount?._errors?.[0]}
                onRaw={onAmountRaw}
              />
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
          {currency === "USD" ? (
            <div data-ui="field-row" className={rowStyles.row}>
              <FxField initial={initialFx} error={fieldErrors?.fxRate?._errors?.[0]} onRaw={onFxRaw} />
            </div>
          ) : null}
          <div data-ui="field-row" className={rowStyles.row}>
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
          <div data-ui="field-row" className={rowStyles.row} role="radiogroup" aria-labelledby="card-usage-link-label">
            <span id="card-usage-link-label" className={rowStyles.label}>
              연결
            </span>
            {/* 라디오는 제어 칸 — 고르기 목록의 `견적 외 비용으로`가 종류를 바꾼다(SP-8). 순서는 UI-SPEC S9 와이어. */}
            {(
              [
                ["quote_line", "견적 줄"],
                ["out_of_quote", "견적 외 비용"],
                ["team_cost", "팀 비용"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={cardStyles.linkOption}>
                <input type="radio" name="linkKind" value={value} checked={linkKind === value} onChange={() => setLinkKind(value)} /> {label}
              </label>
            ))}
            {/* 팀 비용 = 사용한 사람의 사용일 소속(읽기 텍스트 · 힌트 없음 — M-5). */}
            {linkKind === "team_cost" && preview.teamName ? <div data-ui="card-usage-team">{preview.teamName}</div> : null}
          </div>
          <input
            ref={linkInputRef}
            type="hidden"
            name="linkTarget"
            value={linkKind === "quote_line" || linkKind === "out_of_quote" ? `${linkProject?.id ?? ""}:${linkKind === "quote_line" ? (linkLine?.id ?? "") : ""}` : ""}
            readOnly
          />
          {linkKind === "quote_line" || linkKind === "out_of_quote" ? (
            <>
              <div data-ui="field-row" className={rowStyles.row}>
                <span className={rowStyles.label}>프로젝트</span>
                <span>{linkProject ? linkProject.label : "—"}</span>{" "}
                <Button id="card-usage-project-change" variant="tertiary" aria-label="프로젝트 바꾸기" onClick={() => setLinkStep("project")}>
                  {linkProject ? "바꾸기" : "고르기"}
                </Button>
              </div>
              {linkKind === "out_of_quote" && linkProject ? (
                <TextField
                  id="card-usage-item"
                  name="itemName"
                  label="항목"
                  maxLength={200}
                  value={shownItemName}
                  onChange={(event) => setItemName(event.target.value)}
                />
              ) : null}
              {linkKind === "out_of_quote" && linkProject && preview.split ? (
                <Form.Hint>{`저장하면 견적 외 비용 줄 생김 · 실행가 ${formatKrw(preview.split.supplyKrw)}`}</Form.Hint>
              ) : null}
              {linkKind === "quote_line" && linkProject ? (
                <div data-ui="field-row" className={rowStyles.row}>
                  <span className={rowStyles.label}>견적 줄</span>
                  <span>{linkLine ? linkLine.itemName : "—"}</span>{" "}
                  <Button id="card-usage-line-change" variant="tertiary" aria-label="견적 줄 바꾸기" onClick={() => setLinkStep("line")}>
                    {linkLine ? "바꾸기" : "고르기"}
                  </Button>
                  {linkLine?.hint ? <Form.Hint>{linkLine.hint}</Form.Hint> : null}
                </div>
              ) : null}
            </>
          ) : null}
          <TextField id="card-usage-memo" name="memo" label="메모" maxLength={500} defaultValue={edit?.memo ?? ""} />
        </div>
      </PanelForm>
      <MerchantPickDialog open={pickOpen} onClose={() => setPickOpen(false)} onPick={pickMerchant} />
      <LinkPicker
        mode="card"
        step={linkStep}
        projectId={linkProject?.id ?? null}
        currentLineId={linkLine?.id ?? null}
        onClose={() => setLinkStep(null)}
        onPickProject={(project) => {
          setShowingResult(false);
          setLinkStep(null);
          if (project.id !== linkProject?.id) setLinkLine(null);
          linkPickedRef.current = linkKind === "out_of_quote" ? "card-usage-item" : "card-usage-line-change";
          setLinkProject(project);
        }}
        onPickLine={(line) => {
          setShowingResult(false);
          setLinkStep(null);
          linkPickedRef.current = "card-usage-line-change";
          setLinkLine(line);
        }}
        onOutOfQuote={() => {
          setShowingResult(false);
          linkPickedRef.current = "card-usage-item";
          setLinkKind("out_of_quote");
        }}
      />
    </>
  );
}
