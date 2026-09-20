import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import {
  listCorpCards as repoListCorpCards,
  insertCorpCard as repoInsertCorpCard,
  updateCorpCardOwner as repoUpdateCorpCardOwner,
  setCorpCardActive as repoSetCorpCardActive,
  findCorpCardById as repoFindCorpCardById,
  type CorpCardRow,
} from "@/repositories/corp-cards";

export class ForbiddenError extends Error {}
export class InvalidCardOwnerError extends Error {}

const CARDS_MENU = "admin.corp-cards";

// MAST-03: "소지자 또는 팀 정확히 하나" — 순수·동기 판정 함수. DB 없이 돈다
// (domain/system-status/index.ts의 connectionBanner와 같은 결).
export type CardOwnerInput = { holderUserId?: string | null; teamId?: string | null };
export type CardOwnerKind = "personal" | "team";

export function cardOwnerKind(input: CardOwnerInput): CardOwnerKind {
  const hasHolder = Boolean(input.holderUserId);
  const hasTeam = Boolean(input.teamId);
  if (hasHolder === hasTeam) {
    throw new InvalidCardOwnerError("법인카드는 소지자 또는 팀 중 정확히 하나를 가져야 합니다.");
  }
  return hasHolder ? "personal" : "team";
}

export type CorpCardDto = {
  id: string;
  issuer: string;
  numberLast4: string;
  label: string;
  kind: string;
  holderUserId: string | null;
  teamId: string | null;
  active: boolean;
  archivedAt: Date | null;
};

export const CORP_CARD_DTO_SPEC: DtoSpec<CorpCardRow, CorpCardDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "corp_card.value" },
    { key: "issuer", from: "issuer", infoItem: "corp_card.value" },
    { key: "numberLast4", from: "numberLast4", infoItem: "corp_card.value" },
    { key: "label", from: "label", infoItem: "corp_card.value" },
    { key: "kind", from: "kind", infoItem: "corp_card.value" },
    { key: "holderUserId", from: "holderUserId", infoItem: "corp_card.value" },
    { key: "teamId", from: "teamId", infoItem: "corp_card.value" },
    { key: "active", from: "active", infoItem: "corp_card.value" },
    { key: "archivedAt", from: "archivedAt", infoItem: "corp_card.value" },
  ],
};

registerDto({
  name: "CorpCardDto",
  fields: CORP_CARD_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export async function listCorpCards(
  viewer: Viewer,
  opts?: { includeInactive?: boolean },
): Promise<CorpCardDto[]> {
  const scope = await scopeFor(viewer, "corp_card");
  const rows = await repoListCorpCards(viewer, { scope, includeInactive: opts?.includeInactive ?? false });
  return Promise.all(rows.map((row) => project(viewer, row, CORP_CARD_DTO_SPEC))) as Promise<CorpCardDto[]>;
}

export type CorpCardWriteDeps = { can: typeof defaultCan; recordAction: typeof defaultRecordAction };

export async function createCorpCard(
  viewer: Viewer,
  input: {
    issuer: string;
    numberLast4: string;
    label: string;
    holderUserId?: string | null;
    teamId?: string | null;
  },
  deps?: Partial<CorpCardWriteDeps>,
): Promise<CorpCardDto> {
  const kind = cardOwnerKind(input);

  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, CARDS_MENU, "write"))) {
    throw new ForbiddenError("법인카드 등록 권한이 없습니다.");
  }

  const row = await repoInsertCorpCard(viewer, { ...input, kind });
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "corp_card", entityId: row.id });

  return (await project(viewer, row, CORP_CARD_DTO_SPEC)) as CorpCardDto;
}

// 소유자 변경 — cardOwnerKind로 새 조합을 먼저 검증하고, 리포지토리는 반대
// 칸을 같은 UPDATE 문에서 비운다(T-03-33).
export async function updateCorpCardOwner(
  viewer: Viewer,
  id: string,
  owner: { holderUserId?: string | null; teamId?: string | null },
  deps?: Partial<CorpCardWriteDeps>,
): Promise<void> {
  cardOwnerKind(owner);

  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, CARDS_MENU, "write"))) {
    throw new ForbiddenError("법인카드 소유자 변경 권한이 없습니다.");
  }

  await repoUpdateCorpCardOwner(viewer, id, {
    holderUserId: owner.holderUserId ?? null,
    teamId: owner.teamId ?? null,
  });

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "corp_card", entityId: id });
}

// 활성 상태 토글은 코드표의 setCodeItemActive와 같은 결 — 값이 같으면
// DB 쓰기를 건너뛰고(멱등), OPS-05 핵심 행동 종류에 단순 토글에 대응하는
// 항목이 없어 recordAction을 부르지 않는다.
export async function setCorpCardActive(
  viewer: Viewer,
  id: string,
  active: boolean,
  deps?: Partial<Pick<CorpCardWriteDeps, "can">>,
): Promise<CorpCardDto | null> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, CARDS_MENU, "write"))) {
    throw new ForbiddenError("법인카드 상태 변경 권한이 없습니다.");
  }

  const current = await repoFindCorpCardById(viewer, id);
  if (!current) return null;

  if (current.active === active) {
    return (await project(viewer, current, CORP_CARD_DTO_SPEC)) as CorpCardDto;
  }

  await repoSetCorpCardActive(viewer, id, active);
  const updated = await repoFindCorpCardById(viewer, id);
  return updated ? ((await project(viewer, updated, CORP_CARD_DTO_SPEC)) as CorpCardDto) : null;
}
