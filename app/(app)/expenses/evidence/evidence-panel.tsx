"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { parseNumberInput } from "@/lib/format-number";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { splitRefreshTail } from "@/ui/confirm-dialog/ConfirmDialog";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { TextField } from "@/ui/input/TextField";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { EvidenceDetailView } from "@/domain/evidence-records";
import { clearRecordNeedsCheckAction, getEvidenceDetailAction, previewEvidenceAmountAction, updateEvidenceAmountAction } from "./actions";

// 06.1-07(S3 · §7-8 옆 패널 480 · 폰 하단 시트) — 증빙 한 줄의 상세 · 공급가 고침 · 확인 필요 풀기. 값은 서버 DTO(getEvidenceDetail) 그대로 그린다 —
// 세액 · 합계는 서버 미리 보기(previewEvidenceAmount)가 공급가에서 셈하고(PA-AMT), 화면은 금액을 셈하지 않는다. 잠김 글자도 서버가 준다(amountLock).
// 1차는 상태에 따라 하나(DA-13): 확인 필요 → `확인 필요 풀기`(공급가를 바꿨으면 함께) / 그 밖 → `증빙 금액 저장` / 잠김 → 1차 없음.
// 패널 제목은 글자만 받는다(SidePanel `title: string` — ui/ 무변경) — 상태 낱말은 KvList 첫 줄 `상태`(06.1-03 쇼케이스 표본 꼴).

const COPY = {
  needsCheck: "확인 필요",
  clear: "확인 필요 풀기",
  save: "증빙 금액 저장",
  noChange: "바뀐 칸 없음",
  invalidNumber: "숫자 형식 오류 · 12,400,000처럼",
  unknownResult: "결과를 받지 못함 · 새로 고침",
  refresh: "새로 고침",
  draftOwner: "작성 중 문서",
  archived: "보관됨",
} as const;

const STATUS_ROW_WORDS: ReadonlySet<string> = new Set(["확인 필요", "카드 미등록", "보관됨"]);

const FORM_ID = "evidence-panel-form";
const SUPPLY_ID = "evidence-panel-supply";
const PREVIEW_ID = "evidence-panel-preview";

function titleOf(detail: EvidenceDetailView): string {
  return [detail.typeLabel, detail.counterparty ?? "—"].filter((part): part is string => Boolean(part)).join(" · ");
}

function AttachedValue({ detail }: { detail: EvidenceDetailView }) {
  if (!detail.attachedKind) return <>—</>;
  if (detail.attachedPending || !detail.attachedId || !detail.attachedNumber) return <>{detail.attachedKind === "expense" ? COPY.draftOwner : "—"}</>;
  const href = detail.attachedKind === "expense" ? `/expenses/${detail.attachedId}#evidence` : "/cards/purchases";
  return (
    <Link href={href} className={buttonLinkClassName("tertiary")}>
      {detail.attachedNumber}
    </Link>
  );
}

function headItems(detail: EvidenceDetailView): KvItem[] {
  const items: KvItem[] = [];
  // 상태 줄은 공개 · 붙은 문서 줄이 말하지 않는 낱말일 때(미공개 · 팀 공개 · 본부 공개 · 붙음은 아래 줄과 같은 말 — 두 번 쓰지 않는다) 또는
  // 미공개에 사유가 있을 때(07.1-01 — 음수 · 경영관리만 종류의 사유가 폰 시트에도 있다). 팀 · 본부 공개의 부가 글자는 공개 줄이 이미 말하므로 줄을 더하지 않는다
  // (#312 N-1). `{낱말} · {사유}`(warning 낱말 — status-map).
  if (detail.statusWord && (STATUS_ROW_WORDS.has(detail.statusWord) || (detail.statusWord === "미공개" && detail.statusDetail))) {
    items.push({
      label: "상태",
      value: (
        <>
          <StatusTag status={detail.statusWord} variant="text" />
          {detail.statusDetail ? ` · ${detail.statusDetail}` : null}
        </>
      ),
    });
  }
  items.push({ label: "날짜", value: <Num value={detail.issuedOn ?? "—"} /> });
  if (detail.ageDays !== null && detail.ageDays !== undefined) items.push({ label: "며칠째", value: <Num value={`${detail.ageDays}일`} /> });
  if (detail.approvalNo) items.push({ label: "승인번호", value: <Num value={detail.approvalNo} /> });
  if (detail.originalApprovalNo) items.push({ label: "당초 승인번호", value: <Num value={detail.originalApprovalNo} /> });
  if (detail.cardLabel) items.push({ label: "카드", value: detail.cardLabel });
  else if (detail.businessNo) items.push({ label: "사업자번호", value: <Num value={detail.businessNo} /> });
  items.push({ label: "합계", value: <Num value={detail.totalKrw ?? null} /> });
  return items;
}

