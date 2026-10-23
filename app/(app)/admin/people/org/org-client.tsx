"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { ArchiveRejectedError, DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import type { SeatDuplicatesDto } from "@/domain/people/seat-rules";
import type { OrgMemberCounts } from "@/domain/org";
import styles from "../people.module.css";

export const NEW_TEAM_BASE_HREF = "/admin/people/org?new=team";

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

// 07-21(R10 · SC-13 · K14): 사람이 남은 팀 · 본부의 `삭제`는 비활성 + 같은 줄 이유(`{N}명`은 사람 목록 필터 링크) — 창을 열지 않는다.
// 0명이면 기존 두 단계 `삭제`(성공 결과는 그 줄이 빠지거나 `보관됨` — 토스트 없음 · N4). 경합 거부는 서버 문구가 실패 줄에 실린다.
function OrgArchiveAction({
  name,
  memberCount,
  membersHref,
  onArchive,
}: {
  name: string;
  memberCount: number;
  membersHref: string;
  onArchive: () => Promise<{ serverError?: string } | undefined>;
}) {
  if (memberCount > 0) {
    return (
      <RowAction
        danger
        disabled
        reasonTone="info"
        disabledReason={
          <>
            {"소속 "}
            <Link href={membersHref}>{`${memberCount}명`}</Link>
            {" · 먼저 옮기기"}
          </>
        }
        onClick={() => {}}
      >
        삭제
      </RowAction>
    );
  }
  return (
    <DeleteToArchive
      name={name}
      onArchive={async () => {
        const result = await onArchive();
        if (result?.serverError) throw new ArchiveRejectedError(result.serverError);
      }}
    />
  );
}

// SYSTEM §7-19 폰 줄 안 「더보기」(DECISIONS 2026-10-13): 중복 줄은 폰(<700)에서 태그 + 「더보기」 한 줄로 접고, 펼치면 행동 전부.
// PC · 태블릿은 지금처럼 태그 뒤에 행동이 바로 있다.
function DuplicateRowActions({ name, tag, children }: { name: string; tag: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className={styles.wideOnly}>
        <RowActions>
          {tag}
          {children}
        </RowActions>
      </span>
      <div className={styles.phoneOnly}>
        {tag}
        <details className={styles.rowMore}>
          <summary className={styles.rowMoreSummary} aria-label={`${name} 더보기`}>
            더보기
          </summary>
          <RowActions>{children}</RowActions>
        </details>
      </div>
    </>
  );
}

function TeamRow({
  team,
  canArchive,
  duplicates,
  memberCount,
}: {
  team: TeamView;
  canArchive: boolean;
  duplicates?: SeatDuplicatesDto;
  memberCount: number;
}) {
  const { execute, result } = useAction(renameTeamAction);
  const holders = duplicates?.teams[team.id];
  const archive = canArchive ? (
    <OrgArchiveAction
      name={team.name}
      memberCount={memberCount}
      membersHref={`/admin/people?team=${team.id}`}
      onArchive={() => archiveTeamAction({ id: team.id })}
    />
  ) : null;
  return (
    <li>
      <RenameInput
        value={team.name}
        ariaLabel={`${team.name} 이름`}
        onSave={(name) => execute({ id: team.id, name })}
        error={result.serverError}
      />
      {team.archivedAt ? (
        <StatusTag status="보관됨" variant="text" />
      ) : holders ? (
        // 06.4(D-6413 · D2): 중복 태그와 보유자 이름은 행동 줄 첫 자리 — 이름을 누르면 그 사람 상세(계급을 바꾸는 곳)
        <DuplicateRowActions name={team.name} tag={<StatusTag status={`팀장 ${holders.length}명`} variant="text" />}>
          {holders.map((holder) => (
            <RowAction key={holder.userId} href={`/admin/people/${holder.userId}`}>
              {holder.name}
            </RowAction>
          ))}
          {archive}
        </DuplicateRowActions>
      ) : canArchive ? (
        <RowActions>{archive}</RowActions>
      ) : null}
    </li>
  );
}

