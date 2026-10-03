"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { registerPersonAction, archivePersonAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { usePanel } from "@/ui/side-panel/SidePanel";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import styles from "./people.module.css";

export type RoleOption = { id: string; name: string };
export type TeamOption = { id: string; name: string; orgUnitName: string };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// SYSTEM.md §6-3 폼 템플릿(D-39) — 옆 패널 안 폼(04.6-04: `SidePanel` 안 `PanelForm`). 성공 시 초기 비밀번호를
// 패널 안 그 자리에 한 번 보여준다(T-03-29) — 클라이언트 상태에만 담고 URL·로컬 저장소에 넣지 않는다.
// 사용자 답 Q3 A 「패널에 남음」(R9 D의 예외): 사람 상세로 이동하지 않고 결과의 「사람 등록」으로 같은 패널에서 이어서 입력한다.
// §6-1: page.tsx가 ?new=1일 때만 이 패널을 렌더한다 — 기본 진입에는 없다.
export function PersonForm({ roles, teams }: { roles: RoleOption[]; teams: TeamOption[] }) {
  const panel = usePanel();
  const panelRef = useRef<PanelFormHandle>(null);
  const continueRef = useRef(false);
  const [registered, setRegistered] = useState<{ email: string; tempPassword: string } | null>(null);
  const { execute, result, isExecuting } = useAction(registerPersonAction, {
    onSuccess: ({ data, input }) => {
      if (!data) return;
      // 칸 비움 · 바뀐 칸 수 0 — 결과 화면에서 Esc가 「입력 버리기」를 묻지 않는다.
      panelRef.current?.succeed();
      setRegistered({ email: input.email, tempPassword: data.tempPassword });
    },
  });

  // 결과 화면은 폼(PanelForm)을 내리므로 그 폼이 마지막으로 알린 닫기 가드(제출 중)를 여기서 푼다.
  useEffect(() => {
    if (!registered) return;
    panel?.setGuard({ dirtyCount: 0, submitting: false });
  }, [registered, panel]);

  // 「사람 등록」으로 이어서 입력 — 빈 폼의 첫 칸으로 포커스.
  useEffect(() => {
    if (registered || !continueRef.current) return;
    continueRef.current = false;
    document.getElementById("name")?.focus();
  }, [registered]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const teamId = getStringField(formData, "teamId");
    execute({
      name: getStringField(formData, "name"),
      email: getStringField(formData, "email"),
      roleId: getStringField(formData, "roleId"),
      teamId: teamId || undefined,
      effectiveFrom: teamId ? getStringField(formData, "effectiveFrom") : undefined,
      hireDate: getStringField(formData, "hireDate"),
    });
  }

  if (registered) {
    return (
      <div className={styles.registeredPanel}>
        <p className={styles.registeredLabel}>초기 비밀번호 — {registered.email}</p>
        <p className={styles.tempPassword}>{registered.tempPassword}</p>
        <p className={styles.registeredHint}>이 비밀번호는 다시 볼 수 없습니다 · 지금 전달하세요</p>
        <Button
          autoFocus
          variant="tertiary"
          onClick={() => {
            continueRef.current = true;
            setRegistered(null);
          }}
        >
          사람 등록
        </Button>
      </div>
    );
  }

  const nameError = result.validationErrors?.name?._errors?.[0];
  const emailError = result.validationErrors?.email?._errors?.[0];
  const hireDateError = result.validationErrors?.hireDate?._errors?.[0];

  return (
    <PanelForm
      ref={panelRef}
      id="person-form"
      label="사람 등록"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={result.serverError ?? null}
    >
      <TextField id="name" name="name" label="이름" required error={nameError} />
      <TextField id="email" name="email" label="이메일" type="email" required error={emailError} />
      <div className={styles.panelSelect}>
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
      <div className={styles.panelSelect}>
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
      {/* 04.1-06(D-96): 입사일 필수 — 네이티브 필수 속성은 두지 않는다(브라우저 말풍선이 서버 문구를 가린다, §7-15 · C-13). */}
      <TextField id="hireDate" name="hireDate" label="입사일" type="date" error={hireDateError} />
    </PanelForm>
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
