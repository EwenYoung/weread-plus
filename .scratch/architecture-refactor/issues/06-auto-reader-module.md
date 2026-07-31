# 06-auto-reader 模块（C1）：自动阅读

Type: task
Status: open
Blocked by: 05

## 目标
把自动阅读（滚动、翻页、空格键控制）从 content.js 搬进 `lib/auto-reader.js`。

## 涉及文件
- 新增 `lib/auto-reader.js`
- `chrome-extension/content.js`（删除搬走的代码）
- `lib/preferences.js`（订阅配置：scrollStep / scrollInterval / autoStopMinutes / autoMode）

## 改动内容
1. **interface**：`createAutoReader({ store, doc, win })` → `{ start(), stop(), toggle(), isRunning(), initSpaceKey() }`
2. **搬入逻辑**：`findNextPageButton` / `tryTurnPage` / `startAutoScrollInterval` / `startAutoScroll`（**已无连续滚动分支**，ticket 02 后） / `stopAutoScroll` / 自动停止计时 / `initSpaceKeyHandler`
3. **空格键检查 autoMode**：`initSpaceKey` 内——`store.get('autoMode') === 1`（关闭）时忽略按键（ticket 02 的修复随逻辑迁入）
4. 运行时状态（`autoScrollFlag`、定时器 id）留在模块内部闭包，不暴露
5. 面板需要 `isRunning()` 读状态（panel 直调，D4）

## 验收标准
- content.js 不再含自动阅读代码
- 逐页滚动/翻页/自动停止/空格键控制行为不变（冒烟见 ticket 10）
- `isRunning()` 供 panel 使用

## Comments
