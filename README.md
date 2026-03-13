# fanqie-publisher

一个面向 **OpenClaw** 的番茄小说章节发布 Skill。

它的目标是：把本地整理好的 Markdown 章节，通过浏览器自动化方式提交到番茄作者后台，并支持单章发布、批量发布、平台原生定时发布、发布后状态校验等流程。

## 项目定位

这个仓库不是番茄官方 SDK，也不是公开 API 封装。
它本质上是一个 **OpenClaw Skill + Playwright 自动化方案**，用于把“本地章节文件 → 番茄作者后台发布”这条重复流程工具化。

适合的场景：

- 已经有结构化的章节 Markdown 文件
- 需要减少重复的后台填表操作
- 希望保留人工登录、平台原生发布链路
- 希望把立即发布 / 批量发布 / 定时发布流程脚本化

不适合的场景：

- 指望官方 API 直传
- 希望在完全无浏览器上下文的环境中运行
- 不接受浏览器自动化方案

## 当前能力

目前已经实现或验证过的能力：

- 解析本地 Markdown 章节文件
- 自动拆分章节号与章节标题
- 自动填写番茄章节编辑器
- 单章立即发布
- 批量立即发布
- 使用番茄后台原生“定时发布”创建待发布章节
- 发布后跳转章节管理页进行状态校验
- 通过 Playwright + CDP 接管已有浏览器会话
- 支持安全模式（只填充 / 只走到最终发布弹窗）

## 目录结构

```text
fanqie-publisher/
├── SKILL.md
├── README.md
├── scripts/
│   ├── prepare_chapters.py
│   ├── login_fanqie.js
│   ├── publish_fanqie.js
│   └── state.py
├── references/
│   ├── workflow.md
│   ├── selectors.md
│   ├── data-format.md
│   └── recon-notes-2026-03-12.md
├── package.json
└── .gitignore
```

## 核心脚本说明

### `scripts/prepare_chapters.py`
负责读取章节目录中的 Markdown 文件，并输出结构化章节数据。

当前默认支持的格式特征：

- 一个 `.md` 文件对应一章
- 标题通常位于第一行 Markdown 标题中
- 形如 `第001章 标题` 的标题会自动拆成：
  - 章节号：`1`
  - 标题：`标题`

### `scripts/login_fanqie.js`
负责连接浏览器并保存登录态。

适合场景：

- 本地有图形浏览器
- 或在 WSL 中通过 CDP 接管 Windows 浏览器

### `scripts/publish_fanqie.js`
主发布脚本，负责：

- 打开章节编辑页
- 自动填充标题 / 正文
- 处理中间拦截弹窗
- 进入最终发布弹窗
- 立即发布或定时发布
- 发布后去章节管理页校验状态

## 使用方式

### 1. 预览章节解析结果

```bash
python3 scripts/prepare_chapters.py --dir "/path/to/chapters" --preview
```

### 2. 保存登录态

如果通过 CDP 接管已有浏览器：

```bash
node scripts/login_fanqie.js --cdp http://127.0.0.1:9222
```

### 3. 单章安全填充（不发布）

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --file "/path/to/chapter.md" \
  --mode immediate \
  --fill-only
```

### 4. 单章立即发布

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --file "/path/to/chapter.md" \
  --mode immediate \
  --confirm-publish
```

### 5. 批量立即发布

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --dir "/path/to/chapters" \
  --start-from "第018章" \
  --limit 3 \
  --mode immediate \
  --confirm-publish
```

### 6. 使用番茄后台原生定时发布

```bash
node scripts/publish_fanqie.js \
  --cdp http://127.0.0.1:9222 \
  --dir "/path/to/chapters" \
  --start-from "第018章" \
  --limit 3 \
  --mode scheduled \
  --schedule-at "2026-03-13 21:00" \
  --schedule-step-minutes 30 \
  --confirm-publish
```

## 已知平台限制

### 1. 疑似单日发布字数上限

根据真实后台行为推断，番茄存在一个大约 **50,000 字 / 日** 的实际发布上限。

> 这是基于后台提示和真实操作经验的安全阈值，**不是当前 README 中引用的官方文档结论**。

脚本中已加入保护参数：

- `--daily-limit-chars`
- `--already-published-chars`

### 2. 定时发布的修改锁窗

如果后台提示：

```text
请在发布时间前30分钟提交修改内容，否则无法完成修改
```

应当视为：

- 该定时章节在接近发布时间时基本无法可靠修改
- 定时发布时间应尽量一次设置正确
- 不要假设临近发布时间还能安全调整内容或时间

### 3. 平台前置拦截弹窗

在点击“下一步”后，番茄后台可能出现多层中间弹窗，例如：

- 内容风险检测
- 错别字智能纠错
- 提交确认提示
- 编辑器版本冲突提示
- 引导浮层

这些拦截层会影响自动化稳定性，因此需要持续维护 selector 与处理逻辑。

## 安全与隐私

本仓库**不应提交**以下内容：

- 登录态文件
- 浏览器会话数据
- 后台截图
- 页面勘测产物
- `node_modules`
- 临时状态文件

这些内容应留在本地，并通过 `.gitignore` 排除。

## 当前项目状态

当前版本可以视为：

> **可实际使用的 v0.1.0 原型**

已经能完成真实发布流程，但仍然依赖：

- 页面结构稳定
- 本地浏览器可接管
- 对番茄后台交互细节的持续维护

换句话说，它已经不是“概念 demo”，但也还没有到“长期免维护产品”的程度。

## 后续可继续完善的方向

- 更稳的章节管理页状态解析
- 对“已排定时章节”的修改流程支持
- 更精细的错误分类和恢复策略
- 对更多弹窗/异常态的覆盖
- 更通用的项目配置方式（而不是靠脚本内常量）

## License

当前仓库未单独声明开源许可证。
如需公开分发或接受外部贡献，建议后续补充明确的 LICENSE。
