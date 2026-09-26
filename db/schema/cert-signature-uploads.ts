import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// 규약 C3(04.3-02 Task 1 ①) — 서명 업로드 의도 표. FK도 개인정보도 없다
// (키는 uuid 조합). 장부가 아니라 "올리려는 중인 객체" 목록이라 행을
// 물리적으로 지운다(deleteSignatureUploadIntent) — domain/archive/index.ts의
// 물리 삭제 금지는 업무 기록 얘기다(repositories/settings.ts 예약 취소 ·
// repositories/team-memberships.ts와 같은 성격).
export const certSignatureUploads = pgTable("cert_signature_uploads", {
  objectKey: text("object_key").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
