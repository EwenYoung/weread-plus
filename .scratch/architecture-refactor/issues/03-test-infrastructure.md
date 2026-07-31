# 03-测试基建：package.json + 纯逻辑提取 + node:test 用例

Type: task
Status: open
Blocked by: 02

## 目标
建立零依赖零构建测试基线，并把第一批纯逻辑提取为可 import 的模块。

## 涉及文件
- 新增 `package.json`（`"type": "module"`，`npm test` → `node --test`，零 dependencies）
- 新增 `lib/douban-parser.js`（从 douban.js 提取 `parseResults` 纯函数，不改逻辑）
- 新增 `tests/douban-parser.test.js`
- `chrome-extension/douban.js` 改用 `import()` 加载解析器（入口逻辑保持不变）

## 改动内容
1. `package.json`：仅 scripts，无依赖
2. `lib/douban-parser.js`：`parseResults(html)` 原样迁移（DOMParser 是标准 Web API，Node 22+ 可用；如 Node 版本不支持则用简单正则 mock 或仅测结构化逻辑——实施时验证）
3. `douban.js`：删除内联 parseResults，`import()` 引入
4. 测试用例覆盖：
   - 正常条目（标题/评分/作者/出版社/年份）
   - `.result-ad` 广告过滤
   - 封面 URL 处理（`//` 补全 `https:`、pixel/blank 占位符剔除）
   - 无 `.subject-cast` 时从 `.pl` 提取出版社/年份
   - 空结果

## 验收标准
- `npm test` 全绿
- `lib/douban-parser.js` 无 chrome.* / document 依赖（纯 DOM 解析）
- douban.js 功能不变（手动冒烟在 ticket 10 统一验证）

## Comments
