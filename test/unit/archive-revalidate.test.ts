import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 보관 액션은 보관함 화면(/admin/archive)을 다시 그리게 해야 한다 —
// 안 그러면 보관한 뒤 보관함으로 갔을 때 캐시된 RSC 페이로드가 그대로 나와
// 방금 보관한 행이 목록에 없다. 새로 고침해야 나타나므로 "삭제가 안 됐나" 하고
// 다시 시도하게 된다(/review L-2: 여섯 보관 액션 중 계급만 빠져 있었다).
//
// 한 곳을 고치는 것으로는 다음에 추가될 보관 액션이 또 빠진다 — 액션 단위로
// 전수 검사한다.

const ROOT = process.cwd();
const APP_DIR = resolve(ROOT, "app");

function listActionFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listActionFiles(full));
    else if (entry.name === "actions.ts") out.push(full);
  }
  return out;
}

// `export const xAction = ...` 단위로 쪼갠다 — 파일 전체에 revalidatePath가
// 한 번이라도 있으면 통과하는 느슨한 검사가 되지 않게.
function actionBlocks(src: string): Array<{ name: string; body: string }> {
  const starts = [...src.matchAll(/export const (\w+Action)\b/g)].map((m) => ({
    name: m[1] ?? "",
    index: m.index ?? 0,
  }));
  return starts.map((start, i) => {
    const next = starts[i + 1];
    return { name: start.name, body: src.slice(start.index, next ? next.index : src.length) };
  });
}

describe("보관 액션은 보관함을 다시 그리게 한다 (/review L-2)", () => {
  const files = listActionFiles(APP_DIR);
  const archiveActions = files.flatMap((file) =>
    actionBlocks(readFileSync(file, "utf8"))
      .filter((block) => /await archive\(/.test(block.body))
      .map((block) => ({ file: file.replace(`${ROOT}/`, ""), ...block })),
  );

  it("보관 액션을 하나 이상 찾았다(검출기 자체가 죽어있지 않다)", () => {
    expect(archiveActions.length).toBeGreaterThan(0);
  });

  it("모든 보관 액션이 revalidatePath(\"/admin/archive\")를 부른다", () => {
    const missing = archiveActions
      .filter((action) => !action.body.includes('revalidatePath("/admin/archive")'))
      .map((action) => `${action.file}:${action.name}`);
    expect(missing, `보관함 재검증이 빠진 액션: ${missing.join(", ")}`).toEqual([]);
  });
});
