import { createEvidenceViewUrlAction } from "@/app/(app)/expenses/actions";

// 05-10: 결재 시트 증빙 썸네일 · 크게 보기 주소 — 서버 액션(권한 판정 뒤 서명 주소, 저장하지 않는다)을 시트의 주입 함수 모양으로 감싼다.
// 권한이 없거나 실패하면 null — 시트는 썸네일 없이 이름만 보인다.
export async function evidenceViewUrl(fileId: string): Promise<string | null> {
  try {
    return (await createEvidenceViewUrlAction({ fileId }))?.data?.url ?? null;
  } catch {
    return null;
  }
}
