import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, PRESETS } from '../chrome-extension/lib/preferences.js';

// 名称与生产清单保持一致（迁移按名称映射，测试需能命中）
const BG_COLORS = [
    { name: '系统默认', rgb: null, type: 'light' },
    { name: 'Claude 暖白', rgb: '#FAF5EE', type: 'light' },
    { name: 'Claude 米杏', rgb: '#F0E6D3', type: 'light' },
    { name: '系统默认', rgb: null, type: 'dark' },
    { name: '暗夜黑', rgb: '#1a1a2e', type: 'dark' },
    { name: '深墨蓝', rgb: '#16213e', type: 'dark' }
];
const WIDTHS = [{ title: '默认', width: '' }, { title: '宽屏', width: '100%' }];

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        get: async (key, def) => (data[key] !== undefined ? data[key] : def),
        set: (key, value) => { data[key] = value; },
        remove: (key) => { delete data[key]; }
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

test('load：读取存储值，缺省用默认值（含各模式默认主题）', async () => {
    const store = makeStore({ initial: { scrollStep: 5 } });
    await store.load();
    assert.equal(store.get('widthIdx'), 0);
    assert.equal(store.get('scrollStep'), 5);
    assert.equal(store.get('scrollInterval'), 30);
    assert.equal(store.get('lightBgIdx'), 0); // 浅色默认 = 系统默认
    assert.equal(store.get('darkBgIdx'), 3);  // 深色默认 = 系统默认
});

test('load：激活索引取当前系统模式的记忆值', async () => {
    const light = makeStore({ isDark: false, initial: { lightBgIdx: 2 } });
    await light.load();
    assert.equal(light.get('bgIdx'), 2);
    const dark = makeStore({ isDark: true, initial: { darkBgIdx: 5 } });
    await dark.load();
    assert.equal(dark.get('bgIdx'), 5);
});

test('load：模式键越界或类型不符回退模式默认', async () => {
    const store = makeStore({ initial: { lightBgIdx: 99, darkBgIdx: 1 } }); // 1 是浅色主题
    await store.load();
    assert.equal(store.get('lightBgIdx'), 0); // 越界 → 浅色默认
    assert.equal(store.get('darkBgIdx'), 3);  // 类型不符 → 深色默认
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

test('set：bgIdx 为运行时值，不写入存储', async () => {
    const storage = fakeStorage();
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => false });
    await store.load();
    store.set('bgIdx', 2);
    assert.equal(store.get('bgIdx'), 2);
    assert.equal(await storage.get('bgIdx', 'none'), 'none');
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

test('cycleTheme：浅色模式下只在浅色主题间循环并持久化到 lightBgIdx', async () => {
    const storage = fakeStorage();
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => false });
    await store.load();
    assert.equal(store.get('bgIdx'), 0); // 默认系统默认
    store.cycleTheme(1); // 系统默认 → Claude 暖白
    assert.equal(store.get('bgIdx'), 1);
    assert.equal(await storage.get('lightBgIdx', null), 1);
    store.cycleTheme(1); // → Claude 米杏
    assert.equal(store.get('bgIdx'), 2);
    store.cycleTheme(1); // 米杏 → 环绕回系统默认（浅色共 3 个）
    assert.equal(store.get('bgIdx'), 0);
    assert.equal(await storage.get('lightBgIdx', null), 0);
});

test('cycleTheme：深色模式下只在深色主题间循环并持久化到 darkBgIdx', async () => {
    const storage = fakeStorage();
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => true });
    await store.load();
    assert.equal(store.get('bgIdx'), 3); // 深色默认系统默认
    store.cycleTheme(1); // 系统默认 → 暗夜黑
    assert.equal(store.get('bgIdx'), 4);
    assert.equal(await storage.get('darkBgIdx', null), 4);
    assert.equal(await storage.get('lightBgIdx', null), null); // 不误写浅色键
});

test('cycleTheme：深色环绕回"系统默认"不误写浅色索引（回归：同名主题）', async () => {
    const storage = fakeStorage();
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => true });
    await store.load();
    store.set('bgIdx', 5); // 运行时切到深墨蓝（深色末位）
    store.cycleTheme(1); // 环绕 → 深色"系统默认"（idx 3，与浅色"系统默认"同名）
    assert.equal(store.get('bgIdx'), 3);
    assert.equal(await storage.get('darkBgIdx', null), 3);
    assert.equal(await storage.get('lightBgIdx', null), null); // 浅色记忆不被覆盖
});

