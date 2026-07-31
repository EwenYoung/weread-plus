# Spec: 架构重构（结构化 · 模块化 · 命名统一 · 测试）

- 状态：**待确认**（2026-07-31，grilling 完成，等用户确认后实施）
- 范围：`chrome-extension/` 全部三个文件 + 新增 `lib/` 与 `tests/`

## 背景与目标

`content.js` 1140 行、7 个职责混居（存储、样式注入、宽屏、主题颜色、自动阅读、控制面板、导航监听），无内部 interface、无 seam、无法测试。本轮重构：

1. 拆分为深度模块，模块间显式 interface
2. 代码命名与 CONTEXT.md 领域词汇统一
3. 建立零依赖测试基建（node:test）

## 领域词汇（沿用 CONTEXT.md）

控制面板 / 宽屏 / 主题颜色 / 自动阅读 / 逐页滚动 / 滚动步长 / 滚动间隔 / 自动停止 / 滚动模式（isNormalReader）/ 双栏模式（isHorizontalReader）/ 微信读书主题 / 系统偏好 / 样式注入 / 样式监听 / SPA 导航 / 配置持久化 / 页面诊断（`window.__wrDiag`）

## 决策记录（grilling 结论）

### D1 模块加载方式（Q1）
MV3 内容脚本无法静态 `import`，采用 **dynamic `import()`**（Chrome 92+）。`lib/` 下为标准 ES module，content.js/douban.js 通过 `import()` 加载；Node 测试直接 `import`。**不用**构建工具、**不用**命名空间+双导出。

### D2 行为变更（Q2）
- **存储 key 不变**：`widthIdx` / `bgIdx` / `autoMode` / `scrollStep` / `scrollInterval` / `autoStopMinutes`（零迁移成本）
- **autoMode 纯开关化**：`autoMode` = 自动模式开关（0=开启，1=关闭），**不再是滚动方式选择**。面板文案保留"开启/关闭"
- **删除连续滚动分支**：`autoMode===1` 时的平滑滚动代码（content.js:510-517）整体删除；自动模式开启 = 逐页滚动
- **修复空格键 bug**：autoMode 关闭时空格键不响应（当前 bug：`initSpaceKeyHandler` 不检查 autoMode，关闭后按空格仍会滚动）
- **保留**：宽屏切换 1.5s 后 `location.reload()`（Canvas 渲染兜底，本轮不动）
- **CONTEXT.md 同步更新**：「连续滚动模式」概念删除；autoMode 改为开关语义

### D3 测试范围（Q3）
- 纯逻辑单测：`node:test` + `assert`，**零依赖零构建**
- 测试对象：PreferencesStore（fake chrome.storage）、CSS 生成器、豆瓣 parseResults、预设循环、颜色过滤与回退
- **不做**：jsdom（DOM 层模拟度差）、Playwright 端到端（需要登录态）
- DOM 真实行为靠手动冒烟清单（ticket 10）

### D4 模块通信（Q4-3）
- **配置走订阅**：`PreferencesStore.set()` 写存储 + 通知订阅者（theming 自动重应用、panel 自动刷新）
- **运行时走直调**：`autoScrollFlag`/定时器不进 store，panel 直调 `autoReader.toggle()`
- **依赖单向无环**：
  ```
  content.js → 所有模块
  panel → preferences, auto-reader
  auto-reader → preferences
  theming → preferences
  navigation → preferences, theming, panel（模式切换后重建面板）
  ```
- subscribe 实现：`set()` 内遍历回调列表（约 5 行），不引入事件库

### D5 诊断工具（Q4-4）
`diagnosePage` / `window.__wrDiag` 移至 `lib/debug.js`，独立文件，不参与业务流。

### D6 C3 适配层范围（Q5）
- **做**：宽屏选择器清单去重（3 处 → 1 处单一数据源）
- **不做**：滚动/双栏 strategy 对象（两分支共享 80% 代码，抽象成类为对称而对称）；CSS 共享用**公共选择器常量 + 条件拼装**解决
- C6 刷新流（统一节流/重试）并入 `navigation.js`，不单独立模块

## 目标架构

```
chrome-extension/
├── content.js        # 薄入口：dynamic import + 初始化编排
├── douban.js         # 入口：豆瓣联动（保持不动，仅改用 import 加载解析器）
├── background.js     # 不变
├── lib/
│   ├── preferences.js   # PreferencesStore：load/set/subscribe + 存储适配 + 面板 key 协议
│   ├── theming.js       # 宽屏 + 主题颜色 + 沉浸式（CSS 生成纯函数 + 应用逻辑）
│   ├── auto-reader.js   # 自动阅读：start/stop/toggle、空格键（含 autoMode 检查）、翻页
│   ├── panel.js         # 控制面板：构建 + 交互 + 刷新（订阅 store）
│   ├── navigation.js    # SPA 导航 + 模式监听 + StyleRefresher（统一刷新流）
│   ├── debug.js         # 页面诊断 __wrDiag
│   └── douban-parser.js # 豆瓣 HTML 解析（纯函数）
tests/                # node:test 用例（与 lib 一一对应）
```

## 命名统一规则（C4）

- 与 CONTEXT.md 词汇一致；面板 label「背景颜色」→「主题颜色」；「屏幕宽度」→「宽屏」
- autoMode 文案「开启/关闭」**保留**（用户确认）
- 全部 `let`（去 `var`）；去掉无意义 `_` 前缀（`_styleEl`/`_colorObserver`/`_widthObserver`/`_modeRetryTimers`/`_spaceKeyHandler`）
- 状态变量统一从裸 `let` 收敛进 PreferencesStore（运行时状态除外：`autoScrollFlag` 等留 auto-reader 内部）

## 非目标（本轮不做）

- strategy 对象抽象（D6）
- jsdom / 端到端测试（D3）
- 存储 key 迁移、reload 行为改动（D2）
- background.js 重构、构建工具、代码压缩

## 实施顺序（tickets 01-10）

见 `.scratch/architecture-refactor/issues/`。原则：先行为变更（01-02）→ 测试基建（03）→ store 落地（04）→ 逐个搬模块（05-08）→ 收尾（09）→ 冒烟（10）。
