"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import {
  createCorpCardAction,
  updateCorpCardOwnerAction,
  setCorpCardActiveAction,
  archiveCorpCardAction,
} from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import styles from "./corp-cards.module.css";

export type HolderOption = { id: string; name: string };
export type TeamOption = { id: string; name: string; orgUnitName: string };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// SYSTEM.md §6-3 폼 템플릿(D-39). 전체 번호(카드 앞 12자리 포함) 입력 칸을
// 만들지 않는다(Task 1이 그 컬럼을 두지 않기로 했다 — 입력 칸만 있는 것은
// 저장된다는 오해를 준다). 종류에 따라 소유 선택 상자 하나만 보인다.
// §6-1(2026-09-21 이후): page.tsx가 ?new=1일 때만 이 폼을 렌더한다 — 기본
// 진입에는 없다. cancelHref는 그 쿼리를 뺀 같은 화면으로 돌아간다.
export function CardForm({
  holders,
  teams,
  cancelHref,
}: {
  holders: HolderOption[];
  teams: TeamOption[];
  cancelHref: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"personal" | "team">("personal");
  const { execute, result, isExecuting } = useAction(createCorpCardAction, {
    onSuccess: () => formRef.current?.reset(),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      issuer: getStringField(formData, "issuer"),
      numberLast4: getStringField(formData, "numberLast4"),
      label: getStringField(formData, "label"),
      holderUserId: kind === "personal" ? getStringField(formData, "holderUserId") || undefined : undefined,
      teamId: kind === "team" ? getStringField(formData, "teamId") || undefined : undefined,
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} id="corp-card-form">
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

      <div className={styles.selectLabel}>
        <label htmlFor="card-kind">종류</label>
        <select
          id="card-kind"
          className={styles.select}
          value={kind}
          onChange={(event) => setKind(event.target.value === "team" ? "team" : "personal")}
        >
          <option value="personal">개인</option>
          <option value="team">팀</option>
        </select>
      </div>

      {kind === "personal" ? (
        <div className={styles.selectLabel}>
          <label htmlFor="holderUserId">소지자</label>
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
        </div>
      ) : (
        <div className={styles.selectLabel}>
          <label htmlFor="teamId">팀</label>
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
        </div>
      )}

      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" pending={isExecuting}>
          법인카드 등록
        </Button>
        <Link href={cancelHref} className={styles.toggle}>
          취소
        </Link>
      </div>
    </form>
  );
}

// §6-1 목록 행 3차 버튼 — 되돌릴 수 있는 상태 변경이라 확인 모달 없음, 즉시 반영.
// 성공 기준 5 「수정」 — 거래처의 ?editId= 토글과 같은 결. 바꾸는 것은
// 소유자(개인 소지자 또는 팀)뿐이다: 발급사·뒤 4자리는 카드의 식별자라
// 바꾸는 것이 아니라 새로 등록하는 일이고, 별칭 수정은 요구사항 밖이다.
// 보관된 카드는 domain/corp-cards가 ArchivedCorpCardError로 거부한다 —
// 목록이 링크를 감추는 것은 두 겹 중 바깥쪽일 뿐이다.
export function CardOwnerForm({
  card,
  holders,
  teams,
  cancelHref,
}: {
  card: { id: string; label: string; kind: string; holderUserId: string | null; teamId: string | null };
  holders: HolderOption[];
  teams: TeamOption[];
  cancelHref: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"personal" | "team">(card.kind === "team" ? "team" : "personal");
  const { execute, result, isExecuting } = useAction(updateCorpCardOwnerAction, {
    // 거래처(vendor-form.tsx)와 같은 결 — 수정이 끝나면 목록으로 돌아가
    // 수정 모드를 나간다. 뒤로가기가 수정 모드로 되돌아가지 않도록 replace.
    onSuccess: () => router.replace(cancelHref),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      id: card.id,
      holderUserId: kind === "personal" ? getStringField(formData, "holderUserId") || undefined : undefined,
      teamId: kind === "team" ? getStringField(formData, "teamId") || undefined : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} id="corp-card-owner-form">
      <p className={styles.hint}>{card.label} 소유자 변경</p>

      <div className={styles.selectLabel}>
        <label htmlFor="owner-kind">종류</label>
        <select
          id="owner-kind"
          className={styles.select}
          value={kind}
          onChange={(event) => setKind(event.target.value === "team" ? "team" : "personal")}
        >
          <option value="personal">개인</option>
          <option value="team">팀</option>
        </select>
      </div>

      {kind === "personal" ? (
        <div className={styles.selectLabel}>
          <label htmlFor="owner-holderUserId">소지자</label>
          <select
            id="owner-holderUserId"
            name="holderUserId"
            className={styles.select}
            required
            defaultValue={card.holderUserId ?? ""}
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
        </div>
      ) : (
        <div className={styles.selectLabel}>
          <label htmlFor="owner-teamId">팀</label>
          <select
            id="owner-teamId"
            name="teamId"
            className={styles.select}
            required
            defaultValue={card.teamId ?? ""}
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
        </div>
      )}

      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" pending={isExecuting}>
          소유자 변경
        </Button>
        <Link href={cancelHref} className={styles.toggle}>
          취소
        </Link>
      </div>
    </form>
  );
}

export function CorpCardActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { execute, isExecuting } = useAction(setCorpCardActiveAction);

  return (
    <Button variant="tertiary" pending={isExecuting} onClick={() => execute({ id, active: !active })}>
      {active ? "비활성화" : "활성화"}
    </Button>
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
