# 贡献指南

感谢你考虑为 Prism 贡献代码！

## 如何贡献

### 报告问题

- 使用 [GitHub Issues](https://github.com/liufu/prism/issues)
- 描述复现步骤、预期行为和实际行为
- 附上系统信息（macOS / Windows / Linux 版本）

### 提交代码

1. Fork 本仓库
2. 创建你的特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: description'`
4. 推送到分支：`git push origin feature/my-feature`
5. 创建一个 Pull Request

### 提交信息规范

请遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` — 新功能
- `fix:` — Bug 修复
- `refactor:` — 代码重构
- `docs:` — 文档更新
- `style:` — 样式调整
- `chore:` — 构建/工具变更

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发模式
npm run tauri dev

# 构建
npm run tauri build
```

### 代码风格

- JavaScript: ES Modules，使用 2 空格缩进
- Rust: `cargo fmt` + `cargo clippy`
- CSS: 跟随项目中已有的自定义属性规范

## 项目架构

前端是**纯 Vanilla JavaScript**（无框架），通过 `@tauri-apps/api` 的 `invoke()` 调用 Rust 后端。Rust 端由一个 JSONL 解析引擎和 4 个 Tauri command 组成。新功能应遵循此分层模式。

## 协议

参与本项目即表示你同意将贡献内容以 [MIT License](LICENSE) 授权。
