#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key.startsWith('--')) {
      if (!next || next.startsWith('--')) args[key.slice(2)] = true;
      else {
        args[key.slice(2)] = next;
        i += 1;
      }
    }
  }
  return args;
}

async function main() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    console.error('Missing dependency: playwright');
    console.error('Install with: npm i -D playwright  OR  npm i -g playwright');
    process.exit(1);
  }

  const args = parseArgs(process.argv);
  let cdpUrl = args.cdp || 'http://127.0.0.1:9222';
  const loginUrl = 'https://fanqienovel.com/main/writer/?enter_from=author_zone';
  const statePath = path.resolve(__dirname, '..', 'state', 'fanqie-storage-state.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });

  if (cdpUrl.startsWith('http://') || cdpUrl.startsWith('https://')) {
    const jsonUrl = cdpUrl.replace(/\/$/, '') + '/json/version';
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`Failed to query DevTools endpoint: ${jsonUrl} => ${res.status}`);
    const meta = await res.json();
    cdpUrl = meta.webSocketDebuggerUrl || cdpUrl;
  }

  const { chromium } = playwright;
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  console.log(`已连接 Windows 浏览器: ${cdpUrl}`);
  console.log('请在已打开的浏览器里完成扫码/登录。');
  console.log('登录完成后，在终端按 Enter 保存登录态。');

  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', async () => {
    await context.storageState({ path: statePath });
    console.log(`已保存登录态: ${statePath}`);
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
