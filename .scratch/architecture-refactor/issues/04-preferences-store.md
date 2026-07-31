# 04-PreferencesStore（C2）：状态收敛 + 订阅机制

Type: task
Status: open
Blocked by: 03

## 目标
把 10+ 裸 `let` 配置状态与「改状态→写存储→重应用→重建面板」四步仪式收敛为一个深度模块；消灭面板魔法字符串协议。

## 涉及文件
- 新增 `lib/preferences.js`
- 新增 `tests/preferences.test.js`
- `chrome-extension/content.js`（状态读取/写入改为走 store；**本 ticket 不改模块结构，仅替换状态层**）

## 改动内容
1. **interface**：
   - `createStore({ storage })` → `{ load(), set(key, value), get(key), subscribe(fn), cycle(key, delta) }`
   - `set()`：更新内存 + 写 storage + 通知订阅者
   - `cycle(key, delta)`：预设数组环绕循环（现 `cyclePreset`），支持 `scrollStep`/`scrollInterval`/`autoStopMinutes`
   - `storage` 为注入依赖（生产传 `chrome.storage.local`，测试传 fake）
2. **面板 key 协议收敛**：`'bg_next'`/`'scrollStep_prev'` 等映射进 store 内部方法（如 `cycleTheme(delta)`、`setAutoMode()`），魔法字符串只存在于 store 一处
3. **颜色过滤逻辑迁移**：`getAvailableColors`/`getCurrentColorIndex` 迁入 store（或纯函数挂 lib），「颜色不可用回退到第一个」的重复逻辑（现 handleSystemModeChange 与 updatePanelDisplay 两处）合并为 store 内一个函数
4. **content.js 接入**：初始化 `createStore` + `load()`；各函数改读 `store.get()`，面板回调改调 store 方法
5. 测试：fake storage 注入——load 默认值、set 写存储并通知、cycle 环绕/越界、主题色过滤与回退

## 验收标准
- `npm test` 全绿（store 测试覆盖核心路径）
- content.js 中不再有直接读写 `chrome.storage` 的代码
- 面板点击各按钮行为不变（手动冒烟见 ticket 10）

## Comments
