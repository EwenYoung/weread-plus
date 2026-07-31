# 02-autoMode 纯开关化 + 删除连续滚动 + 空格键修复

Type: task
Status: open
Blocked by: 01

## 目标
修正 autoMode 双重语义（开关 + 滚动方式选择）导致的 bug，使行为与用户确认的语义一致。

## 涉及文件
- `chrome-extension/content.js`
- `CONTEXT.md`

## 背景（用户确认的需求）
「自动模式」是**开关**：开启后可设置滚动步长/滚动间隔/自动停止，用空格键控制开始/暂停；关闭后**不能再自动滚动**（空格键也无效）。面板文案保留"开启/关闭"。自动模式开启 = 逐页滚动。

## 改动内容
- **删除连续滚动分支**：`startAutoScroll` 中 `autoMode === 1` 的平滑滚动代码（当前 content.js:510-517）整体删除；`startAutoScroll` 不再分支，统一走逐页滚动（`startAutoScrollInterval`）
- **空格键修复**：`initSpaceKeyHandler` 增加检查——`autoMode === 1`（关闭）时直接 return，不响应空格
- **面板行为确认**：`handlePanelClick` 中 `autoMode` case 语义不变（切换 0/1 + `stopAutoScroll` + 切换 `wr-auto-on` class），确认与开关语义一致；「开始阅读」按钮在关闭时不可见（现状已如此，`wr-auto-on` 控制）
- **CONTEXT.md 更新**：删除「连续滚动模式」概念条目；「自动阅读」下 autoMode 改为开关语义（0=开启→逐页滚动，1=关闭→禁用）；同步「逐页滚动模式」定义（对应 autoMode 0）

## 验收标准
- 手动验证：autoMode=关闭 → 按空格不滚动；autoMode=开启 → 空格可开始/暂停
- 自动模式关闭时面板不显示步长/间隔/停止配置与开始按钮
- `autoMode === 1` 在代码中不再有任何滚动逻辑分支
- CONTEXT.md 与代码语义一致

## Comments
