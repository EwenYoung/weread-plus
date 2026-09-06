# 悦读助手（weread-plus）

微信读书（weread.qq.com）增强 Chrome MV3 扩展：宽屏、主题颜色、沉浸式阅读、自动阅读、豆瓣与 Z-Library 搜索联动、电子书导出。提交、注释、文档全中文；提交信息用 `type: 描述`（feat/fix/chore/docs）。

## 架构约定

- 四个入口：`chrome-extension/content.js`（阅读器页薄入口，定义主题/宽度清单并装配 lib 模块）、`douban.js`（首页豆瓣搜索联动）、`zlib.js`（首页 Z-Library 搜索联动，面板在左侧）、`background.js`（service worker，代发跨域请求：豆瓣搜索、Z-Library 镜像轮询与微信读书图片资源——MV3 content script 不能跨域 fetch）。
- 模块在 `chrome-extension/lib/`，ES module 工厂 + 依赖注入：store/doc/win/配置清单由入口传入，模块顶层不触碰 chrome API 与 DOM，纯函数层（CSS 生成、解析、状态逻辑）才能被 `npm test`（node:test，零依赖零构建）直接测试。新代码保持这条分层。
- content script 动态加载模块必须 `import(chrome.runtime.getURL('lib/x.js'))`：相对路径以页面 URL 为基准，会解析到 weread 域下 404。
- 编码规范见根目录 `CLEAN-CODE.md`（Clean Code 规则集）：写代码、测试、重构、评审前先读，与本文件冲突时以本文件为准。

## 领域术语

- 命名领域概念（issue 标题、测试名、注释）时查 `CONTEXT.md`（仓库根词汇表）：用表内术语、避开其 _Avoid_ 项（如"自动阅读"而非"自动滚动"，"微信读书主题"≠"系统偏好"）；微信读书 DOM 容器与 UI 组件类名也以它为查询处。

## 问题追踪

- 问题与 spec 以 markdown 存放于 `.scratch/<feature-slug>/`，文件约定见 `docs/agents/issue-tracker.md`。

## 经验教训

<!-- retro-managed 区块由 retro 脚本维护，完整版见 .retro/，满 12 条时降级最旧条目 -->
<!-- retro-managed-start -->
- 滚动模式正文由 canvas 渲染且主题切换后不重绘，像素自愈 healReaderCanvases 是唯一可靠修法 [20260822-001]

- 基于微信读书类名的选择器会因改版静默失效：querySelectorAll 关键路径匹配为空必须打日志 [20260822-002]

- 本项目用户环境 matchMedia 深浅色 change 不触发，以 body class 观察者为主信号 [20260822-003]

- 主题增改必须过 canvas 自愈审计，三消费点都要有分支 [20260822-004]

- 主题索引按身份解析（bgColors.indexOf）：同名主题 findIndex 恒命中首个，测试必含环绕用例 [20260822-005]
<!-- retro-managed-end -->
