"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createProjectAction } from "./actions";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import styles from "./projects.module.css";

export type ProjectFormOption = { id: string; name: string };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// SYSTEM.md §7-15 — 프로젝트 등록 폼. 필수 넷(클라이언트·프로젝트명·담당
// PM·팀), 기간은 선택(D-49). 상태·번호는 폼에 없다 — 등록은 항상
// 수주중이고 번호는 서버가 매긴다(D-42). `noValidate`는 `Form`이 이미
// 걸고 있어 이 파일 어디에도 `required`/`pattern` 네이티브 검증이 없다.
export function ProjectForm({
  clients,
  teams,
  pmUsers,
  cancelHref,
}: {
  clients: ProjectFormOption[];
  teams: ProjectFormOption[];
  pmUsers: ProjectFormOption[];
  cancelHref: string;
}) {
  const router = useRouter();

  const { execute, result, isExecuting } = useAction(createProjectAction, {
    onSuccess: ({ data }) => {
      if (data?.project) router.push(`/projects/${data.project.id}`);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      clientId: getStringField(formData, "clientId"),
      name: getStringField(formData, "name"),
      pmUserId: getStringField(formData, "pmUserId"),
      teamId: getStringField(formData, "teamId"),
      startDate: getStringField(formData, "startDate") || undefined,
      endDate: getStringField(formData, "endDate") || undefined,
    });
  }

  const clientError = result.validationErrors?.clientId?._errors?.[0];
  const nameError = result.validationErrors?.name?._errors?.[0];
  const pmError = result.validationErrors?.pmUserId?._errors?.[0];
  const teamError = result.validationErrors?.teamId?._errors?.[0];

  // §7-15 검증 관문 — 필수인데 비면 제출 버튼이 이유를 말한다(막힘 자리는
  // 서버 응답 없이도 클라이언트 상태로 계산할 수 있지만, 이 플랜은
  // 서버 오류 문구를 그대로 옆에 붙이는 것으로 같은 계약을 만족한다).
  const blockedReason = [clientError, nameError, pmError, teamError].filter(Boolean)[0];

  return (
    <Form id="project-form" onSubmit={handleSubmit}>
      <Form.Field id="clientId" label="클라이언트" width="select">
        <Select id="clientId" name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name }))} error={clientError} />
      </Form.Field>

      <Form.Field id="name" label="프로젝트명" width="long">
        <input
          id="name"
          name="name"
          type="text"
          className={styles.textInput}
          autoComplete="off"
          aria-describedby={nameError ? "name-error" : undefined}
        />
        {nameError ? <Form.Error id="name-error">{nameError}</Form.Error> : null}
      </Form.Field>

      <Form.Field id="pmUserId" label="담당 PM" width="select">
        <Select id="pmUserId" name="pmUserId" options={pmUsers.map((u) => ({ value: u.id, label: u.name }))} error={pmError} />
      </Form.Field>

      <Form.Field id="teamId" label="팀" width="select">
        <Select id="teamId" name="teamId" options={teams.map((t) => ({ value: t.id, label: t.name }))} error={teamError} />
      </Form.Field>

      <Form.Field id="startDate" label="시작일" width="short">
        <input id="startDate" name="startDate" type="date" className={styles.textInput} />
      </Form.Field>

      <Form.Field id="endDate" label="종료일" width="short">
        <input id="endDate" name="endDate" type="date" className={styles.textInput} />
      </Form.Field>

      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}

      <Form.Actions>
        <Button type="submit" variant="primary" pending={isExecuting} shortcut="⌘↵">
          프로젝트 등록
        </Button>
        {blockedReason ? <span className={styles.blockedReason}>{blockedReason}</span> : null}
        <a href={cancelHref} className={styles.toggle}>
          취소 Esc
        </a>
      </Form.Actions>
    </Form>
  );
}