test('applySystemMode：恢复各模式记忆的主题（首次进入用模式默认）', async () => {
    let isDark = false;
    const store = createStore({ storage: fakeStorage(), bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => isDark });
    await store.load();
    store.cycleTheme(2); // 系统默认 → Claude 米杏（浅色记忆）
    assert.equal(store.get('bgIdx'), 2);
    const events = [];
    store.subscribe((key) => events.push(key));
    isDark = true;
    store.applySystemMode(true); // 切深色 → 深色从未用过 → 模式默认
    assert.equal(store.get('bgIdx'), 3);
    isDark = false;
    store.applySystemMode(false); // 切回浅色 → 恢复记忆的米杏
    assert.equal(store.get('bgIdx'), 2);
    assert.deepEqual(events, ['bgIdx', 'bgIdx']);
});

test('load：迁移旧版 bgIdx（按名称映射到所属模式键）并删除旧键', async () => {
    const storage = fakeStorage({ bgIdx: 0 }); // 旧索引 0 = Claude 暖白
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => false });
    await store.load();
    assert.equal(store.get('lightBgIdx'), 1); // Claude 暖白
    assert.equal(store.get('bgIdx'), 1);
    assert.equal(store.get('darkBgIdx'), 3); // 深色无旧值 → 默认
    assert.equal(await storage.get('bgIdx', 'gone'), 'gone'); // 旧键已删
});

test('load：旧 bgIdx 为深色主题时写入 darkBgIdx', async () => {
    const storage = fakeStorage({ bgIdx: 5 }); // 旧索引 5 = 暗夜黑
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => true });
    await store.load();
    assert.equal(store.get('darkBgIdx'), 4); // 暗夜黑
    assert.equal(store.get('bgIdx'), 4);
    assert.equal(store.get('lightBgIdx'), 0); // 浅色保持默认
});

test('load：旧 bgIdx 为脏值时静默删键并走默认', async () => {
    const storage = fakeStorage({ bgIdx: 'abc' });
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => false });
    await store.load();
    assert.equal(store.get('lightBgIdx'), 0);
    assert.equal(store.get('darkBgIdx'), 3);
    assert.equal(await storage.get('bgIdx', 'gone'), 'gone');
});

test('load：旧 bgIdx 指向已删除主题（杏仁黄）时回退浅色默认', async () => {
    const storage = fakeStorage({ bgIdx: 3 }); // 旧索引 3 = 杏仁黄（新清单不存在）
    const store = createStore({ storage, bgColors: BG_COLORS, widths: WIDTHS, isSystemDarkMode: () => false });
    await store.load();
    assert.equal(store.get('lightBgIdx'), 0);
    assert.equal(await storage.get('bgIdx', 'gone'), 'gone');
});

test('ensureThemeAvailable：记忆值有效时不回退', async () => {
    const store = makeStore({ isDark: true, initial: { darkBgIdx: 4 } });
    await store.load();
    assert.equal(store.ensureThemeAvailable(), false);
    assert.equal(store.get('bgIdx'), 4);
});

test('ensureThemeAvailable：记忆值无效时回退模式默认并同步激活索引', async () => {
    const store = makeStore({ isDark: false });
    await store.load();
    store.set('lightBgIdx', 99); // 模拟脏数据
    assert.equal(store.ensureThemeAvailable(), true);
    assert.equal(store.get('lightBgIdx'), 0);
    assert.equal(store.get('bgIdx'), 0);
});

test('getAvailableColors：显式传 false 按浅色过滤（系统切换事件语义）', async () => {
    const store = makeStore({ isDark: true }); // body class 读作深色（尚未翻转）
    await store.load();
    assert.deepEqual(store.getAvailableColors(false).map((c) => c.name), ['系统默认', 'Claude 暖白', 'Claude 米杏']);
});

test('getAvailableColors：显式传 true 按深色过滤', async () => {
    const store = makeStore({ isDark: false });
    await store.load();
    assert.deepEqual(store.getAvailableColors(true).map((c) => c.name), ['系统默认', '暗夜黑', '深墨蓝']);
});

test('getAvailableColors：不传参沿用 body class 判断', async () => {
    const store = makeStore({ isDark: true });
    await store.load();
    assert.deepEqual(store.getAvailableColors().map((c) => c.name), ['系统默认', '暗夜黑', '深墨蓝']);
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
