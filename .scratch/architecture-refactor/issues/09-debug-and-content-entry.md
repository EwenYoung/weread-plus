# 09-debug.js 迁移 + content.js 薄入口化

Type: task
Status: open
Blocked by: 08

## 目标
诊断工具独立成文件；content.js 收尾为薄入口。

## 涉及文件
- 新增 `lib/debug.js`
- `chrome-extension/content.js`
- `manifest.json`（如 content_scripts 声明需要调整——预计不需要，lib 由 content.js dynamic import）

## 改动内容
1. **`lib/debug.js`**：`diagnosePage` 原样迁移 + `window.__wrDiag` 挂载（D5）
2. **content.js 薄入口**：
   - dynamic import：`lib/preferences.js` / `theming.js` / `auto-reader.js` / `panel.js` / `navigation.js` / `debug.js`
   - `init()` 编排：创建 store → load → 创建各模块 → theming.applyAll() → panel.build() → navigation.start() → autoReader.initSpaceKey()
   - 依赖注入：`chrome.storage.local`、`document`、`window`
   - 初始化流程保持 async（本就 async）

## 验收标准
- content.js 行数降到 ~100 行（仅导入与编排）
- `window.__wrDiag` 控制台可调，输出与重构前一致
- 扩展整体加载无报错

## Comments
