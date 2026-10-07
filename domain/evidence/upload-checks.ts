// 05-04(EVID-01 · UI-SPEC Copywriting 「Error — 증빙 업로드」): 업로드 의도를 내주기 전 검사 — 크기 · 형식 · 중복을 순수하게
// 판정한다. 문자열은 화면(05-05) · E2E가 import하는 상수다. 선결제는 업로드를 막지 않는다(EXP-13).
// R-5: 해시는 브라우저가 보낸 참고 값 — 권한 · 금액 · 게이트는 기대지 않고 크기 · 형식 · 해시는 완료 통보의 메타데이터 재확인이 강제한다.

export const EVIDENCE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;

export const EVIDENCE_WRONG_TYPE = "이미지·PDF가 아님 · 사진이나 PDF로 다시";
export const EVIDENCE_DUPLICATE_SAME_OWNER = "같은 파일이 이미 첨부됨";
export const EVIDENCE_DUPLICATE_HIDDEN = "이미 첨부된 파일 · 다른 파일 고르기";
// 완료 통보 거부 · 선언 값이 깨진 요청(크기 0 · 해시 형식) — 사용자에게는 같은 한 줄이다(UI-SPEC S4 「다시 올리기」).
export const EVIDENCE_UPLOAD_FAILED = "올리지 못함 · 다시 올리기";

// 06-11(O-6 · DR-3) — 중복 범위: 지출결의 증빙과 카드 사용의 카드 전표는 한 종류로 센다. 차수 승인 증빙 · 리저브 줄 증빙은 자기 종류끼리만,
// 표에 없는 종류도 자기 종류만이다.
const DUPLICATE_SCOPES: Record<string, readonly string[]> = {
  expense: ["expense", "corp_card_usage"],
  corp_card_usage: ["expense", "corp_card_usage"],
};

export function duplicateScopeKinds(ownerKind: string): readonly string[] {
  return Object.hasOwn(DUPLICATE_SCOPES, ownerKind) ? (DUPLICATE_SCOPES[ownerKind] ?? [ownerKind]) : [ownerKind];
}

export function evidenceDuplicateElsewhere(number: string): string {
  return `같은 파일이 ${number} 증빙에 있음 · 다른 파일 고르기`;
}

const MB = 1024 * 1024;
const SHA256_SHAPE = /^[0-9a-f]{64}$/;

// 소수 첫째 자리 — 반올림이 한도와 같아지면(10.01MB → 10MB) 올려 적어 「10MB · 10MB 초과」가 되지 않게 한다.
function megabytes(size: number, maxMb: number): string {
  const exact = size / MB;
  const rounded = Math.round(exact * 10) / 10;
  return String(rounded > maxMb ? rounded : Math.ceil(exact * 10) / 10);
}

export function evidenceTooLarge(size: number, maxBytes: number): string {
  const maxMb = maxBytes / MB;
  return `${megabytes(size, maxMb)}MB · ${maxMb}MB 초과 · 파일을 줄여 다시`;
}

export type EvidenceUploadDeclaration = { size: number; contentType: string; sha256: string };

// 같은 sha256의 살아 있는 파일마다 — 같은 주인인지, 다른 주인이면 올린 사람이 그 문서를 볼 수 있을 때만 번호.
export type EvidenceDuplicate = { sameOwner: boolean; visibleNumber: string | null };

export type EvidenceUploadCheck = { ok: true } | { ok: false; reason: string };

export function checkEvidenceUpload(
  input: EvidenceUploadDeclaration,
  opts: { maxBytes: number; duplicates: readonly EvidenceDuplicate[] },
): EvidenceUploadCheck {
  if (!Number.isInteger(input.size) || input.size < 1 || !SHA256_SHAPE.test(input.sha256)) {
    return { ok: false, reason: EVIDENCE_UPLOAD_FAILED };
  }
  if (input.size > opts.maxBytes) return { ok: false, reason: evidenceTooLarge(input.size, opts.maxBytes) };
  if (!(EVIDENCE_CONTENT_TYPES as readonly string[]).includes(input.contentType)) return { ok: false, reason: EVIDENCE_WRONG_TYPE };
  if (opts.duplicates.some((duplicate) => duplicate.sameOwner)) return { ok: false, reason: EVIDENCE_DUPLICATE_SAME_OWNER };
  const visible = opts.duplicates.find((duplicate) => duplicate.visibleNumber !== null);
  if (visible?.visibleNumber) return { ok: false, reason: evidenceDuplicateElsewhere(visible.visibleNumber) };
  if (opts.duplicates.length > 0) return { ok: false, reason: EVIDENCE_DUPLICATE_HIDDEN };
  return { ok: true };
}
