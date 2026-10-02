import { z } from "zod";
import { SIGNATURE_BASE64_MAX_LENGTH } from "@/domain/certs/signature-png";

// 04.3-06 ⑤ — 공개 제출 액션의 입력 스키마("use server" 파일 밖 — 단위 테스트가 직접 부른다).
// 칸마다 최대 길이를 둔다(본문 한도 예산 — test/unit/certs/signature-png.test.ts).
// 서명 문자열이 상한의 base64 길이를 넘으면 본문 한도 오류가 아니라 validationErrors.signature
// (칸 오류)로 돌아간다 — 화면이 서명 칸 오류로 바꾼다. 04.3-15 — 명단이 없어 고른 경품 id · 멱등 키 ·
// 페이지가 준 안내 판(consentVersion · retentionYears)으로 제출한다.
export const submitCertificateSchema = z.object({
  token: z.string().min(1).max(128),
  prizeId: z.uuid(),
  name: z.string().min(1).max(40),
  rrnFront6: z.string().max(6),
  rrnBack7: z.string().max(7),
  phone: z.string().max(40),
  address: z.string().max(200).optional(),
  consent: z.literal(true),
  signaturePngBase64: z.string().min(1).max(SIGNATURE_BASE64_MAX_LENGTH),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
  consentVersion: z.string().min(1).max(20),
  retentionYears: z.number().int().min(1).max(99),
  rrnRecheckConfirmed: z.boolean().optional(),
});
