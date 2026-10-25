<h1 align="center">
  <img src="./assets/fanqie-publisher-cover.png" width="1200" alt="Fanqie Publisher Skill — 本地书稿，有序连载。">
</h1>

## 核心能力

面向已经准备好章节文件的作者，以及协助作者操作后台的 AI Agent。项目通过 Playwright 将本地 Markdown 章节填入番茄小说作者后台，核对后再发布，入口统一为 [`scripts/publish_fanqie.js`](./scripts/publish_fanqie.js)。

- **先看解析，再操作后台**：从 Markdown 提取章节号、标题和正文，支持本地预览。
- **分阶段核对**：可以只填编辑器，也可以推进到最终发布弹窗；真实提交需要 `--confirm-publish` 和用户当轮明确授权。
- **检查正文输入是否一致**：填充后回读正文，逐字符比对中文、Emoji 和换行；不一致时中止当前章节。
- **单章起步，再批量或定时**：支持目录选章、分卷选择，以及番茄后台原生定时发布。
- **保留本地操作记录**：保存登录态、阶段截图和章节记录；可显式开启本地记录去重。

## 快速安装

```bash
git clone https://github.com/amm10090/fanqie-publisher-skill.git
cd fanqie-publisher-skill
npm install
```

运行前需要自行准备：

- Node.js 与 npm；脚本使用 Node.js 内置的 `fetch`。
- Python 3，用于解析章节。
- 可通过 CDP 连接的 Chromium / Chrome 浏览器。
- 能访问目标作品后台的番茄小说作者账号；需要登录时由本人扫码。

下文命令均在仓库根目录执行。`npm install` 安装项目依赖，不会替你启动浏览器、开启调试端口或完成登录。

## 快速开始

先完成单章预览和填充，再决定是否发布。示例中的 `/path/to/chapters` 请替换为自己的**绝对路径**。

### 1. 准备章节并预览

一份 `.md` 文件对应一章，使用 **UTF-8、无 BOM** 编码。文件名建议统一补零，例如 `第001章_启程.md`，内容如下：

```markdown
# 第001章 启程

天亮时，他推开了门。

街道尽头，第一班车正在等候。
```

```bash
python3 scripts/prepare_chapters.py \
  --dir "/path/to/chapters" \
  --preview
```

对上述示例，预览会列出 `第001章 启程`，正文字符数为 `26`。解析器优先使用文件第一行的一级标题；没有该标题时从文件名推导。填入后台时，章节号为 `1`，显示标题为 `启程`，首行标题不进入正文。

目录只读取当前层的 Markdown 文件，并按文件名排序，不递归子目录。正文按纯文本处理，不负责将 Markdown 标记转换为富文本样式。预览中的“字数”按正文字符数计算，包含正文中的空白和换行，不等同于后台计数。

### 2. 配置目标作品，再连接浏览器

**当前版本的目标作品写在源码中。** 首次连接前，检查 [`scripts/publish_fanqie.js`](./scripts/publish_fanqie.js) 顶部的 `BOOK_ID` 和 `BOOK_NAME`，改为自己的作品；`DRAFT_URL` 与 `CHAPTER_MANAGE_URL` 由它们生成。当前没有 `--book-id` 或 `--book-name` 命令参数。

启动自己的 Chromium / Chrome，并准备可访问的 CDP 地址。以下示例使用 `http://127.0.0.1:9222`；如果使用其他地址，应在登录和发布命令中保持一致。调试端口只向可信本机环境开放。

```bash
node scripts/login_fanqie.js --cdp http://127.0.0.1:9222
```

脚本连接浏览器；需要登录时切换到二维码流程，等待人工扫码。登录态保存在 `state/fanqie-storage-state.json`，二维码截图保存在 `state/login-qr.png`。若当前会话已登录，则刷新保存登录态。

### 3. 只填充一章，不提交发布

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --file "/path/to/chapters/第001章_启程.md" \
  --mode immediate \
  --fill-only
```

`--fill-only` 会实际填写章节号、标题和正文，但不点击“下一步”或“确认发布”。请在浏览器中核对目标作品、章节号、标题、完整正文、分卷和页面状态；需要指定分卷时，在这一步就加入 `--volume "目标分卷名"`。

填充会改写编辑器内容，应使用专门的新草稿。批量操作前，先目视检查这一章；仅查看终端输出不能替代页面核对。

## 从最终弹窗到正式发布

### 先核对最终发布设置

将上一条命令中的 `--fill-only` **替换为** `--to-final-modal`：

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --file "/path/to/chapters/第001章_启程.md" \
  --mode immediate \
  --to-final-modal
```

