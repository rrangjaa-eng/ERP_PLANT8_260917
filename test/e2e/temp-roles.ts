import { test } from "@playwright/test";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// E2E 임시 계급 정리(07-21 권한표 flaky, #287 · #289). 스펙들이 만든 임시 계급이 보관되지 않고 쌓여 CI에서 권한표 스펙이
// 돌 때 활성 계급이 62개(체크박스 약 1만 1천)가 됐고, 그 격자에서 권한표 스펙의 5초 단언이 번갈아 깨졌다(로컬 실측:
// 계급 62개 11/40 실패 · 기본 계급만 40/40 통과).
// 이 워커가 만든 계급만 기록하고, 이 워커가 다른 스펙 파일로 넘어간 뒤(fullyParallel: false라 앞 파일은 끝났다) 보관한다 —
// 다른 워커가 아직 쓰는 계급은 건드리지 않는다. 마지막 파일 몫만 워커 끝까지 남는다.
const tracked: { id: string; file: string }[] = [];

function currentFile(): string | null {
  try {
    return test.info().file;
  } catch {
    return null;
  }
}

export async function archiveFinishedTempRoles(): Promise<void> {
  const file = currentFile();
  if (file === null) return;
  for (let index = tracked.length - 1; index >= 0; index -= 1) {
    const entry = tracked[index];
    if (!entry || entry.file === file) continue;
    await setRoleArchived(SYSTEM_VIEWER, entry.id, true);
    tracked.splice(index, 1);
  }
}

export function trackTempRole(id: string): void {
  const file = currentFile();
  if (file !== null) tracked.push({ id, file });
}

export async function insertTempRole(...args: Parameters<typeof insertRole>): ReturnType<typeof insertRole> {
  await archiveFinishedTempRoles();
  const row = await insertRole(...args);
  trackTempRole(row.id);
  return row;
}
