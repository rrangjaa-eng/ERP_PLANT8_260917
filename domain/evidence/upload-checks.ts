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

// O-6 답이 바뀌면 이 함수만 고친다.
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

// 06.1-14(E14 · RP-14): 설정 `evidence.min_size_kb`가 0보다 크고 선언 크기가 그보다 작을 때 — 폰이 줄인 사본 대신 원본을 올리게 한다.
export function evidenceTooSmall(minKb: number): string {
  return `${minKb}KB 미만 · 원본 파일로 다시`;
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
  opts: { maxBytes: number; minBytes?: number; duplicates: readonly EvidenceDuplicate[] },
): EvidenceUploadCheck {
  if (!Number.isInteger(input.size) || input.size < 1 || !SHA256_SHAPE.test(input.sha256)) {
    return { ok: false, reason: EVIDENCE_UPLOAD_FAILED };
  }
  if (input.size > opts.maxBytes) return { ok: false, reason: evidenceTooLarge(input.size, opts.maxBytes) };
  // 최소 용량은 크기 초과 다음 · 형식보다 먼저(사람은 「원본으로 다시」 하나만 보면 된다). 0이면 검사 없음.
  const minBytes = opts.minBytes ?? 0;
  if (minBytes > 0 && input.size < minBytes) return { ok: false, reason: evidenceTooSmall(Math.round(minBytes / 1024)) };
  if (!(EVIDENCE_CONTENT_TYPES as readonly string[]).includes(input.contentType)) return { ok: false, reason: EVIDENCE_WRONG_TYPE };
  if (opts.duplicates.some((duplicate) => duplicate.sameOwner)) return { ok: false, reason: EVIDENCE_DUPLICATE_SAME_OWNER };
  const visible = opts.duplicates.find((duplicate) => duplicate.visibleNumber !== null);
  if (visible?.visibleNumber) return { ok: false, reason: evidenceDuplicateElsewhere(visible.visibleNumber) };
  if (opts.duplicates.length > 0) return { ok: false, reason: EVIDENCE_DUPLICATE_HIDDEN };
  return { ok: true };
}

// 06.1-14(E14 · RP-14 · PA-SIG-HEAD): 완료 통보가 저장소에서 읽은 머리 16바이트와 선언 형식의 서명을 대조한다 — 260907
// sniffDocumentType(JPEG · PNG · PDF · HEIC) + 05가 받는 WEBP. HEIC/HEIF 선언은 서로 같게 본다(브라우저마다 둘을 섞어 붙인다).
// 12바이트 미만 · 모르는 형식은 거짓. PDF 꼬리 · 사진 크기 · HEIC 변환은 가져오지 않았다(CONTEXT 「가져오지 않음」).
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

function ascii(head: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...head.subarray(from, to));
}

function startsWith(head: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, i) => head[i] === byte);
}

export function signatureMatches(head: Uint8Array | null, contentType: string): boolean {
  if (!head || head.length < 12) return false;
  switch (contentType) {
    case "image/jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP";
    case "image/heic":
    case "image/heif":
      return ascii(head, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(head, 8, 12));
    case "application/pdf":
      return ascii(head, 0, 4) === "%PDF";
    default:
      return false;
  }
}