function OrgUnitRow({
  orgUnit,
  teams,
  canArchive,
  canWrite,
  duplicates,
  memberCounts,
}: {
  orgUnit: OrgUnitView;
  teams: TeamView[];
  canArchive: boolean;
  canWrite: boolean;
  duplicates?: SeatDuplicatesDto;
  memberCounts: OrgMemberCounts;
}) {
  const { execute, result } = useAction(renameOrgUnitAction);
  const holders = duplicates?.orgUnits[orgUnit.id];
  const actions = (
    <>
      {canWrite ? <RowAction href={`${NEW_TEAM_BASE_HREF}&orgUnitId=${orgUnit.id}`}>팀 추가</RowAction> : null}
      {canArchive ? (
        <OrgArchiveAction
          name={orgUnit.name}
          memberCount={memberCounts.orgUnits[orgUnit.id] ?? 0}
          membersHref={`/admin/people?org=${orgUnit.id}`}
          onArchive={() => archiveOrgUnitAction({ id: orgUnit.id })}
        />
      ) : null}
    </>
  );
  return (
    <li>
      <RenameInput
        value={orgUnit.name}
        ariaLabel={`${orgUnit.name} 이름`}
        onSave={(name) => execute({ id: orgUnit.id, name })}
        error={result.serverError}
      />
      {orgUnit.archivedAt ? (
        <StatusTag status="보관됨" variant="text" />
      ) : holders || canWrite || canArchive ? (
        // DR3 B — 「팀 추가」는 보관되지 않은 본부 행마다 있는 행동 링크다(그 본부가 미리 골라진 팀 패널).
        // 06.4(D-6413 · D2): 책임자 중복 태그 · 보유자 이름이 그 앞 첫 자리.
        holders ? (
          <DuplicateRowActions name={orgUnit.name} tag={<StatusTag status={`책임자 ${holders.length}명`} variant="text" />}>
            {holders.map((holder) => (
              <RowAction key={holder.userId} href={`/admin/people/${holder.userId}`}>
                {holder.name}
              </RowAction>
            ))}
            {actions}
          </DuplicateRowActions>
        ) : (
          <RowActions>{actions}</RowActions>
        )
      ) : null}
      <ul>
        {teams
          .filter((team) => team.orgUnitId === orgUnit.id)
          .map((team) => (
            <TeamRow
              key={team.id}
              team={team}
              canArchive={canArchive}
              duplicates={duplicates}
              memberCount={memberCounts.teams[team.id] ?? 0}
            />
          ))}
      </ul>
    </li>
  );
}


// 목록 — 본부 행마다 본부 · 팀 이름 변경과 행동(「팀 추가」 · 「삭제」).
export function OrgList({
  orgUnits,
  teams,
  canArchive,
  canWrite,
  duplicates,
  memberCounts,
}: {
  orgUnits: OrgUnitView[];
  teams: TeamView[];
  canArchive: boolean;
  canWrite: boolean;
  duplicates?: SeatDuplicatesDto;
  memberCounts: OrgMemberCounts;
}) {
  return (
    <ul className={`single-column ${styles.orgList}`}>
      {orgUnits.map((org) => (
        <OrgUnitRow
          key={org.id}
          orgUnit={org}
          teams={teams}
          canArchive={canArchive}
          canWrite={canWrite}
          duplicates={duplicates}
          memberCounts={memberCounts}
        />
      ))}
    </ul>
  );
}

// §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 폼은 page.tsx가 ?new=org·?new=team일 때만,
// 그것도 한 번에 하나만 옆 패널로 렌더한다(design-review A-H1). 성공 뒤(UQ-8 B)는 `PanelForm`이 칸을 비우고 첫 칸에 포커스를 준다.
export function OrgUnitForm() {
  const panelRef = useRef<PanelFormHandle>(null);
  const { execute, result, isExecuting } = useAction(createOrgUnitAction, {
    onSuccess: () => panelRef.current?.succeed({ status: "본부 추가됨" }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({ name: getStringField(formData, "name") });
  }

  return (
    <PanelForm
      ref={panelRef}
      id="org-unit-form"
      label="본부 추가"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={result.serverError ?? null}
    >
      <TextField
        id="org-unit-name"
        name="name"
        label="이름"
        required
        error={result.validationErrors?.name?._errors?.[0]}
      />
    </PanelForm>
  );
}

// DR3 B — `defaultOrgUnitId`는 서버가 보관되지 않은 본부와 맞춰 본 값만 온다(없거나 모르면 빈 값 「본부 선택」).
export function TeamForm({ orgUnits, defaultOrgUnitId }: { orgUnits: OrgUnitView[]; defaultOrgUnitId: string }) {
  const panelRef = useRef<PanelFormHandle>(null);
  const { execute, result, isExecuting } = useAction(createTeamAction, {
    onSuccess: () => panelRef.current?.succeed({ status: "팀 추가됨" }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      orgUnitId: getStringField(formData, "orgUnitId"),
      name: getStringField(formData, "name"),
    });
  }

  const orgUnitError = result.validationErrors?.orgUnitId?._errors?.[0];

  return (
    <PanelForm
      ref={panelRef}
      id="team-form"
      label="팀 추가"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={orgUnitError ?? result.serverError ?? null}
    >
      {/* 07-21(N10 · SC-15): 본부 고르기는 공용 `Select` — 오류 id 규칙(`${id}-error`)이 이전 `Form.Error` id와 같다. */}
      <div className={styles.panelField}>
        <Form.Field id="team-org-unit-id" label="본부">
          <Select
            id="team-org-unit-id"
            name="orgUnitId"
            required
            hideEmptyOption
            defaultValue={defaultOrgUnitId}
            options={[{ value: "", label: "본부 선택" }, ...orgUnits.map((org) => ({ value: org.id, label: org.name }))]}
            error={orgUnitError}
          />
        </Form.Field>
      </div>
      <TextField
        id="team-name"
        name="name"
        label="이름"
        required
        error={result.validationErrors?.name?._errors?.[0]}
      />
    </PanelForm>
  );
}