function tailItems(detail: EvidenceDetailView): KvItem[] {
  const history = detail.history ?? [];
  return [
    { label: "공개", value: detail.visibilityLabel ?? "—" },
    { label: "붙은 문서", value: <AttachedValue detail={detail} /> },
    { label: "이력", value: history.length > 0 ? history.map((line, index) => <div key={index}>{line}</div>) : "—" },
    { label: "등록", value: detail.registered ?? "—" },
  ];
}

/** 읽기 줄 전부(공급가 · 세액 = 글자) — 잠긴 패널과 1024 미만 행 시트(RowSheet)가 같이 쓴다. */
export function evidenceReadItems(detail: EvidenceDetailView): KvItem[] {
  return [
    ...headItems(detail),
    { label: "공급가", value: <Num value={detail.supplyKrw ?? null} /> },
    { label: "세액", value: <Num value={detail.vatKrw ?? null} /> },
    ...tailItems(detail),
  ];
}

type Preview = { supplyKrw: number; vatKrw: number; totalKrw: number } | { supplyKrw: number; reason: string };
type Failure = { message: string; conflict: boolean };

export type EvidencePanelProps = {
  detail: EvidenceDetailView;
  /** 입력 아래 서버 한 줄 · 잠김 줄의 글자 모양(`--text-aux` · `--text-muted`) — 표 화면의 결과 줄 클래스를 넘겨받는다. 이 파일이 라우트 CSS 모듈을
   *  따로 import하면 번들의 CSS 차례가 바뀌어 같은 명시도의 표 칸 편집기(.cellSelect)가 ui/select에 밀린다(06.1-07 evidence-list-audit ③ 실측). */
  lineClassName: string | undefined;
  onClose: () => void;
  /** 저장 · 풀기 성공 — 호출부가 목록을 다시 받는다(패널은 스스로 닫힌다 — 수정 패널 UQ-8). */
  onSaved: () => void;
};

