// 配置状态层：唯一事实源 + 存储持久化 + 订阅通知
// 依赖注入：storage（get/set/remove）、bgColors、widths、isSystemDarkMode

export const DEFAULTS = {
    widthIdx: 0,
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

// 旧版单键 bgIdx 的索引 → 主题名表（仅用于迁移；主题清单调整后旧索引不可直接复用）
const LEGACY_BG_NAMES = [
    'Claude 暖白', 'Claude 米杏', 'Claude 浅棕', '杏仁黄', '海天蓝',
    '暗夜黑', '深墨蓝', '墨绿', '暗蓝灰', '墨黛蓝', '暗橄榄', '暮云灰'
];

export function createStore({ storage, bgColors, widths, isSystemDarkMode }) {
    const values = { ...DEFAULTS };
    const listeners = [];

    // 主题按系统深浅色分键记忆（lightBgIdx / darkBgIdx）：各模式记住上次使用的
    // 主题，跨会话保持。模式默认 = 该类型清单的首个主题（"系统默认"）。
    // bgIdx 是运行时激活索引（theming / panel 直接读取），由 load /
    // applySystemMode / setActiveBg 维护，本身不持久化
    const MODE_KEYS = { light: 'lightBgIdx', dark: 'darkBgIdx' };
    const MODE_DEFAULTS = {
        [MODE_KEYS.light]: bgColors.findIndex((c) => c.type === 'light'),
        [MODE_KEYS.dark]: bgColors.findIndex((c) => c.type === 'dark')
    };

    function get(key) {
        return values[key];
    }

    function set(key, value) {
        if (values[key] === value) return;
        values[key] = value;
        // bgIdx 为运行时值；持久化由 setActiveBg 按主题所属模式的键写入
        if (key !== 'bgIdx') storage.set(key, value);
        listeners.forEach((fn) => fn(key, value));
    }

    // 订阅配置变化：fn(key, value)；load 完成后触发 fn('loaded')
    function subscribe(fn) {
        listeners.push(fn);
    }

    function isValidModeIdx(idx, type) {
        return Number.isInteger(idx) && idx >= 0 && idx < bgColors.length
            && bgColors[idx].type === type;
    }

    // 旧版单键迁移：按旧索引的名称在新清单中查找主题，写入其所属模式的键；
    // 名称已被删除的主题（如杏仁黄）保持该模式默认。另一模式无旧值可依，用默认。
    // 双键共存时旧值优先（仅版本来回降级会出现）——降级页面写入 bgIdx 代表
    // 用户更新的选择。迁移完成后删除旧键
    async function migrateLegacyBgIdx() {
        const legacy = await storage.get('bgIdx', null);
        if (legacy === null) return;
        if (Number.isInteger(legacy) && legacy >= 0 && legacy < LEGACY_BG_NAMES.length) {
            const idx = bgColors.findIndex((c) => c.name === LEGACY_BG_NAMES[legacy]);
            if (idx >= 0) values[MODE_KEYS[bgColors[idx].type]] = idx;
        }
        storage.remove('bgIdx');
    }

    async function load() {
        const defaults = { ...DEFAULTS, ...MODE_DEFAULTS };
        for (const key of Object.keys(defaults)) {
            values[key] = await storage.get(key, defaults[key]);
        }
        await migrateLegacyBgIdx();
        // 校验模式键：越界或类型不符（如浅色键指向深色主题的脏数据）回退模式默认
        for (const type of ['light', 'dark']) {
            const key = MODE_KEYS[type];
            if (!isValidModeIdx(values[key], type)) values[key] = MODE_DEFAULTS[key];
        }
        // 激活索引 = 当前系统模式的记忆值。此处读 body class 是安全的（启动时
        // 已稳定）；运行期的系统切换由 applySystemMode 以事件携带的模式更新
        values.bgIdx = isSystemDarkMode() ? values.darkBgIdx : values.lightBgIdx;
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

    // 当前系统模式下可用的主题色。
    // forceDark：系统切换事件发生时必须传入事件携带的新模式——事件先于微信读书
    // 更新 body.wr_whiteTheme，此刻 isSystemDarkMode() 读到的是旧模式
    function getAvailableColors(forceDark) {
        const isDark = forceDark !== undefined ? forceDark : isSystemDarkMode();
        return bgColors.filter((c) => (isDark && c.type === 'dark') || (!isDark && c.type === 'light'));
    }

    // 当前主题色在可用列表中的索引。按对象身份匹配（indexOf）而非名称——
    // "系统默认"在浅色/深色清单中各有一个，名称查找恒命中浅色那个
    function getCurrentColorIndex() {
        const available = getAvailableColors();
        const current = bgColors[get('bgIdx')];
        const idx = available.indexOf(current);
        return idx >= 0 ? idx : 0;
    }

    // 更新激活主题：写运行时 bgIdx 并持久化到主题所属模式的键。归属由主题自身
    // 的 type 决定而非 body class——系统切换过渡期 body class 是旧值，读它会写错键
    function setActiveBg(idx) {
        const key = MODE_KEYS[bgColors[idx].type];
        values[key] = idx;
        storage.set(key, idx);
        set('bgIdx', idx);
    }

    // 在可用主题色间循环切换。available 的元素是 bgColors 的原对象引用，
    // indexOf 按身份解析索引——按名称 findIndex 会恒命中首个同名主题
    //（"系统默认"浅色/深色各一个）
    function cycleTheme(delta) {
        const available = getAvailableColors();
        const currentIdx = getCurrentColorIndex();
        const nextIdx = (currentIdx + delta + available.length) % available.length;
        const next = available[nextIdx];
        setActiveBg(bgColors.indexOf(next));
    }

    // 系统深浅色切换后恢复目标模式记住的主题（首次进入该模式时为其默认）。
    // isDark 必须是事件携带的新模式——过渡期 body class 尚未翻转，
    // isSystemDarkMode() 读到的是旧值。不写存储：记忆值已在模式键里
    function applySystemMode(isDark) {
        set('bgIdx', get(isDark ? MODE_KEYS.dark : MODE_KEYS.light));
    }

    // 启动校正安全网：当前模式的记忆值无效时回退模式默认并同步激活索引。
    // 仅限启动时调用（body class 已稳定，见 content.js 的 init）；勿在系统切换
    // 过渡期或 store 订阅回调里调用——会把调用方刚设置的主题改回去
    function ensureThemeAvailable() {
        const isDark = isSystemDarkMode();
        const type = isDark ? 'dark' : 'light';
        const key = MODE_KEYS[type];
        if (isValidModeIdx(values[key], type)) return false;
        values[key] = MODE_DEFAULTS[key];
        set('bgIdx', MODE_DEFAULTS[key]);
        return true;
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
        cycle, cycleTheme, ensureThemeAvailable, applySystemMode,
        getAvailableColors, getCurrentColorIndex,
        toggleAutoMode, handleAction
    };
}
