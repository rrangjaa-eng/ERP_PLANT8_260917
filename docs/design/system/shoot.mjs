// docs/design/system/shoot.mjs — SYSTEM.md 실물 스크린샷.
// 실행: 리포 루트에서 `node docs/design/system/shoot.mjs [장면이름 …]` (인자 없으면 전부)
// Playwright는 전역 설치본을 쓴다(`npm root -g`). 앱 코드가 아니다.
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const globalRoot = execSync('npm root -g').toString().trim();
const { chromium } = await import(pathToFileURL(resolve(globalRoot, 'playwright/index.mjs')).href);

const dir = 'docs/design/system';
// [이름, 파일, 해시, 폭, 높이, isMobile, fullPage, 출력, (선택자 — 있으면 그 요소만 캡처)]
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
  // §6 남은 실물 3개 — 초안(2026-09-18, 보드 확인 전)
  ['form-blocked',    'form-expense.html',   'blocked', 1280, 900, false, true,  'shots/form-blocked-pc.png'],
  ['form-error',      'form-expense.html',   'error',   1280, 900, false, true,  'shots/form-error-pc.png'],
  ['form-done',       'form-expense.html',   'done',    1280, 900, false, true,  'shots/form-done-pc.png'],
  ['form-m',          'form-expense.html',   'blocked', 390,  844, true,  false, 'shots/form-blocked-m.png'],
  ['form-pick-pc',    'form-expense.html',   'pick',    1280, 800, false, false, 'shots/form-pick-pc.png'],
  ['form-pick-m',     'form-expense.html',   'pick',    390,  844, true,  false, 'shots/form-pick-m.png'],
  ['form-self',       'form-expense.html',   'self',    1280, 900, false, false, 'shots/form-self.png', '.chain-row'],
  ['pnl-ceo',         'dashboard-pnl.html',  'ceo',     1280, 900, false, true,  'shots/pnl-ceo-pc.png'],
  ['pnl-lead',        'dashboard-pnl.html',  'lead',    1280, 900, false, true,  'shots/pnl-lead-pc.png'],
  ['pnl-empty',       'dashboard-pnl.html',  'empty',   1280, 900, false, true,  'shots/pnl-empty-pc.png'],
  ['pnl-m',           'dashboard-pnl.html',  'ceo',     390,  844, true,  true,  'shots/pnl-ceo-m.png'],
  ['pnl-m-view',      'dashboard-pnl.html',  'ceo',     390,  844, true,  false, 'shots/pnl-ceo-m-viewport.png'],
  ['pnl-dash-pc',     'dashboard-pnl.html',  'dash',    1280, 900, false, true,  'shots/pnl-dash-pc.png'],
  ['pnl-dash-big-pc', 'dashboard-pnl.html',  'dash-big',1280, 900, false, true,  'shots/pnl-dash-big-pc.png'],
  ['pnl-dash-m',      'dashboard-pnl.html',  'dash-big',390,  844, true,  false, 'shots/pnl-dash-m.png'],
  ['ceo-pc',          'dashboard-ceo.html',  'ceo',     1280, 900, false, true,  'shots/ceo-dash-pc.png'],
  ['ceo-m',           'dashboard-ceo.html',  'ceo',     390,  844, true,  true,  'shots/ceo-dash-m.png'],
  ['ceo-m-view',      'dashboard-ceo.html',  'ceo',     390,  844, true,  false, 'shots/ceo-dash-m-viewport.png'],
  ['team-pc',         'dashboard-team.html', '',        1280, 900, false, true,  'shots/team-dash-pc.png'],
  ['team-m',          'dashboard-team.html', '',        390,  844, true,  true,  'shots/team-dash-m.png'],
  ['cert-empty',      'external-cert.html',  'empty',   390,  844, true,  true,  'shots/cert-empty-m.png'],
  ['cert-sign',       'external-cert.html',  'sign',    390,  844, true,  true,  'shots/cert-sign-m.png'],
  ['cert-error',      'external-cert.html',  'error',   390,  844, true,  true,  'shots/cert-error-m.png'],
  ['cert-done',       'external-cert.html',  'done',    390,  844, true,  false, 'shots/cert-done-m.png'],
  ['cert-expired',    'external-cert.html',  'expired', 390,  844, true,  false, 'shots/cert-expired-m.png'],
];

const only = new Set(process.argv.slice(2));
const browser = await chromium.launch();
for (const [name, file, hash, w, h, mobile, fullPage, out, selector] of scenes) {
  if (only.size && !only.has(name)) continue;
  const url = pathToFileURL(resolve(dir, file)).href + (hash ? '#' + hash : '');
  let ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  let page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(300);
  if (fullPage) { // 고정·sticky 요소(하단 탭·제출 줄)가 문서 끝에 놓이도록 뷰포트를 문서 높이로 늘린다
    const full = Math.max(h, await page.evaluate(() => document.documentElement.scrollHeight));
    if (mobile) { // 모바일 에뮬레이션은 세로로 늘리면 가로 폭이 변하므로, 같은 폭의 비모바일 컨텍스트로 다시 연다
      await ctx.close();
      ctx = await browser.newContext({ viewport: { width: w, height: full }, deviceScaleFactor: 2 });
      page = await ctx.newPage();
      await page.goto(url);
      await page.waitForTimeout(300);
    } else {
      await page.setViewportSize({ width: w, height: full });
      await page.waitForTimeout(100);
    }
  }
  if (selector) await page.locator(selector).screenshot({ path: resolve(dir, out) });
  else await page.screenshot({ path: resolve(dir, out), fullPage });
  await ctx.close();
  console.log('ok', name, '→', out);
}
await browser.close();
