"use client";

import { useMemo } from "react";
import { Attachments, type AttachmentFile, type LogoProps } from "@/ui/attachments/Attachments";
import { completeCompanyLogoUploadAction, deleteCompanyLogoAction, requestCompanyLogoUploadAction, restoreCompanyLogoAction } from "./actions";
import styles from "./settings.module.css";

// domain/settings/company-logo의 COMPANY_LOGO_UPLOAD_FAILED와 같은 글자 — 그 모듈은 서버 부품(DB · 저장소)을 끌고 와 클라이언트에서 import하지 않는다.
const COMPANY_LOGO_UPLOAD_FAILED = "올리지 못함 · 다시 올리기";

// 07.2-10 Task 3 (S9 · DC-6): 설정 「회사 정보」 묶음 칸 아래 `로고` 한 칸. 파일 · 미리보기 주소 · 쓰기 권리는 서버가 준 값이고(쓰기 없으면 미리보기만),
// 올리기 · 삭제 · 되돌리기는 위 네 액션을 `Attachments variant="logo"`에 주입한다. 안내 문구는 싣지 않는다.
export function CompanyLogoField({ file, previewUrl, canEdit }: { file: AttachmentFile | null; previewUrl: string | null; canEdit: boolean }) {
  const actions = useMemo<LogoProps["actions"]>(
    () => ({
      request: async (declaration) => {
        const result = await requestCompanyLogoUploadAction(declaration);
        if (result?.data) return { ok: true, intent: result.data };
        return { ok: false, message: result?.serverError ?? COMPANY_LOGO_UPLOAD_FAILED };
      },
      complete: async (intentId) => {
        const result = await completeCompanyLogoUploadAction({ intentId });
        const data = result?.data;
        if (data && "file" in data && data.file) return { ok: true, file: data.file };
        if (data && "failed" in data && data.failed) return { ok: false, message: data.message, retry: data.retry };
        return { ok: false, message: result?.serverError ?? COMPANY_LOGO_UPLOAD_FAILED, retry: "restart" };
      },
      remove: async (fileId) => Boolean((await deleteCompanyLogoAction({ fileId }))?.data),
      restore: async (fileId) => Boolean((await restoreCompanyLogoAction({ fileId }))?.data),
    }),
    [],
  );

  return (
    <fieldset className={styles.field}>
      <legend>로고</legend>
      <Attachments variant="logo" file={file} previewUrl={previewUrl} canEdit={canEdit} actions={actions} uploadFailedText={COMPANY_LOGO_UPLOAD_FAILED} />
    </fieldset>
  );
}
