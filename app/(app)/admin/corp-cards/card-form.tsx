"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  createCorpCardAction,
  updateCorpCardOwnerAction,
  setCorpCardActiveAction,
  archiveCorpCardAction,
} from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Form } from "@/ui/form/Form";
import { RowAction } from "@/ui/row-actions/RowActions";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import styles from "./corp-cards.module.css";

export type HolderOption = { id: string; name: string };
export type TeamOption = { id: string; name: string; orgUnitName: string };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// 06-30(Q5 · C8): 종류는 사람이 고른 값 — 공용(shared)은 소지자 · 팀 칸이 없다.
type OwnerKind = "personal" | "team" | "shared";

function toOwnerKind(value: string): OwnerKind {
  return value === "team" || value === "shared" ? value : "personal";
}

// SYSTEM.md §6-3 폼 템플릿(D-39) — 옆 패널 안 폼(04.6-04: `SidePanel` 안 `PanelForm`). 전체 번호(카드 앞 12자리 포함) 입력 칸을
// 만들지 않는다(Task 1이 그 컬럼을 두지 않기로 했다 — 입력 칸만 있는 것은 저장된다는 오해를 준다). 종류에 따라 소유 선택 상자 하나만 보인다(공용은 없음).
// §6-1: page.tsx가 ?new=1일 때만 이 패널을 그린다 — 기본 진입에는 없다. 닫기 경로는 `SidePanel`이 가진다.
// 성공 뒤(UQ-8 B · R9 D): 등록은 패널을 열어 둔 채 칸을 비우고 첫 칸에 포커스 + 결과 한 줄(`PanelForm.succeed` — 상세 화면이 없는 대상).
export function CardForm({ holders, teams }: { holders: HolderOption[]; teams: TeamOption[] }) {
  const panelRef = useRef<PanelFormHandle>(null);
  // 제출 직후 같은 틱의 두 번째 제출(Ctrl+Enter 연타)을 막는 동기 가드 — isExecuting은 다음 렌더에야 참이 된다(D7 · R15-ii).
  const submitLockRef = useRef(false);
  const [kind, setKind] = useState<OwnerKind>("personal");
  const { execute, result, isExecuting, reset } = useAction(createCorpCardAction, {
    onSuccess: () => {
      // 종류 select는 제어 상태라 폼 reset이 따라가지 못한다 — 같이 처음 값으로.
      setKind("personal");
      panelRef.current?.succeed({ status: "법인카드 등록됨" });
    },
    onSettled: () => {
      submitLockRef.current = false;
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    const formData = new FormData(event.currentTarget);
    execute({
      issuer: getStringField(formData, "issuer"),
      numberLast4: getStringField(formData, "numberLast4"),
      label: getStringField(formData, "label"),
      kind,
      holderUserId: kind === "personal" ? getStringField(formData, "holderUserId") || undefined : undefined,
      teamId: kind === "team" ? getStringField(formData, "teamId") || undefined : undefined,
    });
  }

  return (
    <PanelForm
      ref={panelRef}
      id="corp-card-form"
      label="법인카드 등록"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={result.serverError ?? null}
      reasonId="corp-card-form-reason"
    >
      <TextField
        id="issuer"
        name="issuer"
        label="발급사"
        required
        error={result.validationErrors?.issuer?._errors?.[0]}
      />
      <TextField
        id="numberLast4"
        name="numberLast4"
        label="뒤 4자리"
        inputMode="numeric"
        maxLength={4}
        required
        error={result.validationErrors?.numberLast4?._errors?.[0]}
      />
      <TextField id="label" name="label" label="별칭" required error={result.validationErrors?.label?._errors?.[0]} />

      <div className={styles.field}>
        <Form.Field id="card-kind" label="종류">
          <select
            id="card-kind"
            name="kind"
            className={styles.select}
            value={kind}
            onChange={(event) => {
              setKind(toOwnerKind(event.target.value));
              reset();
            }}
          >
            <option value="personal">개인</option>
            <option value="team">팀</option>
            <option value="shared">공용</option>
          </select>
        </Form.Field>
      </div>

      {/* key로 칸을 새로 만든다 — 아래 CardOwnerForm과 같은 이유. */}
      {kind === "personal" ? (
        <div key="personal" className={styles.field}>
          <Form.Field id="holderUserId" label="소지자">
            <select id="holderUserId" name="holderUserId" className={styles.select} required defaultValue="">
              <option value="" disabled>
                소지자 선택
              </option>
              {holders.map((holder) => (
                <option key={holder.id} value={holder.id}>
                  {holder.name}
                </option>
              ))}
            </select>
          </Form.Field>
        </div>
      ) : kind === "team" ? (
        <div key="team" className={styles.field}>
          <Form.Field id="teamId" label="팀">
            <select id="teamId" name="teamId" className={styles.select} required defaultValue="">
              <option value="" disabled>
                팀 선택
              </option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.orgUnitName} · {team.name}
                </option>
              ))}
            </select>
          </Form.Field>
        </div>
      ) : null}
    </PanelForm>
  );
}