export function EvidencePanel({ detail: initial, lineClassName, onClose, onSaved }: EvidencePanelProps) {
  const [detail, setDetail] = useState(initial);
  // 새로 고침으로 값 · version을 다시 받으면 폼을 새로 그린다(공급가 칸 기본값 · 바뀐 칸 스냅숏이 새 값에서 다시 시작한다).
  const [formKey, setFormKey] = useState(0);
  const [supplyText, setSupplyText] = useState(() => String(initial.supplyKrw ?? ""));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<PanelFormHandle>(null);

  const id = detail.id;
  const version = detail.version;
  const needsCheck = detail.statusWord === COPY.needsCheck;
  // 보관된 증빙은 금액을 고치지 않는다(서버도 거부 — 독립 검토 P3-2). 상태 줄 `보관됨`이 까닭을 보인다.
  const editable = !detail.amountLock && detail.statusWord !== COPY.archived && detail.supplyKrw !== undefined && detail.totalKrw !== undefined;
  const parsed = parseNumberInput(supplyText);
  const supply = parsed !== null && Number.isInteger(parsed) ? parsed : null;
  const changed = editable && supplyText !== String(detail.supplyKrw ?? "") && supply !== detail.supplyKrw;

  // 고치는 동안 서버가 새 공급가로 세액 · 합계를 다시 셈한 한 줄(06 증빙 확인 미리 보기 꼴 — 250ms 뒤 한 번). 그사이 칸 값이 바뀌었으면 버린다.
  useEffect(() => {
    if (!changed || supply === null || id === undefined) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        let result: Awaited<ReturnType<typeof previewEvidenceAmountAction>> | undefined;
        try {
          result = await previewEvidenceAmountAction({ id, supplyKrw: supply });
        } catch {
          result = undefined;
        }
        if (cancelled || !result?.data) return;
        const data = result.data;
        setPreview(data.ok ? { supplyKrw: supply, vatKrw: data.vatKrw, totalKrw: data.totalKrw } : { supplyKrw: supply, reason: data.reason });
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [changed, supply, id]);

  const current = changed && preview !== null && preview.supplyKrw === supply ? preview : null;
  const fieldError = current && "reason" in current ? current.reason : undefined;
  const line = changed ? (current && "vatKrw" in current ? current : null) : { vatKrw: detail.vatKrw ?? null, totalKrw: detail.totalKrw ?? null };

  async function reload() {
    if (id === undefined) return;
    const result = await getEvidenceDetailAction({ id }).catch(() => undefined);
    const next = result?.data?.detail;
    if (!next) {
      setFailure({ message: result?.serverError ?? COPY.unknownResult, conflict: false });
      return;
    }
    setDetail(next);
    setSupplyText(String(next.supplyKrw ?? ""));
    setPreview(null);
    setFailure(null);
    setFormKey((key) => key + 1);
  }

  // 새로 고침 뒤 포커스 = 새로 그린 공급가 칸. requestAnimationFrame은 React가 새 폼을 커밋하기 전에 돌 수 있어(느린 CI 러너) 곧 지워질 옛 칸에
  // 포커스를 주고 body로 떨어졌다(PR #254 CI e2e (2)) — 새 key의 폼이 커밋된 뒤에 준다.
  useEffect(() => {
    if (formKey > 0) document.getElementById(SUPPLY_ID)?.focus();
  }, [formKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (id === undefined || version === undefined) return;
    if (changed && supply === null) {
      setFailure({ message: COPY.invalidNumber, conflict: false });
      return;
    }
    setPending(true);
    setFailure(null);
    const amount = changed && supply !== null ? supply : undefined;
    try {
      const result = needsCheck
        ? await clearRecordNeedsCheckAction({ id, version, ...(amount !== undefined ? { supplyKrw: amount } : {}) })
        : amount !== undefined
          ? await updateEvidenceAmountAction({ id, version, supplyKrw: amount })
          : undefined;
      if (result?.data?.record) {
        onSaved();
        formRef.current?.succeed();
        return;
      }
      if (result?.data?.conflict) setFailure({ message: result.data.conflict, conflict: true });
      else setFailure({ message: result?.serverError ?? COPY.unknownResult, conflict: false });
    } catch {
      setFailure({ message: COPY.unknownResult, conflict: false });
    } finally {
      setPending(false);
    }
  }

  // DA-23 — 서버 거부는 패널 안 한 줄(입력 값 유지 · 패널 열림). 낡은 version이면 그 줄 꼬리 `새로 고침`이 3차 버튼이다(B-R1 — 문구가 가리키는 행동).
  const alert = failure ? (
    <FormAlert>
      {failure.conflict ? (
        <>
          {splitRefreshTail(failure.message).reason} ·{" "}
          <Button variant="tertiary" onClick={() => void reload()}>
            {COPY.refresh}
          </Button>
        </>
      ) : (
        failure.message
      )}
    </FormAlert>
  ) : null;

  const title = titleOf(detail);

  if (!editable && !needsCheck) {
    // 잠김(DB-3) · 금액을 못 보는 자격 — 공급가는 글자, 1차 없음. 잠김 줄은 서버 글자 그대로.
    return (
      <SidePanel title={title} onClose={onClose}>
        <KvList items={evidenceReadItems(detail)} />
        {detail.amountLock ? <p className={lineClassName}>{detail.amountLock}</p> : null}
      </SidePanel>
    );
  }

  return (
    <SidePanel title={title} onClose={onClose}>
      <PanelForm
        key={formKey}
        ref={formRef}
        id={FORM_ID}
        label={needsCheck ? COPY.clear : COPY.save}
        intent="edit"
        onSubmit={(event) => void submit(event)}
        pending={pending}
        blockedReason={!needsCheck && !changed ? COPY.noChange : undefined}
        dirtyFields={["supplyKrw"]}
      >
        <KvList items={headItems(detail)} />
        {editable ? (
          <>
            <TextField
              id={SUPPLY_ID}
              name="supplyKrw"
              label="공급가"
              numberKind="krw"
              defaultValue={String(detail.supplyKrw ?? "")}
              onInput={(event) => setSupplyText(event.currentTarget.value)}
              error={fieldError}
              hintId={fieldError ? undefined : PREVIEW_ID}
            />
            {fieldError ? null : (
              <p id={PREVIEW_ID} className={lineClassName}>
                {/* 미리 보기를 받는 동안은 빈 줄(앞 값을 다시 적지 않는다) — 받으면 그 수가 들어선다. */}
                {/* 글자를 한 덩이로 — 줄 클래스(undoLine)가 flex라 조각마다 gap이 붙었다(감사 D-3). */}
                {line ? (
                  <span>
                    세액 <Num value={line.vatKrw} /> · 합계 <Num value={line.totalKrw} />
                  </span>
                ) : null}
              </p>
            )}
          </>
        ) : (
          <KvList
            items={[
              { label: "공급가", value: <Num value={detail.supplyKrw ?? null} /> },
              { label: "세액", value: <Num value={detail.vatKrw ?? null} /> },
            ]}
          />
        )}
        {/* 확인 필요 + 금액 잠김(붙은 뒤 확인 필요가 된 줄) — 풀기만 되고 공급가는 글자다. 잠김 줄은 서버 글자 그대로(Codex 2회차 #6). */}
        {!editable && detail.amountLock ? <p className={lineClassName}>{detail.amountLock}</p> : null}
        {alert}
        <KvList items={tailItems(detail)} />
      </PanelForm>
    </SidePanel>
  );
}
