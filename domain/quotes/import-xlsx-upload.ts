import { DEFAULT_WORKBOOK_DEPS, readSheets, sniff } from "@/domain/evidence-import/workbook";
import { EVIDENCE_IMPORT_MAX_BYTES, EVIDENCE_IMPORT_MAX_UNZIPPED_BYTES, EVIDENCE_IMPORT_MAX_ZIP_ENTRIES, quoteXlsxSizeRefusalHeadline } from "@/domain/evidence-import/limits";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { canOpenProject } from "@/domain/projects/visibility";
import { getCurrentQuoteRevision, RevisionNotFoundError } from "@/domain/quotes/lines";
import { quoteLockReason } from "@/domain/quotes/edit-scope";
import { parseQuoteWorkbook, type QuoteImportResult } from "@/domain/quotes/import-xlsx";
import { getSettingValue } from "@/domain/settings/registry";
import { QUOTE_LINE_MAX_PER_REVISION } from "@/domain/settings/keys";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { findProjectById } from "@/repositories/projects";
import { countActiveLinesByRevision } from "@/repositories/quote-lines";

// 07.2-14(X2 · T-07.2-14-01~03) — 견적 엑셀 올리기 읽기. 저장 0: 권리 · 현재 미승인 차수 · 크기 · 형식 · zip 상한을 거친 뒤 순수 파서(import-xlsx.ts)에 맡긴다.
// 사용자가 고칠 수 있는 파일 문제는 던지지 않고 `rejected` 결과로 돌려준다(화면이 거절 줄로 그린다). 권리 · 차수 잠김은 던진다 — 입구가 서지 않는 사람만 닿는 길이다.

const NOT_XLSX = "엑셀이 아님 · .xlsx로 다시";
const rejected = (message: string): QuoteImportResult => ({ kind: "rejected", message });

export async function readQuoteXlsxUpload(viewer: Viewer, input: { projectId: string; file: unknown; sheet?: string }): Promise<QuoteImportResult> {
  if (!(await can(viewer, "projects", "write"))) throw new ForbiddenError("견적 줄 저장 권한 없음");
  // 금액을 볼 수 없는 사람은 줄을 저장하지 못한다(저장 입구와 같은 판정) — 올려도 쓸 수 없다.
  if (!(await visible(viewer, "quote.amount"))) throw new ForbiddenError("견적 금액을 볼 수 없어 견적 줄 저장 불가");
  if (!(await canOpenProject(viewer, input.projectId, "write"))) throw new RevisionNotFoundError("존재하지 않는 차수");
  const project = await findProjectById(viewer, input.projectId);
  if (!project) throw new RevisionNotFoundError("존재하지 않는 차수");
  // 정산 · 완료는 새 견적 줄을 받지 않는다(edit-scope — 정산 새 줄은 견적 칸이 잠긴다).
  const revision = await getCurrentQuoteRevision(viewer, input.projectId);
  if (!revision) throw new RevisionNotFoundError("존재하지 않는 차수");
  const lock = quoteLockReason({ status: project.status, approvedSeq: revision.approved ? revision.seq : null });
  if (project.status === "settling" || project.status === "completed" || revision.approved) {
    throw new UserFacingError(lock ?? "견적 줄 잠김");
  }

  const file = input.file;
  if (!(file instanceof File)) return rejected(NOT_XLSX);
  if (file.size > EVIDENCE_IMPORT_MAX_BYTES) return rejected(quoteXlsxSizeRefusalHeadline(file.size));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > EVIDENCE_IMPORT_MAX_BYTES) return rejected(quoteXlsxSizeRefusalHeadline(bytes.length));
  if (sniff(bytes) !== "xlsx") return rejected(NOT_XLSX);
  const read = readSheets(
    { container: "xlsx", bytes },
    { zipLimits: { maxEntries: EVIDENCE_IMPORT_MAX_ZIP_ENTRIES, maxUnzippedBytes: EVIDENCE_IMPORT_MAX_UNZIPPED_BYTES } },
    DEFAULT_WORKBOOK_DEPS,
  );
  if (!read.ok) return rejected(NOT_XLSX);

  // 저장 때 LINE_CAP으로 전부 거부되지 않게: 올릴 수 있는 줄 = 설정 상한 − 현재 차수 활성 줄 수.
  const cap = await getSettingValue(QUOTE_LINE_MAX_PER_REVISION);
  const active = await countActiveLinesByRevision(viewer, revision.id);
  return parseQuoteWorkbook(read.book, { sheet: input.sheet, maxLines: Math.max(0, cap - active) });
}
