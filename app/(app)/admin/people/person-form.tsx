"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { registerPersonAction, archivePersonAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import styles from "./people.module.css";

export type RoleOption = { id: string; name: string };
export type TeamOption = { id: string; name: string; orgUnitName: string };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// SYSTEM.md §6-3 폼 템플릿(D-39) — 목록 위에 펼치는 폼. 성공 시 초기 비밀번호를
// 그 자리에 한 번 보여준다(T-03-29) — 클라이언트 상태에만 담고 URL·로컬
// 저장소에 넣지 않는다.
// §6-1(2026-09-21 이후): page.tsx가 ?new=1일 때만 이 폼을 렌더한다 — 기본
// 진입에는 없다. cancelHref는 그 쿼리를 뺀 같은 화면으로 돌아간다.
export function PersonForm({
  roles,
  teams,
  cancelHref,
}: {
  roles: RoleOption[];
  teams: TeamOption[];
  cancelHref: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [registered, setRegistered] = useState<{ email: string; tempPassword: string } | null>(null);
  const { execute, result, isExecuting } = useAction(registerPersonAction, {
    onSuccess: ({ data, input }) => {
      if (!data) return;
      setRegistered({ email: input.email, tempPassword: data.tempPassword });
      formRef.current?.reset();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegistered(null);
    const formData = new FormData(event.currentTarget);
    const teamId = getStringField(formData, "teamId");
    execute({
      name: getStringField(formData, "name"),
      email: getStringField(formData, "email"),
      roleId: getStringField(formData, "roleId"),
      teamId: teamId || undefined,
      effectiveFrom: teamId ? getStringField(formData, "effectiveFrom") : undefined,
    });
  }

  if (registered) {
    return (
      <div className={styles.registeredPanel}>
        <p className={styles.registeredLabel}>초기 비밀번호 — {registered.email}</p>
        <p className={styles.tempPassword}>{registered.tempPassword}</p>
        <p className={styles.registeredHint}>이 비밀번호는 다시 볼 수 없습니다 · 지금 전달하세요</p>
        <Button variant="tertiary" onClick={() => setRegistered(null)}>
          사람 등록
        </Button>
      </div>
    );
  }

  const nameError = result.validationErrors?.name?._errors?.[0];
  const emailError = result.validationErrors?.email?._errors?.[0];

  return (
    <form ref={formRef} onSubmit={handleSubmit} id="person-form">
      <TextField id="name" name="name" label="이름" required error={nameError} />
      <TextField id="email" name="email" label="이메일" type="email" required error={emailError} />
      <div className={styles.selectLabel}>
        <label htmlFor="roleId">계급</label>
        <select className={styles.select} id="roleId" name="roleId" required defaultValue="">
          <option value="" disabled>
            계급 선택
          </option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.selectLabel}>
        <label htmlFor="teamId">팀</label>
        <select className={styles.select} id="teamId" name="teamId" defaultValue="">
          <option value="">배정 없음</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.orgUnitName} · {team.name}
            </option>
          ))}
        </select>
      </div>
      <TextField id="effectiveFrom" name="effectiveFrom" label="발령일" type="date" />
      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" pending={isExecuting}>
          사람 등록
        </Button>
        <Link href={cancelHref} className={styles.toggle}>
          취소
        </Link>
      </div>
    </form>
  );
}

// 03-07: 「삭제」 — 보관함으로 이동 + 세션 만료(domain/people.archivePerson)를
// 부른다.
export function PersonDeleteButton({ userId, name }: { userId: string; name: string }) {
  return (
    <DeleteToArchive
      name={name}
      onArchive={async () => {
        const result = await archivePersonAction({ userId });
        if (result?.serverError) throw new Error(result.serverError);
      }}
    />
  );
}
