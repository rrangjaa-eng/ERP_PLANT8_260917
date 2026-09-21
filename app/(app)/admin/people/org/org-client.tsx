"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import {
  createOrgUnitAction,
  renameOrgUnitAction,
  createTeamAction,
  renameTeamAction,
  archiveOrgUnitAction,
  archiveTeamAction,
} from "../actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import styles from "../people.module.css";

const ORG_HREF = "/admin/people/org";
const NEW_ORG_HREF = `${ORG_HREF}?new=org#org-unit-form`;
const NEW_TEAM_HREF = `${ORG_HREF}?new=team#team-form`;

export type OrgUnitView = { id: string; name: string; archivedAt: Date | null };
export type TeamView = { id: string; orgUnitId: string; name: string; archivedAt: Date | null };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function RenameInput({
  value,
  ariaLabel,
  onSave,
  error,
}: {
  value: string;
  ariaLabel: string;
  onSave: (name: string) => void;
  error?: string;
}) {
  const [name, setName] = useState(value);
  return (
    <>
      <input
        className={styles.select}
        aria-label={ariaLabel}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() && name !== value) onSave(name);
        }}
      />
      {error ? <p className={styles.registeredHint}>{error}</p> : null}
    </>
  );
}

function TeamRow({ team, canArchive }: { team: TeamView; canArchive: boolean }) {
  const { execute, result } = useAction(renameTeamAction);
  return (
    <li>
      <RenameInput
        value={team.name}
        ariaLabel={`${team.name} 이름`}
        onSave={(name) => execute({ id: team.id, name })}
        error={result.serverError}
      />
      {team.archivedAt ? (
        <StatusTag kind="muted" variant="text">
          보관됨
        </StatusTag>
      ) : canArchive ? (
        <DeleteToArchive
          name={team.name}
          onArchive={async () => {
            const archiveResult = await archiveTeamAction({ id: team.id });
            if (archiveResult?.serverError) throw new Error(archiveResult.serverError);
          }}
        />
      ) : null}
    </li>
  );
}

function OrgUnitRow({
  orgUnit,
  teams,
  canArchive,
}: {
  orgUnit: OrgUnitView;
  teams: TeamView[];
  canArchive: boolean;
}) {
  const { execute, result } = useAction(renameOrgUnitAction);
  return (
    <li>
      <RenameInput
        value={orgUnit.name}
        ariaLabel={`${orgUnit.name} 이름`}
        onSave={(name) => execute({ id: orgUnit.id, name })}
        error={result.serverError}
      />
      {orgUnit.archivedAt ? (
        <StatusTag kind="muted" variant="text">
          보관됨
        </StatusTag>
      ) : canArchive ? (
        <DeleteToArchive
          name={orgUnit.name}
          onArchive={async () => {
            const archiveResult = await archiveOrgUnitAction({ id: orgUnit.id });
            if (archiveResult?.serverError) throw new Error(archiveResult.serverError);
          }}
        />
      ) : null}
      <ul>
        {teams
          .filter((team) => team.orgUnitId === orgUnit.id)
          .map((team) => (
            <TeamRow key={team.id} team={team} canArchive={canArchive} />
          ))}
      </ul>
    </li>
  );
}

// §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 폼은 ?new=org·
// ?new=team일 때만, 그것도 한 번에 하나만 렌더한다(design-review A-H1).
// 두 폼이 상시 렌더되던 때는 1차 버튼이 한 화면에 둘이었다(§7-1은 1개).
export function OrgClient({
  orgUnits,
  teams,
  canArchive,
  newForm,
}: {
  orgUnits: OrgUnitView[];
  teams: TeamView[];
  canArchive: boolean;
  newForm: "org" | "team" | null;
}) {
  const orgFormRef = useRef<HTMLFormElement>(null);
  const teamFormRef = useRef<HTMLFormElement>(null);

  const { execute: executeCreateOrgUnit, result: orgResult, isExecuting: creatingOrgUnit } = useAction(
    createOrgUnitAction,
    { onSuccess: () => orgFormRef.current?.reset() },
  );
  const { execute: executeCreateTeam, result: teamResult, isExecuting: creatingTeam } = useAction(createTeamAction, {
    onSuccess: () => teamFormRef.current?.reset(),
  });

  function handleOrgSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    executeCreateOrgUnit({ name: getStringField(formData, "name") });
  }

  function handleTeamSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    executeCreateTeam({
      orgUnitId: getStringField(formData, "orgUnitId"),
      name: getStringField(formData, "name"),
    });
  }

  return (
    <>
      {newForm === "org" ? (
        <form ref={orgFormRef} onSubmit={handleOrgSubmit} id="org-unit-form">
          <TextField
            id="org-unit-name"
            name="name"
            label="이름"
            required
            error={orgResult.validationErrors?.name?._errors?.[0]}
          />
          {orgResult.serverError ? <FormAlert>{orgResult.serverError}</FormAlert> : null}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" pending={creatingOrgUnit}>
              본부 추가
            </Button>
            <Link href={ORG_HREF} className={styles.toggle}>
              취소
            </Link>
          </div>
        </form>
      ) : null}

      {newForm === "team" ? (
        <form ref={teamFormRef} onSubmit={handleTeamSubmit} id="team-form">
          <div className={styles.selectLabel}>
            <label htmlFor="team-org-unit-id">본부</label>
            <select className={styles.select} id="team-org-unit-id" name="orgUnitId" required defaultValue="">
              <option value="" disabled>
                본부 선택
              </option>
              {orgUnits.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <TextField
            id="team-name"
            name="name"
            label="이름"
            required
            error={teamResult.validationErrors?.name?._errors?.[0]}
          />
          {teamResult.serverError ? <FormAlert>{teamResult.serverError}</FormAlert> : null}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" pending={creatingTeam}>
              팀 추가
            </Button>
            <Link href={ORG_HREF} className={styles.toggle}>
              취소
            </Link>
          </div>
        </form>
      ) : null}

      {/* 폼이 열려 있으면 그 폼의 「취소」가 같은 역할을 하므로 이 줄은 없다.
          목록이 비었을 때 「본부 추가」는 §7-7 EMPTY가 보이므로 여기서 빼고,
          「팀 추가」는 본부가 없으면 만들 수 없어 함께 빠진다. */}
      {newForm === null && orgUnits.length > 0 ? (
        <div className={styles.filterRow}>
          <Link href={NEW_ORG_HREF} className={styles.toggle}>
            본부 추가
          </Link>
          <Link href={NEW_TEAM_HREF} className={styles.toggle}>
            팀 추가
          </Link>
        </div>
      ) : null}

      {orgUnits.length === 0 ? (
        <ListEmpty message="등록된 본부가 없습니다" action={{ label: "본부 추가", href: NEW_ORG_HREF }} />
      ) : (
        <ul>
          {orgUnits.map((org) => (
            <OrgUnitRow key={org.id} orgUnit={org} teams={teams} canArchive={canArchive} />
          ))}
        </ul>
      )}
    </>
  );
}
