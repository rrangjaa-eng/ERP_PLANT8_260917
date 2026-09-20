"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { createCorpCardAction, setCorpCardActiveAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
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
export function CardForm({ holders, teams }: { holders: HolderOption[]; teams: TeamOption[] }) {
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
      <Button type="submit" variant="primary" pending={isExecuting}>
        법인카드 등록
      </Button>
    </form>
  );
}

// §6-1 목록 행 3차 버튼 — 되돌릴 수 있는 상태 변경이라 확인 모달 없음, 즉시 반영.
export function CorpCardActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { execute, isExecuting } = useAction(setCorpCardActiveAction);

  return (
    <Button variant="tertiary" pending={isExecuting} onClick={() => execute({ id, active: !active })}>
      {active ? "비활성화" : "활성화"}
    </Button>
  );
}
