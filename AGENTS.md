# 悦读助手（weread-plus）

微信读书（weread.qq.com）增强 Chrome MV3 扩展：宽屏、主题颜色、沉浸式阅读、自动阅读、豆瓣搜索联动。提交、注释、文档全中文；提交信息用 `type: 描述`（feat/fix/chore/docs）。

## 架构约定

- 三个入口：`chrome-extension/content.js`（阅读器页薄入口，定义主题/宽度清单并装配 lib 模块）、`douban.js`（首页豆瓣搜索联动）、`background.js`（service worker，代发跨域豆瓣请求——MV3 content script 不能跨域 fetch）。
- 模块在 `chrome-extension/lib/`，ES module 工厂 + 依赖注入：store/doc/win/配置清单由入口传入，模块顶层不触碰 chrome API 与 DOM，纯函数层（CSS 生成、解析、状态逻辑）才能被 `npm test`（node:test，零依赖零构建）直接测试。新代码保持这条分层。
- content script 动态加载模块必须 `import(chrome.runtime.getURL('lib/x.js'))`：相对路径以页面 URL 为基准，会解析到 weread 域下 404。

## 领域术语

- 命名领域概念（issue 标题、测试名、注释）时查 `CONTEXT.md`（仓库根词汇表）：用表内术语、避开其 _Avoid_ 项（如"自动阅读"而非"自动滚动"，"微信读书主题"≠"系统偏好"）；微信读书 DOM 容器与 UI 组件类名也以它为查询处。

## 问题追踪

- 问题与 spec 以 markdown 存放于 `.scratch/<feature-slug>/`，文件约定见 `docs/agents/issue-tracker.md`。

## 经验教训

<!-- retro:escalated 完整版见 .retro/，满 8 条时降级最旧条目 -->
- 滚动模式正文由 canvas 渲染且主题切换后不重绘、不响应 resize/display 切换；唯一可靠修法是像素自愈（theming.js healReaderCanvases）（2026-08-22，weread-canvas.md）
- 基于微信读书类名的选择器会因改版静默失效：querySelectorAll 关键路径匹配为空必须打日志，"修好的 bug 复发"多半是这（2026-08-22，weread-canvas.md）
- 本项目用户环境 matchMedia(prefers-color-scheme) change 不触发，系统主题检测以 body class 观察者为主信号（2026-08-22，weread-canvas.md）
- 新增主题状态/模式必须过 canvas 自愈审计（applyBgColor/healReaderCanvases/clearPluginTextColors 三消费点都要有分支）；"不干预"式跳过自愈会复活残留 bug，passthrough 改用方向性亮度判断（2026-08-22，weread-canvas.md）
- 主题索引必须按对象身份解析（bgColors.indexOf）：同名主题（"系统默认"双模式）下按名称 findIndex 恒命中首个；主题循环测试必须含环绕用例（2026-08-22，theme-system.md）
