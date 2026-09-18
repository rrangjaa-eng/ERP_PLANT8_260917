// docs/design/system/shoot.mjs — SYSTEM.md 실물 스크린샷.
// 실행: 리포 루트에서 `node docs/design/system/shoot.mjs [장면이름 …]` (인자 없으면 전부)
// Playwright는 전역 설치본을 쓴다(`npm root -g`). 앱 코드가 아니다.
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const globalRoot = execSync('npm root -g').toString().trim();
const { chromium } = await import(pathToFileURL(resolve(globalRoot, 'playwright/index.mjs')).href);

const dir = 'docs/design/system';
// [이름, 파일, 해시, 폭, 높이, isMobile, fullPage, 출력]
const scenes = [
  ['preview-pc',      'preview.html',       '',          1280, 900, false, true,  'shots/preview-pc.png'],
  ['preview-m',       'preview.html',       '',          390,  844, true,  true,  'shots/preview-m.png'],
  ['preview-m-view',  'preview.html',       '',          390,  844, true,  false, 'shots/preview-m-viewport.png'],
  ['print-expense',   'print-expense.html', '',          900,  1240, false, true, 'shots/print-expense.png'],
  ['print-cert',      'print-cert.html',    '',          900,  1240, false, true, 'shots/print-cert.png'],
  ['sheet-approve',   'sheet-modal.html',   'approve',   390,  844, true,  false, 'shots/sheet-approve-m.png'],
  ['sheet-more',      'sheet-modal.html',   'more',      390,  844, true,  false, 'shots/sheet-more-m.png'],
  ['sheet-reject',    'sheet-modal.html',   'reject-m',  390,  844, true,  false, 'shots/sheet-reject-m.png'],
  ['modal-reject-pc', 'sheet-modal.html',   'reject-pc', 1280, 800, false, false, 'shots/modal-reject-pc.png'],
  // 인쇄 재디자인 발산 기록(두 장씩: 지출결의서 · 확인증). P2가 채택되어 위 print-*.html로 승격됨
  ['p1-form',         'print/p1-form.html',      '', 900, 1240, false, true, 'shots/print-p1-form.png'],
  ['p2-letter',       'print/p2-letter.html',    '', 900, 1240, false, true, 'shots/print-p2-letter.png'],
  ['p3-statement',    'print/p3-statement.html', '', 900, 1240, false, true, 'shots/print-p3-statement.png'],
  ['p4-seal',         'print/p4-seal.html',      '', 900, 1240, false, true, 'shots/print-p4-seal.png'],
];

const only = new Set(process.argv.slice(2));
const browser = await chromium.launch();
for (const [name, file, hash, w, h, mobile, fullPage, out] of scenes) {
  if (only.size && !only.has(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(resolve(dir, file)).href + (hash ? '#' + hash : ''));
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(dir, out), fullPage });
  await ctx.close();
  console.log('ok', name, '→', out);
}
await browser.close();
