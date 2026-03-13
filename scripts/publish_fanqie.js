#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOOK_ID = '7616021706989128728';
const BOOK_NAME = '末日倒计时：开局强行绑定救世主';
const DRAFT_URL = `https://fanqienovel.com/main/writer/${BOOK_ID}/publish/?enter_from=newchapter_0`;
const CHAPTER_MANAGE_URL = `https://fanqienovel.com/main/writer/chapter-manage/${BOOK_ID}&${encodeURIComponent(BOOK_NAME)}?type=1`;
const DEFAULT_DAILY_LIMIT_CHARS = 50000; // inferred from real Fanqie backend behavior; treat as a safety guard, not an official documented rule.

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (!key.startsWith('--')) continue;
    if (!next || next.startsWith('--')) args[key.slice(2)] = true;
    else {
      args[key.slice(2)] = next;
      i += 1;
    }
  }
  return args;
}

function loadChapters(args) {
  const prep = path.resolve(__dirname, 'prepare_chapters.py');
  if (args.file) {
    const dir = path.dirname(args.file);
    const res = spawnSync('python3', [prep, '--dir', dir], { encoding: 'utf8' });
    if (res.status !== 0) throw new Error(res.stderr || 'prepare_chapters failed');
    return JSON.parse(res.stdout).filter((c) => c.file === args.file);
  }
  if (args.dir) {
    const res = spawnSync('python3', [prep, '--dir', args.dir], { encoding: 'utf8' });
    if (res.status !== 0) throw new Error(res.stderr || 'prepare_chapters failed');
    return JSON.parse(res.stdout);
  }
  throw new Error('Provide --file or --dir');
}

function filterChapters(chapters, args) {
  let items = [...chapters];
  if (args['start-from']) {
    const keyword = String(args['start-from']).trim();
    const idx = items.findIndex((c) => c.name.includes(keyword) || c.title.includes(keyword) || c.display_title?.includes(keyword));
    if (idx >= 0) items = items.slice(idx);
  }
  const limit = Number(args.limit || items.length || 1);
  return items.slice(0, limit);
}

function applyDailyLimitGuard(chapters, args) {
  const mode = args.mode || 'immediate';
  if (mode !== 'immediate') return chapters;
  const dailyLimit = Number(args['daily-limit-chars'] || DEFAULT_DAILY_LIMIT_CHARS);
  const alreadyPublished = Number(args['already-published-chars'] || 0);
  let running = alreadyPublished;
  const accepted = [];
  for (const chapter of chapters) {
    const next = running + Number(chapter.word_count || 0);
    if (next > dailyLimit) break;
    accepted.push(chapter);
    running = next;
  }
  return accepted;
}

