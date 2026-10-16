"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { registerEvidenceUpload } from "@/domain/evidence-import";
import "./actions.registry";

// 06.1-04 — 증빙 엑셀 파일 하나 = 액션 한 번(FormData `file` 하나). 금액 · 서식 · 카드는 받지 않는다 — 서버가 파일에서 읽는다.
// 권한 · 크기(File.size) · 거절은 전부 domain registerEvidenceUpload → registerEvidenceFile이 한다. 사용자가 고칠 수 있는 거절은
// 결과 데이터 `refused`로 돌아온다(E2). 입력 스키마는 FormData 하나 — 이 저장소의 첫 파일 본문 액션이다(P-SAFE).
export const registerEvidenceFileAction = authedActionClient
  .schema(z.instanceof(FormData))
  .action(async ({ parsedInput, ctx }) => registerEvidenceUpload(ctx.viewer, parsedInput.get("file")));
