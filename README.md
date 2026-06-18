<h3 align="center">一个桌面端的 JSONL 数据浏览器</h3>

<p align="center">
  <strong>JSON · 对话 · Markdown</strong> — 三种视图，一份数据
</p>

<p align="center">
  <a href="#安装"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="">
  <img width="3338" alt="image" src="https://github.com/user-attachments/assets/7f97cd89-3fa9-4037-851e-8ce317541158" />
</picture>

---

## 这是什么

Prism 是一个桌面应用，用于浏览和检查 **JSONL 格式的 AI 训练/对话数据**。就像棱镜将白光分解为光谱，Prism 将每行 JSONL 数据拆解为 JSON 树、对话气泡、Markdown 渲染三种视角，帮助你在海量数据中快速定位和审阅内容。

### 典型使用场景

- 检查 SFT / RLHF 数据集中某条样本的对话质量
- 快速预览大模型的回答中的 Markdown / HTML / 代码块渲染效果
- 在数万条 JSONL 记录中搜索关键词并跳转

## 功能一览

| 功能                 | 说明                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| 虚拟滚动             | 数万条记录的流畅浏览，事件委托 + 绝对定位，只渲染可视区域                |
| 三视图切换           | JSON 树（可折叠 + 长文本自动换行缩进）/ 对话气泡 / 原始文本             |
| Markdown + HTML 预览 | 自动提取 assistant 回答中的 Markdown 和 HTML 代码块，iframe 安全沙箱渲染，支持刷新和全屏 |
| 关键词搜索           | 前端本地过滤 + Rust 后端全量内容深度搜索，结果下拉展示                   |
| Playground           | 粘贴 JSON / Markdown 实时预览，支持编辑，左右分栏，切换后保留状态        |
| 字段映射             | 支持 `{messages}`（对话）和 `{prompt, result}`（提示词）两种数据格式，可恢复默认     |
| 深色/浅色主题        | 一键切换（T），首次加载自动跟随系统主题，配置自动保存                     |
| 一键复制             | JSON 视图复制整条记录，对话视图复制单条消息，长文本复制原始内容           |
| 快捷键               | Cmd+O 打开，Cmd+F 搜索，↑↓ 导航条目，T 切换主题                          |
| 拖放打开             | 直接将 .jsonl 文件拖入窗口                                               |
| 文件统计             | 状态栏展示解析错误数，错误条目点击后显示原始内容和具体错误               |

## 界面

```
┌─ 工具栏 ────────────────────────────────────────────────────┐
│ [打开] sample.jsonl  ▾    [搜索...]   [</>] [⚙] [☀]         │
├────────┬────────────────────────┬───────────────────────────┤
│ 条目列表 │   JSON / 对话 / 原始    │   渲染预览 / 源码          │
│        │                        │                           │
│ #1     │ {                      │  ┌──────────────────┐    │
│ id_001 │   "task_id": "id_001", │  │ ## 回答            │    │
│ 3 msgs │   "messages": [        │  │                   │    │
│        │     {role:"user",...}  │  │ 这是回答内容...     │    │
│ #2     │   ]                    │  └──────────────────┘    │
│ id_002 │ }                      │                           │
│ ...    │                        │                           │
├────────┴────────────────────────┴───────────────────────────┤
│ 条目 1/1000          3 消息       2.4 KB       12.5 KB       │
└─────────────────────────────────────────────────────────────┘
```

## 安装

### 下载预编译版本