该模式会推进“下一步”及中间弹窗，尝试将“是否使用AI”设为“否”，成功后停在最终发布弹窗，不点击“确认发布”。核对分卷、章节标题和 AI 选项。

对于定时模式，这个停止点位于定时控件填写之前：到达弹窗不代表定时时间已经设置。

### 获得当轮授权后再提交

用户明确确认本轮的章节、作品、分卷和发布方式后，保留已核对的参数，移除停止标志，加入 `--confirm-publish`：

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --file "/path/to/chapters/第001章_启程.md" \
  --mode immediate \
  --confirm-publish
```

不要将 `--confirm-publish` 与 `--fill-only` 或 `--to-final-modal` 混用。每次执行命令都会重新进入处理流程，并非接着上一次停留的弹窗继续。

### 以章节管理页作为发布核验依据

“确认发布”点击后，回到章节管理并刷新，确认目标章节行存在，且状态为“审核中”或“已发布”。“审核中”表示已提交待审，不代表审核通过或已对读者可见。

**当前汇总有一项限制：** `BATCH_SUMMARY` 中的 `publishedVerified` 按“找到目标章节行”计数，代码未强制检查该行状态是否属于上述两种。因此，不能单凭 `ok: true`、计数增加或本地记录判定发布成功，仍需核对管理页实际状态。

## 批量与定时发布

### 批量即时发布

先预览整个目录，核对顺序和起始章节；完成单章页面核对并获得本轮批量授权后，再执行：

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --dir "/path/to/chapters" \
  --start-from "第014章" \
  --limit 3 \
  --mode immediate \
  --skip-published \
  --confirm-publish
```

`--start-from` 在文件名或标题中做子串匹配；**找不到时不会报错，而会从目录开头处理**。执行前必须从预览确认起点存在。首次批量建议保留较小的 `--limit`。

### 使用番茄后台原生定时发布

以下命令中的时间仅展示输入格式；执行前替换为用户确认的未来时间，并核对后台显示的日期和时间：

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --file "/path/to/chapters/第018章_启程.md" \
  --mode scheduled \
  --schedule-at "2026-11-01 21:00" \
  --confirm-publish
