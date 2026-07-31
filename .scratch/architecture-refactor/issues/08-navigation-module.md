# 08-navigation 模块（C1/C6）：SPA 导航 + 模式监听 + 统一刷新流

Type: task
Status: open
Blocked by: 07

## 目标
把 init 里的监听器丛林（matchMedia、body class observer、history 劫持、内容区 DOM observer、定时兜底）搬进 `lib/navigation.js`，并用统一刷新流替代手工定时器数组。

## 涉及文件
- 新增 `lib/navigation.js`
- `chrome-extension/content.js`（删除搬走的代码）

## 改动内容
1. **interface**：`createNavigation({ store, theming, doc, win })` → `{ start() }`
2. **搬入逻辑**：
   - SPA 导航监听（history.pushState/replaceState 劫持 + popstate）
   - 系统偏好监听（`prefers-color-scheme`）+ 微信读书主题监听（body/html class observer）
   - 内容区 DOM observer（`.readerContent` 重建检测）
   - `handleSystemModeChange`（模式变化 → 换主题色 → 通知重应用）
   - 初始 `tryObserve` 轮询
3. **StyleRefresher（C6）**：统一节流 + 延时重试策略，替代 `_modeRetryTimers` 数组（现 300/800/1500ms 三次重试）；各类事件统一入口，重试策略单一实现
4. 模式变化 → `store.set('bgIdx', 新主题色)` → theming 经订阅自动重应用（D4，消除手动 applyBgColor 调用）

## 验收标准
- content.js 不再含监听/导航代码
- SPA 翻页、系统深浅色切换、双栏/滚动切换后样式正确重应用（冒烟见 ticket 10）
- 无 `_modeRetryTimers` 式全局数组残留

## Comments
