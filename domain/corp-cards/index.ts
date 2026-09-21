import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { isUniqueViolation } from "@/lib/pg-errors";
import {
  listCorpCards as repoListCorpCards,
  insertCorpCard as repoInsertCorpCard,
  updateCorpCardOwner as repoUpdateCorpCardOwner,
  setCorpCardActive as repoSetCorpCardActive,
  findCorpCardById as repoFindCorpCardById,
  type CorpCardRow,
} from "@/repositories/corp-cards";

export class ForbiddenError extends UserFacingError {}
export class InvalidCardOwnerError extends UserFacingError {}
// defect 1 구체적 수정: 같은 발급사·뒤 4자리로 중복 등록하면 DB unique 제약
// (db/schema/corp-cards.ts의 corp_cards_issuer_last4_key)이 막고, drizzle의
// DrizzleQueryError.message에 원시 SQL·바인딩 값(내부 user id 포함)이 그대로
// 담긴다. 예전에는 그 message가 handleServerError를 거쳐 화면에 그대로 샜다 —
// 이제 여기서 그 특정 제약 위반만 감지해 운영자가 읽을 수 있는 문장으로
// 바꿔치기한다. 그 외 오류는 그대로 던져 handleServerError의 일반 처리(로그 +
// 안전한 일반 문구)로 넘긴다.
export class DuplicateCorpCardError extends UserFacingError {}
// 성공 기준 5 「수정」: 보관되었거나 없는 카드는 소유자를 바꿀 수 없다
// (domain/vendors의 ArchivedVendorError와 같은 결).
export class ArchivedCorpCardError extends UserFacingError {}

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

export type CorpCardWriteDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  findCorpCardById: typeof repoFindCorpCardById;
};

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

  let row: CorpCardRow;
  try {
    row = await repoInsertCorpCard(viewer, { ...input, kind });
  } catch (e) {
    if (isUniqueViolation(e, "corp_cards_issuer_last4_key")) {
      throw new DuplicateCorpCardError("이미 등록된 카드입니다 · 발급사와 뒤 4자리를 확인하세요");
    }
    throw e;
  }
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
  const kind = cardOwnerKind(owner);

  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, CARDS_MENU, "write"))) {
    throw new ForbiddenError("법인카드 소유자 변경 권한이 없습니다.");
  }

  // 거래처(updateVendor)와 같은 이유로 판정을 여기서 한다 — 목록이 보관된
  // 행의 「수정」 링크를 감추는 것만으로는 ?editId=<보관된 id>를 직접 여는
  // 경로를 못 막는다(DOM 감사 실측).
  const findCorpCardById = deps?.findCorpCardById ?? repoFindCorpCardById;
  const existing = await findCorpCardById(viewer, id);
  if (!existing || existing.archivedAt !== null) {
    throw new ArchivedCorpCardError("보관되었거나 존재하지 않는 법인카드는 수정할 수 없습니다.");
  }

  // kind도 같은 UPDATE에서 함께 옮긴다(생성 경로와 대칭). 빼먹으면 소유자만
  // 바뀌고 종류가 예전 값으로 남아, 화면이 kind로 개인/팀을 갈라 그리는 탓에
  // 종류 "개인" · 소유 "—"인 행이 된다.
  await repoUpdateCorpCardOwner(viewer, id, {
    kind,
    holderUserId: owner.holderUserId ?? null,
    teamId: owner.teamId ?? null,
  });

  // 결함 3: 소유자 변경은 수정이다 — vendors의 updateVendor와 같은 이유로
  // document_create가 아니라 document_update로 남긴다.
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_update", entity: "corp_card", entityId: id });
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
