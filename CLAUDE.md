# 微信读书 · 悦读助手

Chrome 扩展（Manifest V3），注入 `weread.qq.com` 阅读器页面，提供宽屏显示、主题颜色、沉浸式阅读、自动阅读、配置持久化等功能。

- 内容脚本入口：`chrome-extension/content.js`（阅读器页面，薄入口）、`chrome-extension/douban.js`（首页）
- 模块：`chrome-extension/lib/`（preferences / theming / auto-reader / panel / navigation / debug / douban-parser，ES module，经 dynamic import 按需加载）
- 后台：`chrome-extension/background.js`（service worker）
- 存储：`chrome.storage`（permissions: `storage`）
- 测试：`npm test`（node:test，零依赖零构建；用例在 `tests/`）

## Agent skills

### Issue tracker

问题和 spec 以 markdown 文件形式存放在 `.scratch/` 下。详见 `docs/agents/issue-tracker.md`。

### Domain docs

单上下文结构——仓库根目录一个 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。
