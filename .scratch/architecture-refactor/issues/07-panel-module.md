# 07-panel 模块（C1）：控制面板

Type: task
Status: open
Blocked by: 06

## 目标
把控制面板（构建、交互、刷新）从 content.js 搬进 `lib/panel.js`。

## 涉及文件
- 新增 `lib/panel.js`
- `chrome-extension/content.js`（删除搬走的代码）

## 改动内容
1. **interface**：`createPanel({ store, autoReader, doc })` → `{ build() }`
2. **搬入逻辑**：`buildControlPanel` / `handlePanelClick`（key 协议已收敛进 store，ticket 04） / `updatePanelDisplay` / 面板 CSS 模板字符串（含深色模式变体）
3. **通信方式（D4）**：
   - 订阅 store → 配置变化自动刷新显示（替代手动 `updatePanelDisplay` 调用）
   - 开始/暂停按钮 → 直调 `autoReader.toggle()`，读 `autoReader.isRunning()` 渲染按钮态
   - 模式切换按钮监听（isNormalReader ↔ isHorizontalReader → 重建面板 + 通知 theming）逻辑迁入
4. 双栏模式隐藏宽屏/自动阅读控件的现有行为保留（`isDoubleColumnMode` 检测迁入 theaming 或 panel 内，实施时定）

## 验收标准
- content.js 不再含面板代码
- 面板交互行为不变（冒烟见 ticket 10）

## Comments
