# fanqie-publisher

Fanqie Novel chapter publishing skill for OpenClaw.

This skill automates chapter publishing from local Markdown files to the Fanqie writer backend through browser automation.

## What it can do

- Parse chapter Markdown files from a local directory
- Split chapter serial and chapter title correctly for Fanqie
- Reuse saved login state through Playwright + browser CDP
- Fill Fanqie editor fields automatically
- Immediate publish
- Batch immediate publish
- Fanqie-native scheduled publish
- Post-publish verification through chapter management page

## Current source directory used in development

```bash
/home/amm10090/book/末日倒计时：开局强行绑定救世主/末世小说正文
```

## Main files

- `SKILL.md` — trigger guidance and workflow
- `scripts/prepare_chapters.py` — parse markdown chapters
- `scripts/login_fanqie.js` — connect to browser and save login state
- `scripts/publish_fanqie.js` — publishing automation
- `references/` — workflow notes, selectors, and learned platform constraints

## Safety / local state

This repository should **not** include:

- login state
- screenshots
- recon artifacts
- `node_modules`
- generated package lock files

Those are excluded with `.gitignore`.

## Known platform constraints

- Fanqie appears to enforce a practical daily publish ceiling around **50,000 chars/day** (inferred from backend behavior, not an official quoted rule)
- Scheduled chapters may become effectively non-editable within about **30 minutes before publish time**

## GitHub

Primary repository:

<https://github.com/amm10090/fanqie-publisher-skill>