```

正确参数是 `--mode scheduled` 与 `--schedule-at`。脚本通过后台定时控件提交，不依赖外部 cron。输入不含时区，脚本按运行环境本地时间解析；它不会自动转换到作者后台的时区。

批量定时可将 `--file` 替换为 `--dir`，加入起点、数量和 `--schedule-step-minutes 30`，让后续章节依次间隔 30 分钟。每章都需核对管理页中的排程信息；排入队列不等于已经到时发布。

### 常用参数

| 参数 | 用途与边界 |
| --- | --- |
| `--file` / `--dir` | 选择单个章节或目录；使用绝对路径，二选一 |
| `--volume "分卷名"` | 从章节管理页选择分卷后新建章节；分卷应已存在 |
| `--start-from "第014章"` | 从匹配文件名或标题的章节开始，未匹配会从头处理 |
| `--limit 3` | 限制本轮候选章节数量 |
| `--skip-published` | 跳过本地章节记录中已存在的文件路径，不会查询后台去重 |
| `--daily-limit-chars 50000` | 即时模式的本轮累计字符数保护阈值，默认 50,000 |
| `--already-published-chars 12000` | 人工提供今天已发字符数，与保护阈值合用 |
| `--schedule-step-minutes 30` | 批量定时的逐章间隔，默认 30 分钟 |

停止模式和正式发布标志见上文。完整命令与流程说明见 [`SKILL.md`](./SKILL.md)，实际参数行为以发布脚本为准。

## 如何报告执行结果

以下名称用于区分操作阶段，不是脚本统一返回的状态枚举：

| 结果 | 判定依据 |
| --- | --- |
| `preview-only` | 只显示本地章节解析结果，未操作后台 |
| `fill-only` | 编辑器已填写，未提交发布 |
| `to-final-modal` | 到达最终发布弹窗，未点击“确认发布” |
| `submitted-unverified` | 已点击提交，但缺少目标章节行或预期状态的管理页证据 |
| `published-verified` | 提交后刷新管理页，目标行存在且状态为“审核中”或“已发布” |
| `login-expired-or-timeout` | 会话失效或扫码超时，需要重新登录 |
| `input-validation-failed` | 正文回读不一致或输入校验失败，应修正后再继续 |
| `error` | 缺少依赖、连接失败、页面异常或其他未完成的错误 |

## 安全边界与本地记录

- **授权按轮次确认。** 预览、填充或到达弹窗，都不构成真实发布授权；正式发布必须得到当前用户当轮明确确认。
- **字符上限是操作保护。** 50,000 字符/日来自项目操作经验，不是官方配额；当前保护只应用于 `immediate` 模式，也不会自动读取账号今天已发的字数。
- **定时修改要留出余量。** 项目记录过后台提示“请在发布时间前30分钟提交修改内容，否则无法完成修改”。遇到该提示，应将该章节视为已进入不可安全修改的窗口。
- **选择器随后台变化。** 页面结构变化时先检查真实页面，再更新共享选择器和脚本，重新进行单章填充核对。

运行时文件都保存在本地 `state/` 下，该目录已加入 `.gitignore`：

| 路径 | 内容 |
| --- | --- |
| `state/fanqie-storage-state.json` | 可复用的浏览器登录态，按敏感凭据保护 |
| `state/login-qr.png` | 扫码登录二维码截图 |
| `state/publish-state.json` | 章节记录；当前实现找到目标行后即记录 |
| `state/screenshots/` | 填充、弹窗及发布后管理页等阶段截图 |

不要提交或公开登录态、二维码、用户章节及后台截图。本地去重以文件路径为依据，移动文件或换用另一份状态记录后，应重新核对后台已有章节。

## 接入 AI Agent

仓库提供以下指导入口，共享同一套章节解析、登录和发布脚本：

| 使用环境 | 入口 |
| --- | --- |
| OpenClaw / Hermes Agent | [`SKILL.md`](./SKILL.md) 技能定义 |
| Claude Code | [`CLAUDE.md`](./CLAUDE.md) 项目适配说明 |
| Codex CLI | [`AGENTS.md`](./AGENTS.md) 项目适配说明 |
| Cline | [`.clinerules`](./.clinerules) 项目适配说明 |

将所用 Agent 指向对应入口，并让它先读取共享工作流和安全规则。接入指导文件后，依赖、浏览器连接、人工扫码和发布确认仍需分别完成。

## 遇到问题时

**连接失败或缺少登录态**：先确认 CDP 地址和浏览器调试端口可访问，再运行 `node scripts/login_fanqie.js --cdp http://127.0.0.1:9222`。登录脚本默认连接该地址，并不自动启动浏览器。

**出现 `Unicode 一致性校验失败`**：查看原文编码和回读差异，结合编辑器截图检查中文、Emoji、空行和段落；修正后重新填充，不能将失败降格为成功。

**分卷或弹窗不符合预期**：暂停当前流程，核对作品配置和当前页面，查看[分卷与发布工作流](./references/workflow.md)及[选择器说明](./references/selectors.md)。需要指定分卷时，通过 `--volume` 走“章节管理 → 选分卷 → 新建章节”路径。

**提交后未找到章节**：先去管理页查询，不要直接重跑。脚本对部分页面状态错误会自动重试一次；缺少核验结果时，仍有重复提交风险。

## 按任务查阅文档

| 想做什么 | 阅读入口 |
| --- | --- |
| 查看完整技能规则与批量命令 | [`SKILL.md`](./SKILL.md) |
| 理解章节命名、标题拆分与正文处理 | [`references/data-format.md`](./references/data-format.md) |
| 核对分卷、拦截弹窗和最终发布步骤 | [`references/workflow.md`](./references/workflow.md) |
| 处理后台改版或元素定位问题 | [`references/selectors.md`](./references/selectors.md) |
| 排查编辑器输入与页面结构 | [`references/editor-recon.md`](./references/editor-recon.md) |
| 确认发布参数及当前实现 | [`scripts/publish_fanqie.js`](./scripts/publish_fanqie.js) |

## 许可证

本项目采用 [MIT 许可证](./LICENSE)。
