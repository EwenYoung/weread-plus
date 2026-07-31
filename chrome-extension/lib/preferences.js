// 配置状态层：唯一事实源 + 存储持久化 + 订阅通知
// 依赖注入：storage（get/set）、bgColors、widths、isSystemDarkMode

export const DEFAULTS = {
    widthIdx: 0,
    bgIdx: 0,
    autoMode: 0,
    scrollStep: 2,
    scrollInterval: 30,
    autoStopMinutes: 0
};

export const PRESETS = {
    scrollStep: [1, 2, 3, 5, 8],
    scrollInterval: [20, 30, 50, 80, 100],
    autoStopMinutes: [0, 10, 30, 60, 120]
};

export function createStore({ storage, bgColors, widths, isSystemDarkMode }) {
    const values = { ...DEFAULTS };
    const listeners = [];

    function get(key) {
        return values[key];
    }

    function set(key, value) {
        if (values[key] === value) return;
        values[key] = value;
        storage.set(key, value);
        listeners.forEach((fn) => fn(key, value));
    }

    // 订阅配置变化：fn(key, value)；load 完成后触发 fn('loaded')
    function subscribe(fn) {
        listeners.push(fn);
    }

    async function load() {
        for (const key of Object.keys(DEFAULTS)) {
            let v = await storage.get(key, DEFAULTS[key]);
            if (key === 'bgIdx') v = Math.min(v, bgColors.length - 1);
            values[key] = v;
        }
        listeners.forEach((fn) => fn('loaded'));
    }

    // 预设数组环绕循环
    function cycle(key, delta) {
        const presets = PRESETS[key];
        if (!presets) return get(key);
        let idx = presets.indexOf(get(key));
        if (idx === -1) idx = 0;
        const next = presets[(idx + delta + presets.length) % presets.length];
        set(key, next);
        return next;
    }

    // 当前系统模式下可用的主题色
    function getAvailableColors() {
        const isDark = isSystemDarkMode();
        return bgColors.filter((c) => (isDark && c.type === 'dark') || (!isDark && c.type === 'light'));
    }

    // 当前主题色在可用列表中的索引
    function getCurrentColorIndex() {
        const available = getAvailableColors();
        const current = bgColors[get('bgIdx')];
        const idx = available.findIndex((c) => c.name === current.name);
        return idx >= 0 ? idx : 0;
    }

    // 在可用主题色间循环切换
    function cycleTheme(delta) {
        const available = getAvailableColors();
        const currentIdx = getCurrentColorIndex();
        const nextIdx = (currentIdx + delta + available.length) % available.length;
        const next = available[nextIdx];
        set('bgIdx', bgColors.findIndex((c) => c.name === next.name));
    }

    // 当前主题色在系统模式下不可用时回退到第一个可用色，返回是否发生回退
    function ensureThemeAvailable() {
        const available = getAvailableColors();
        const current = bgColors[get('bgIdx')];
        if (!available.some((c) => c.name === current.name)) {
            set('bgIdx', bgColors.findIndex((c) => c.name === available[0].name));
            return true;
        }
        return false;
    }

    function toggleAutoMode() {
        set('autoMode', get('autoMode') === 0 ? 1 : 0);
    }

    // 面板 key 协议统一入口。返回动作副作用描述，供调用方执行运行时操作。
    function handleAction(key) {
        switch (key) {
            case 'width':
                set('widthIdx', (get('widthIdx') + 1) % widths.length);
                return { reload: true };
            case 'bg_next':
                cycleTheme(1);
                return {};
            case 'bg_prev':
                cycleTheme(-1);
                return {};
            case 'autoMode':
                toggleAutoMode();
                return {};
            case 'scrollStep_next':
                cycle('scrollStep', 1);
                return { scrollRestart: true };
            case 'scrollStep_prev':
                cycle('scrollStep', -1);
                return { scrollRestart: true };
            case 'scrollInt_next':
                cycle('scrollInterval', 1);
                return { scrollRestart: true };
            case 'scrollInt_prev':
                cycle('scrollInterval', -1);
                return { scrollRestart: true };
            case 'autoStop_next':
                cycle('autoStopMinutes', 1);
                return {};
            case 'autoStop_prev':
                cycle('autoStopMinutes', -1);
                return {};
        }
        return {};
    }

    return {
        get, set, subscribe, load,
        cycle, cycleTheme, ensureThemeAvailable, getAvailableColors, getCurrentColorIndex,
        toggleAutoMode, handleAction
    };
}