// §6-1 목록 행의 「수정」 — 거래처의 ?editId= 토글과 같은 결의 옆 패널(1차 「소유자 변경」). 바꾸는 것은
// 소유자(개인 소지자 · 팀 · 공용)뿐이다: 발급사·뒤 4자리는 카드의 식별자라 바꾸는 것이 아니라 새로 등록하는 일이고, 별칭 수정은 요구사항 밖이다.
// 보관된 카드는 domain/corp-cards가 ArchivedCorpCardError로 거부한다 — 목록이 링크를 감추는 것은 두 겹 중 바깥쪽일 뿐이다.
// 성공 뒤(UQ-8 B · R9 D): 수정은 패널이 닫히고 그 행의 「수정」으로 포커스가 돌아간다(`PanelForm.succeed` — 상세 화면이 없는 대상).
export function CardOwnerForm({
  card,
  holders,
  teams,
}: {
  card: { id: string; label: string; kind: string; holderUserId: string | null; teamId: string | null };
  holders: HolderOption[];
  teams: TeamOption[];
}) {
  const panelRef = useRef<PanelFormHandle>(null);
  const submitLockRef = useRef(false);
  const [kind, setKind] = useState<OwnerKind>(toOwnerKind(card.kind));
  const { execute, result, isExecuting, reset } = useAction(updateCorpCardOwnerAction, {
    onSuccess: () => panelRef.current?.succeed(),
    onSettled: () => {
      submitLockRef.current = false;
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    const formData = new FormData(event.currentTarget);
    execute({
      id: card.id,
      kind,
      holderUserId: kind === "personal" ? getStringField(formData, "holderUserId") || undefined : undefined,
      teamId: kind === "team" ? getStringField(formData, "teamId") || undefined : undefined,
    });
  }

  const ownerError = result.validationErrors?.holderUserId?._errors?.[0];
  const ownerSelectClass = ownerError ? `${styles.select} ${styles.selectInvalid}` : styles.select;

  return (
    <PanelForm
      ref={panelRef}
      id="corp-card-owner-form"
      label="소유자 변경"
      intent="edit"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={ownerError ?? result.serverError ?? null}
      reasonId="corp-card-owner-form-reason"
    >
      <p className={styles.hint}>{card.label} 소유자 변경</p>

      <div className={styles.field}>
        <Form.Field id="owner-kind" label="종류">
          <select
            id="owner-kind"
            name="kind"
            className={styles.select}
            value={kind}
            onChange={(event) => {
              setKind(toOwnerKind(event.target.value));
              reset();
            }}
          >
            <option value="personal">개인</option>
            <option value="team">팀</option>
            <option value="shared">공용</option>
          </select>
        </Form.Field>
      </div>

      {/* key로 칸을 새로 만든다 — 같은 <select> 노드를 재사용하면 defaultValue가
          다시 적용되지 않아 브라우저가 첫 항목을 골라 버린다. 보관된(퇴사·해체)
          소유자는 후보에 없으므로 같은 이유로 빈 값에서 시작한다. */}
      {kind === "personal" ? (
        <div key="personal" className={styles.field}>
          <Form.Field id="owner-holderUserId" label="소지자">
            <select
              id="owner-holderUserId"
              name="holderUserId"
              className={ownerSelectClass}
              required
              aria-invalid={ownerError ? true : undefined}
              aria-describedby={ownerError ? "owner-error" : undefined}
              defaultValue={holders.some((holder) => holder.id === card.holderUserId) ? (card.holderUserId ?? "") : ""}
            >
              <option value="" disabled>
                소지자 선택
              </option>
              {holders.map((holder) => (
                <option key={holder.id} value={holder.id}>
                  {holder.name}
                </option>
              ))}
            </select>
            {ownerError ? <Form.Error id="owner-error">{ownerError}</Form.Error> : null}
          </Form.Field>
        </div>
      ) : kind === "team" ? (
        <div key="team" className={styles.field}>
          <Form.Field id="owner-teamId" label="팀">
            <select
              id="owner-teamId"
              name="teamId"
              className={ownerSelectClass}
              required
              aria-invalid={ownerError ? true : undefined}
              aria-describedby={ownerError ? "owner-error" : undefined}
              defaultValue={teams.some((team) => team.id === card.teamId) ? (card.teamId ?? "") : ""}
            >
              <option value="" disabled>
                팀 선택
              </option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.orgUnitName} · {team.name}
                </option>
              ))}
            </select>
            {ownerError ? <Form.Error id="owner-error">{ownerError}</Form.Error> : null}
          </Form.Field>
        </div>
      ) : null}
    </PanelForm>
  );
}

// §6-1 목록 행 행동 — 되돌릴 수 있는 상태 변경이라 확인 모달 없음, 즉시 반영. `RowActions` 안 `RowAction`(공용 간격 · 모양).
export function CorpCardActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { execute, isExecuting } = useAction(setCorpCardActiveAction);

  return (
    <RowAction pending={isExecuting} onClick={() => execute({ id, active: !active })}>
      {active ? "비활성화" : "활성화"}
    </RowAction>
  );
}

// 03-07: 「삭제」 — 보관함으로 이동한다.
export function CorpCardDeleteButton({ id, label }: { id: string; label: string }) {
  return (
    <DeleteToArchive
      name={label}
      onArchive={async () => {
        const result = await archiveCorpCardAction({ id });
        if (result?.serverError) throw new Error(result.serverError);
      }}
    />
  );
}
