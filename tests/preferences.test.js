import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, PRESETS } from '../chrome-extension/lib/preferences.js';

const BG_COLORS = [
    { name: '暖白', rgb: '#FAF5EE', type: 'light' },
    { name: '米杏', rgb: '#F0E6D3', type: 'light' },
    { name: '暗夜黑', rgb: '#1a1a2e', type: 'dark' },
    { name: '深墨蓝', rgb: '#16213e', type: 'dark' }
];
const WIDTHS = [{ title: '默认', width: '' }, { title: '宽屏', width: '100%' }];

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        get: async (key, def) => (data[key] !== undefined ? data[key] : def),
        set: (key, value) => { data[key] = value; }
    };
}

function makeStore({ initial = {}, isDark = false } = {}) {
    return createStore({
        storage: fakeStorage(initial),
        bgColors: BG_COLORS,
        widths: WIDTHS,
        isSystemDarkMode: () => isDark
    });
}

test('load：读取存储值，缺省用默认值', async () => {
    const store = makeStore({ initial: { scrollStep: 5 } });
    await store.load();
    assert.equal(store.get('widthIdx'), 0);
    assert.equal(store.get('scrollStep'), 5);
    assert.equal(store.get('scrollInterval'), 30);
});

test('load：bgIdx 越界被 clamp', async () => {
    const store = makeStore({ initial: { bgIdx: 99 } });
    await store.load();
    assert.equal(store.get('bgIdx'), BG_COLORS.length - 1);
});

test('load：完成后触发 loaded 通知', async () => {
    const store = makeStore();
    const events = [];
    store.subscribe((key) => events.push(key));
    await store.load();
    assert.deepEqual(events, ['loaded']);
});

test('set：写存储并通知订阅者', async () => {
    const storage = fakeStorage();
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => false });
    await store.load();
    const events = [];
    store.subscribe((key, value) => events.push([key, value]));
    store.set('autoMode', 1);
    assert.deepEqual(events, [['autoMode', 1]]);
    assert.equal(await storage.get('autoMode', null), 1);
});

test('set：相同值不通知', async () => {
    const store = makeStore();
    await store.load();
    let count = 0;
    store.subscribe(() => count++);
    store.set('autoMode', 0);
    assert.equal(count, 0);
});

test('cycle：预设环绕循环', async () => {
    const store = makeStore();
    await store.load();
    assert.equal(store.cycle('scrollStep', 1), 3);
    assert.equal(store.cycle('scrollStep', 1), 5);
    assert.equal(store.cycle('scrollStep', 1), 8);
    assert.equal(store.cycle('scrollStep', 1), 1); // 8 → 环绕到 1
    assert.equal(store.cycle('scrollStep', -1), 8); // 反向环绕
    assert.equal(store.cycle('autoStopMinutes', -1), 120); // 0 → 环绕到末位
});

test('cycle：未知 key 不改变', async () => {
    const store = makeStore();
    await store.load();
    assert.equal(store.cycle('nope', 1), undefined);
});

test('cycleTheme：浅色模式下只在浅色主题间循环', async () => {
    const store = makeStore({ isDark: false });
    await store.load();
    store.cycleTheme(1); // 0 暖白 → 1 米杏
    assert.equal(store.get('bgIdx'), 1);
    store.cycleTheme(1); // 1 → 0（环绕，浅色只有 2 个）
    assert.equal(store.get('bgIdx'), 0);
});

test('cycleTheme：深色模式下只在深色主题间循环', async () => {
    const store = makeStore({ isDark: true });
    await store.load();
    store.cycleTheme(1); // 0 暖白不可用 → 可用列表索引 0 → 深色第二个 深墨蓝
    assert.equal(store.get('bgIdx'), 3);
    store.cycleTheme(1); // 深墨蓝 → 环绕 → 暗夜黑
    assert.equal(store.get('bgIdx'), 2);
});

test('ensureThemeAvailable：不可用时回退到第一个可用色', async () => {
    const store = makeStore({ isDark: true, initial: { bgIdx: 0 } }); // 0 是浅色
    await store.load();
    assert.equal(store.ensureThemeAvailable(), true);
    assert.equal(store.get('bgIdx'), 2); // 深色第一个
});

test('ensureThemeAvailable：可用时不回退', async () => {
    const store = makeStore({ isDark: true, initial: { bgIdx: 2 } });
    await store.load();
    assert.equal(store.ensureThemeAvailable(), false);
    assert.equal(store.get('bgIdx'), 2);
});

test('getAvailableColors：显式传 false 按浅色过滤（系统切换事件语义）', async () => {
    const store = makeStore({ isDark: true }); // body class 读作深色（尚未翻转）
    await store.load();
    assert.deepEqual(store.getAvailableColors(false).map((c) => c.name), ['暖白', '米杏']);
});

test('getAvailableColors：显式传 true 按深色过滤', async () => {
    const store = makeStore({ isDark: false });
    await store.load();
    assert.deepEqual(store.getAvailableColors(true).map((c) => c.name), ['暗夜黑', '深墨蓝']);
});

test('getAvailableColors：不传参沿用 body class 判断', async () => {
    const store = makeStore({ isDark: true });
    await store.load();
    assert.deepEqual(store.getAvailableColors().map((c) => c.name), ['暗夜黑', '深墨蓝']);
});

test('handleAction：width 环绕并标记 reload', async () => {
    const store = makeStore();
    await store.load();
    assert.deepEqual(store.handleAction('width'), { reload: true });
    assert.equal(store.get('widthIdx'), 1);
});

test('handleAction：bg_next/bg_prev 循环主题', async () => {
    const store = makeStore();
    await store.load();
    store.handleAction('bg_next');
    assert.equal(store.get('bgIdx'), 1);
    store.handleAction('bg_prev');
    assert.equal(store.get('bgIdx'), 0);
});

test('handleAction：autoMode 切换', async () => {
    const store = makeStore();
    await store.load();
    store.handleAction('autoMode');
    assert.equal(store.get('autoMode'), 1);
});

test('handleAction：scroll 类动作标记 scrollRestart', async () => {
    const store = makeStore();
    await store.load();
    assert.deepEqual(store.handleAction('scrollStep_next'), { scrollRestart: true });
    assert.equal(store.get('scrollStep'), 3);
    assert.deepEqual(store.handleAction('autoStop_prev'), {});
    assert.equal(store.get('autoStopMinutes'), 120);
});

test('handleAction：未知 key 无副作用', async () => {
    const store = makeStore();
    await store.load();
    assert.deepEqual(store.handleAction('??'), {});
    assert.equal(store.get('widthIdx'), 0);
});

test('PRESETS 导出用于面板显示', () => {
    assert.ok(Array.isArray(PRESETS.scrollStep));
    assert.ok(PRESETS.scrollStep.includes(2));
});
