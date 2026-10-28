"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { registerPersonAction, archivePersonAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import { focusFirstInvalid } from "@/ui/form/focus-first-invalid";
import { Select } from "@/ui/select/Select";
import { kstToday } from "@/lib/kst-date";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { usePanel } from "@/ui/side-panel/SidePanel";
import { ArchiveRejectedError, DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
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
export function PersonForm({
  roles,
  teams,
  noRoleReason,
}: {
  roles: RoleOption[];
  teams: TeamOption[];
  noRoleReason?: string | null;
}) {
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

  // 서버 검증 오류가 돌아오면 포커스를 오류 난 첫 칸으로(07.1-02 S2 — 카드 폼과 같은 꼴). 클라이언트 검증이 없어 제출 처리기 안에서는 부르지 않는다.
  useEffect(() => {
    if (result.validationErrors !== undefined) focusFirstInvalid("person-form");
  }, [result]);

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
  const effectiveFromError = result.validationErrors?.effectiveFrom?._errors?.[0];
  const roleError = result.validationErrors?.roleId?._errors?.[0];

  return (
    <PanelForm
      ref={panelRef}
      id="person-form"
      label="사람 등록"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={roleError ?? result.serverError ?? null}
      blockedReason={noRoleReason ?? undefined}
    >
      <TextField id="name" name="name" label="이름" required error={nameError} />
      <TextField id="email" name="email" label="이메일" type="email" required error={emailError} />
      {/* 07-17 N10(SC-15): 계급 · 팀은 공용 Select — 라벨 · 오류 줄은 Form.Field · Select 것(항목 · 순서 그대로). */}
      <div className={styles.panelField}>
        <Form.Field id="roleId" label="계급">
          <Select
            id="roleId"
            name="roleId"
            required
            hideEmptyOption
            // 06.4(D-6402 · D8 · D9): 선택지는 서버가 계산한 통과 계급만 — 숨김은 UX, 서버 거부가 관문. 없으면 막힘 이유, 하나면 미리 선택
            defaultValue={roles.length === 1 ? roles[0]?.id : ""}
            error={roleError}
            options={[
              { value: "", label: roles.length === 0 ? "—" : "계급 선택" },
              ...roles.map((role) => ({ value: role.id, label: role.name })),
            ]}
          />
        </Form.Field>
      </div>
      <div className={styles.panelField}>
        <Form.Field id="teamId" label="팀">
          <Select
            id="teamId"
            name="teamId"
            hideEmptyOption
            defaultValue=""
            options={[
              { value: "", label: "배정 없음" },
              ...teams.map((team) => ({ value: team.id, label: `${team.orgUnitName} · ${team.name}` })),
            ]}
            // 사용자 카드 2026-10-13 「오늘로 채우기」: 팀을 고르면 비어 있는 발령일만 오늘(KST)로 채운다 — 입력한 날짜는 덮지 않는다.
            onChange={(event) => {
              const effectiveFrom = event.currentTarget.form?.elements.namedItem("effectiveFrom");
              if (event.currentTarget.value && effectiveFrom instanceof HTMLInputElement && !effectiveFrom.value) {
                effectiveFrom.value = kstToday(new Date());
              }
            }}
          />
        </Form.Field>
      </div>
      <TextField id="effectiveFrom" name="effectiveFrom" label="발령일" type="date" error={effectiveFromError} />
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
        if (result?.serverError) throw new ArchiveRejectedError(result.serverError);
      }}
    />
  );
}
