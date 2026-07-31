# 01-命名统一（C4）

Type: task
Status: open
Blocked by:

## 目标
纯重命名，零行为变化，让代码说 CONTEXT.md 的语言。

## 涉及文件
- `chrome-extension/content.js`
- `chrome-extension/douban.js`

## 改动内容
- 面板 label「背景颜色」→「主题颜色」（CONTEXT.md 明确 Avoid: 背景颜色）
- 面板 label「屏幕宽度」→「宽屏」
- `var` → `let` 全部统一（douban.js 中大量 `var` 一并处理）
- 去掉无意义 `_` 前缀：`_styleEl`/`_styleCache`/`_widthObserver`/`_widthRetryTimer`/`_applyingWidth`/`_colorObserver`/`_lastTextColor`/`_modeRetryTimers`/`_spaceKeyHandler`（`_applyWidthInline` 改名 `applyWidthInline`）
- `autoModes` 数组及其它与 CONTEXT.md 冲突的命名检查（**「开启/关闭」文案保留**，见 ticket 02）

## 验收标准
- `git diff` 仅重命名/换行符/语法等价变化，无逻辑改动
- 扩展在微信读书页面加载无报错，功能不变

## Comments