function resolveScheduleAt(base, index, stepMinutes = 30) {
  const dt = new Date(base.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) throw new Error(`Invalid --schedule-at value: ${base}`);
  dt.setMinutes(dt.getMinutes() + index * stepMinutes);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}`, full: `${yyyy}-${mm}-${dd} ${hh}:${mi}` };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadPublishState(stateFile) {
  if (!fs.existsSync(stateFile)) return { published: [] };
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function savePublishState(stateFile, state) {
  ensureDir(path.dirname(stateFile));
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

function isPublishedInState(state, file) {
  return (state.published || []).some((item) => item.file === file);
}

function markPublished(stateFile, chapter, verify, mode) {
  const state = loadPublishState(stateFile);
  if (isPublishedInState(state, chapter.file)) return;
  state.published ||= [];
  state.published.push({
    file: chapter.file,
    title: chapter.title,
    status: verify.status || null,
    publishedAt: verify.publishTime || null,
    rowText: verify.rowText || null,
    mode,
    recordedAt: new Date().toISOString(),
  });
  savePublishState(stateFile, state);
}

async function connectBrowser(args, statePath, playwright) {
  let cdpUrl = args.cdp || null;
  const { chromium } = playwright;
  let browser;
  let context;

  if (cdpUrl) {
    if (cdpUrl.startsWith('http://') || cdpUrl.startsWith('https://')) {
      const jsonUrl = cdpUrl.replace(/\/$/, '') + '/json/version';
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`Failed to query DevTools endpoint: ${jsonUrl} => ${res.status}`);
      const meta = await res.json();
      cdpUrl = meta.webSocketDebuggerUrl || cdpUrl;
    }
    browser = await chromium.connectOverCDP(cdpUrl);
    context = browser.contexts()[0] || await browser.newContext({ storageState: statePath });
  } else {
    browser = await chromium.launch({ headless: false, slowMo: 80 });
    context = await browser.newContext({ storageState: statePath });
  }

  return { browser, context };
}

function chapterNumber(chapter) {
  if (!chapter.serial) return null;
  return String(parseInt(String(chapter.serial).replace(/^第/, '').replace(/章$/, ''), 10));
}

async function fillDraft(page, chapter, shotsDir, prefix) {
  await page.goto(DRAFT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(shotsDir, `${prefix}-01-publish-page.png`), fullPage: true });

  const serialInput = page.locator('input.serial-input.byte-input.byte-input-size-default').first();
  const num = chapterNumber(chapter);
  if (num) await serialInput.fill(num);

  const titleInput = page.locator('input[placeholder="请输入标题"]').first();
  await titleInput.fill(chapter.display_title || chapter.title);

  const editor = page.locator('.ProseMirror[contenteditable="true"]').first();
  await editor.click();
  await editor.evaluate((el, content) => {
    el.focus();
    el.innerHTML = '';
    const lines = String(content).split(/\n+/);
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      el.appendChild(p);
    }
  }, chapter.content);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(shotsDir, `${prefix}-02-filled-draft.png`), fullPage: true });
}

async function handleInterceptors(page) {
  const maxRounds = 10;
  for (let round = 1; round <= maxRounds; round++) {
    const publishModal = page.locator('.arco-modal.publish-confirm-container-new').last();
    if (await publishModal.count()) return 'publish-modal';

    const dialog = page.locator('.arco-modal[role="dialog"], .byte-modal[role="dialog"], .reactour__helper[role="dialog"], .reactour__helper, .arco-modal, .byte-modal').last();
    if (await dialog.count()) {
      const text = ((await dialog.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const prioritized = [];
      if (text.includes('错别字') || text.includes('智能纠错')) prioritized.push('替换全部', '全部替换', '确认替换', '提交');
      if (text.includes('是否确定提交') || text.includes('发布提示')) prioritized.push('提交', '确认');
      const candidates = [...prioritized, '确定', '下一步', '知道了', '关闭'];

      for (const label of candidates) {
        const btn = dialog.locator('button').filter({ hasText: label }).first();
        if (await btn.count()) {
          console.log(`已处理拦路弹窗 ${round}: [${label}] ${text.slice(0, 160)}`);
          await btn.click();
          await page.waitForTimeout(1800);
          break;
        }
      }

      const publishModal2 = page.locator('.arco-modal.publish-confirm-container-new').last();
      if (await publishModal2.count()) return 'publish-modal';

      const anyDialog = page.locator('.arco-modal[role="dialog"], .byte-modal[role="dialog"], .reactour__helper[role="dialog"], .reactour__helper, .arco-modal, .byte-modal').last();
      if (!(await anyDialog.count())) continue;

      const closeBtn = anyDialog.locator('[aria-label="Close"], .arco-modal-close-icon, .byte-modal-close-icon').first();
      if (await closeBtn.count()) {
        const t = ((await anyDialog.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        console.log(`已关闭拦路弹窗 ${round}: ${t.slice(0, 160)}`);
        await closeBtn.click();
        await page.waitForTimeout(1500);
        continue;
      }
    }
    await page.waitForTimeout(1200);
  }
  return 'unknown';
}

async function goToFinalPublishModal(page, chapter, shotsDir, prefix) {
  await page.locator('.publish-button.auto-editor-next').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shotsDir, `${prefix}-03-after-next.png`), fullPage: true });

  const gateResult = await handleInterceptors(page);
  await page.screenshot({ path: path.join(shotsDir, `${prefix}-04-after-interceptors.png`), fullPage: true });
  await page.waitForTimeout(1000);

  const publishModal = page.locator('.arco-modal.publish-confirm-container-new').last();
  if (!await publishModal.count()) {
    return { ok: false, reason: `未检测到最终发布弹窗。gateResult=${gateResult}` };
  }

  const noLabel = publishModal.locator('label').filter({ hasText: '否' }).first();
  if (await noLabel.count()) {
    await noLabel.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(shotsDir, `${prefix}-05-final-publish-modal-ai-no.png`), fullPage: true });
  return { ok: true, publishModal };
}

async function verifyPublished(page, chapter, shotsDir, prefix) {
  await page.goto(CHAPTER_MANAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shotsDir, `${prefix}-07-chapter-manage-after-publish.png`), fullPage: true });

  const expectedNum = chapterNumber(chapter);
  const displayTitle = chapter.display_title || chapter.title;
  return await page.evaluate(({ title, num }) => {
    const normalizedTitle = num ? `第${num}章 ${title}` : title;
    const rows = Array.from(document.querySelectorAll('.arco-table-tr'));
    for (const row of rows) {
      const text = (row.innerText || row.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || !text.includes(normalizedTitle)) continue;
      const cells = Array.from(row.querySelectorAll('.arco-table-td, .arco-table-cell'))
        .map((el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return {
        found: true,
        title: normalizedTitle,
        rowText: text,
        cells,
        status: cells[3] || null,
        publishTime: cells[4] || null,
      };
    }
    return { found: false, title: normalizedTitle };
  }, { title: displayTitle, num: expectedNum });
}

async function publishOne(page, chapter, args, shotsDir, stateFile, index) {
  const prefix = String(index + 1).padStart(2, '0');
  const mode = args.mode || 'immediate';
  const scheduleInfo = mode === 'scheduled' && args['schedule-at']
    ? resolveScheduleAt(args['schedule-at'], index, Number(args['schedule-step-minutes'] || 30))
    : null;
  console.log(`开始处理: ${chapter.title} (${path.basename(chapter.file)})`);

  await fillDraft(page, chapter, shotsDir, prefix);

  if (args['dry-run'] || args['fill-only']) {
    return { chapter, mode: 'fill-only', ok: true };
  }

  const modalResult = await goToFinalPublishModal(page, chapter, shotsDir, prefix);
  if (!modalResult.ok) return { chapter, ok: false, reason: modalResult.reason };

  if (args['to-final-modal'] || !args['confirm-publish']) {
    return { chapter, mode: 'to-final-modal', ok: true };
  }

  if (mode === 'scheduled') {
    if (!scheduleInfo) {
      return { chapter, ok: false, reason: 'scheduled 模式需要 --schedule-at，例如 2026-03-13 21:00' };
    }
    const switchBtn = modalResult.publishModal.locator('button[role="switch"]').first();
    if (await switchBtn.count()) {
      const checked = ((await switchBtn.getAttribute('class')) || '').includes('checked');
      if (!checked) {
        await switchBtn.click();
        await page.waitForTimeout(800);
      }
    }
    const dateInput = modalResult.publishModal.locator('input[placeholder="请选择日期"]').first();
    const timeInput = modalResult.publishModal.locator('input[placeholder="请选择时间"]').first();
    if (!await dateInput.count() || !await timeInput.count()) {
      return { chapter, ok: false, reason: '未找到定时发布的日期/时间控件。' };
    }
    await dateInput.fill(scheduleInfo.date);
    await dateInput.press('Enter').catch(() => {});
    await page.waitForTimeout(300);
    await timeInput.fill(scheduleInfo.time);
    await timeInput.press('Enter').catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(shotsDir, `${prefix}-06-scheduled-filled.png`), fullPage: true });
  } else if (mode !== 'immediate') {
    return { chapter, ok: false, reason: '当前版本只开放 immediate / scheduled。' };
  }

  const confirmPublishBtn = modalResult.publishModal.locator('button').filter({ hasText: '确认发布' }).first();
  if (!await confirmPublishBtn.count()) {
    return { chapter, ok: false, reason: '未找到“确认发布”按钮。' };
  }

  await page.screenshot({ path: path.join(shotsDir, `${prefix}-06-before-confirm-publish.png`), fullPage: true });
  await confirmPublishBtn.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(shotsDir, `${prefix}-06-after-confirm-publish.png`), fullPage: true });

  const verify = await verifyPublished(page, chapter, shotsDir, prefix);
  if (verify.found) {
    markPublished(stateFile, chapter, verify, mode);
  }
  return { chapter, ok: !!verify.found, verify, scheduleInfo, reason: verify.found ? null : '章节管理页未找到目标章节' };
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.mode || 'immediate';
  const skillRoot = path.resolve(__dirname, '..');
  const statePath = path.join(skillRoot, 'state', 'fanqie-storage-state.json');
  const stateFile = path.join(skillRoot, 'state', 'publish-state.json');
  const shotsDir = path.join(skillRoot, 'state', 'screenshots');
  ensureDir(shotsDir);

  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    console.error('Missing dependency: playwright');
    console.error('Install with: npm i -D playwright');
    process.exit(1);
  }
  if (!fs.existsSync(statePath)) {
    console.error('Missing login state. Run: node skills/fanqie-publisher/scripts/login_fanqie.js --cdp http://127.0.0.1:9222');
    process.exit(1);
  }

  const loaded = loadChapters(args);
  let chapters = filterChapters(loaded, args);
  if (!chapters.length) {
    console.error('No chapters found to publish');
    process.exit(1);
  }

  chapters = applyDailyLimitGuard(chapters, { ...args, mode });
  if (!chapters.length) {
    console.log(`按照每日字数保护阈值停止：当前 mode=${mode}，没有可安全继续发布的章节。可用 --already-published-chars / --daily-limit-chars 调整。`);
    return;
  }

  if (args['skip-published']) {
    const state = loadPublishState(stateFile);
    chapters = chapters.filter((c) => !isPublishedInState(state, c.file));
  }
  if (!chapters.length) {
    console.log('待处理章节为空。');
    return;
  }

  const { browser, context } = await connectBrowser(args, statePath, playwright);
  const page = await context.newPage();

  const results = [];
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const result = await publishOne(page, chapter, { ...args, mode }, shotsDir, stateFile, i);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      console.log(`停止批量流程，卡在: ${chapter.title}`);
      break;
    }
    if (i < chapters.length - 1) {
      await page.waitForTimeout(2000);
    }
  }

  await browser.close().catch(() => {});

  const successCount = results.filter((r) => r.ok && r.verify?.found).length;
  const final = {
    requested: chapters.length,
    processed: results.length,
    publishedVerified: successCount,
    mode,
    dailyLimitChars: Number(args['daily-limit-chars'] || DEFAULT_DAILY_LIMIT_CHARS),
    alreadyPublishedChars: Number(args['already-published-chars'] || 0),
    results: results.map((r) => ({
      title: r.chapter.title,
      ok: r.ok,
      reason: r.reason || null,
      status: r.verify?.status || null,
      publishTime: r.verify?.publishTime || null,
    })),
  };
  console.log('BATCH_SUMMARY');
  console.log(JSON.stringify(final, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