前往 [Releases](https://github.com/lxfu1/prism/releases) 下载对应平台的安装包。

> **macOS 用户注意**：由于没有 Apple 开发者签名，首次打开可能提示"已损坏，无法打开"。请在终端执行以下命令后重新打开：
>
> ```bash
> xattr -cr /Applications/Prism.app
> ```
>
> 如果尚未安装到 Applications，对下载的 dmg 文件执行：
>
> ```bash
> xattr -cr ~/Downloads/Prism_0.1.0_aarch64.dmg
> ```

### 从源码构建

**前置条件**

- [Rust](https://www.rust-lang.org/) >= 1.77.2
- [Node.js](https://nodejs.org/) >= 18
- 系统依赖（macOS 一般无需）：[Tauri 环境配置指南](https://v2.tauri.app/start/prerequisites/)

```bash
# 克隆仓库
git clone https://github.com/liufu/prism.git
cd prism

# 安装前端依赖
npm install

# 开发模式启动
npm run tauri dev

# 生产构建
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 支持的数据格式

Prism 支持两种 JSONL 格式，通过**字段映射设置**灵活适配。

### 对话格式（默认）

每条记录包含一个 `messages` 数组：

```jsonl
{
  "task_id": "conv_001",
  "messages": [
    {
      "role": "system",
      "content": "你是一个助手"
    },
    {
      "role": "user",
      "content": "你好"
    },
    {
      "role": "assistant",
      "content": "你好！有什么可以帮你的？"
    }
  ]
}
```

### 提示词格式

每条记录包含 `prompt` 和 `result` 字段：

```jsonl
{
  "task_id": "task_001",
  "prompt": "解释什么是 Rust",
  "result": "Rust 是一门系统编程语言..."
}
```

如果你的 JSONL 字段名不同（如 `id`、`conversation`、`answer`），可以通过工具栏齿轮按钮修改映射关系。

## Playground

点击工具栏 `</>` 按钮可打开 Playground——一个粘贴即预览的沙箱：

- **JSON 模式**：粘贴 JSON 字符串，使用与主视图相同的树形渲染器展示，含折叠/展开和长文本交互
- **Markdown 模式**：粘贴 Markdown 文本，实时渲染 GFM（代码高亮、表格、任务列表等）
- **实时编辑**：输入 300ms 防抖自动刷新，JSON 解析失败时显示具体错误信息
- **大文件保护**：JSON 超 500KB、Markdown 超 200KB 时自动截断并提示
- **状态保留**：切换回主视图后再打开，内容和 tab 状态保留

## 开发

```bash
# 代码检查
npm run lint          # ESLint
npm run format        # Prettier 格式化
npm run format:check  # 格式检查

# Rust 测试
cd src-tauri && cargo test
```

## 技术栈

| 层级          | 技术                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| 桌面框架      | [Tauri 2](https://v2.tauri.app/) (Rust + WebView)                           |
| 前端          | Vanilla JavaScript (ES Modules)                                             |
| 构建          | [Vite 5](https://vitejs.dev/)                                               |
| Markdown 渲染 | [marked](https://marked.js.org/) + [highlight.js](https://highlightjs.org/) |
| JSONL 解析    | Rust (serde_json + 流式读取)                                                |

## 项目结构

```
prism/
├── src/                      # 前端源码
│   ├── main.js               # 应用入口，状态管理，EventBus
│   ├── components/
│   │   ├── json-formatter.js # JSON 树形视图（折叠/展开 + 长文本自动换行 + 复制）
│   │   ├── chat-view.js      # 对话气泡视图（消息复制 + 展开/收起）
│   │   ├── markdown-preview.js # Markdown 渲染 + HTML iframe 预览（刷新/全屏）
│   │   └── playground.js     # 粘贴 JSON/Markdown 实时预览（状态保留）
│   ├── utils/
│   │   ├── event-bus.js      # 轻量组件通信
│   │   ├── escape-html.js    # XSS 安全转义（textContent + DOM）
│   │   ├── theme.js          # 深色/浅色主题切换
│   │   ├── settings.js       # 字段映射配置
│   │   ├── history.js        # 最近打开文件
│   │   └── resizer.js        # 面板拖拽分隔条
│   └── styles/
│       └── main.css          # 全局样式（深色/浅色主题变量）
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── lib.rs            # Tauri 应用配置
│   │   ├── main.rs           # 入口
│   │   ├── commands.rs       # 4 个 Tauri 命令
│   │   └── parser.rs         # JSONL 解析引擎 + 18 个单元测试
│   └── Cargo.toml
├── .github/workflows/ci.yml  # CI：lint + test + build
├── eslint.config.js          # ESLint 9 flat config
├── .prettierrc               # Prettier 格式化配置
├── index.html                # 入口 HTML
├── vite.config.js
└── package.json
```

## 贡献

欢迎提交 Issue 和 Pull Request。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 协议

[MIT](LICENSE)
