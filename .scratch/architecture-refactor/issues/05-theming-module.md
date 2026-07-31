# 05-theming 模块（C1/C3）：宽屏 + 主题颜色 + 沉浸式

Type: task
Status: open
Blocked by: 04

## 目标
把样式应用（applyWidth / applyBgColor / applyImmersive / 样式注入与监听）从 content.js 搬进 `lib/theming.js`；完成宽屏选择器清单去重（3 处 → 1 处）。

## 涉及文件
- 新增 `lib/theming.js`
- 新增 `tests/theming.test.js`（CSS 生成纯函数）
- `chrome-extension/content.js`（删除搬走的代码，改为 `import()` + 初始化编排）
- `lib/preferences.js`（如需要暴露主题色列表给 store 外部使用，调整 interface）

## 改动内容
1. **选择器清单单一数据源**（C3 范围）：宽屏相关选择器（现 content.js:123-133 / 174-181 / 223-229 三处）收敛为 theming 内一份常量；CSS 注入层、内联层、observer 层共用
2. **CSS 生成纯函数**：`buildThemeCss(theme, layout)` / `buildImmersiveCss()` / `buildWidescreenCss()`——公共背景色选择器常量 + 双栏差异条件拼装（**不做 strategy 对象**，D6）
3. **样式注入/监听迁移**：`addStyle`/`getStyleEl` 内联、`startWidthObserver`/`stopWidthObserver`、`startColorObserver`/`stopColorObserver`、`reRenderCanvas` 一并搬入
4. **interface**：`createTheming({ store, doc, win })` → `{ applyAll(), applyWidth(), applyBgColor(), applyImmersive() }`；内部订阅 store 配置变化自动重应用
5. `doc`/`win` 注入（默认 `document`/`window`）以便 CSS 生成部分纯测试；DOM 操作不测试
6. 测试：CSS 生成函数断言（含双栏分支不含文字色、滚动分支含文字色、宽屏 CSS 包含全部去重后选择器）

## 验收标准
- `npm test` 全绿
- 宽屏/主题色/沉浸式在真实页面行为不变（冒烟见 ticket 10）
- content.js 不再含样式应用代码

## Comments
