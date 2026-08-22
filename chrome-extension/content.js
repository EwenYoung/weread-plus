// 微信读书 · 悦读助手 — Chrome 插件版
// 从油猴脚本迁移，Manifest V3

(function() {
    'use strict';

    // ======================== 配置项 ========================
    const widths = [
        { title: "默认", width: "", alignItems: "flex-start", marginLeft: "" },
        { title: "宽屏", width: "100%", alignItems: "flex-end", marginLeft: "45.5%" },
    ];
    // rgb 为 null 表示"系统默认"：插件撤除配色覆盖，微信读书原生外观接管。
    // 每个模式的首个主题即该模式的默认状态
    const bgColors = [
        { name: "系统默认", rgb: null, type: "light" },
        { name: "Claude 暖白", rgb: "#FAF5EE", type: "light" },
        { name: "Claude 米杏", rgb: "#F0E6D3", type: "light" },
        { name: "Claude 浅棕", rgb: "#E8DCC8", type: "light" },
        { name: "Kami 纸白", rgb: "#f5f4ed", type: "light" },
        { name: "书页灰", rgb: "#DFDDD6", type: "light" },
        { name: "淡珊瑚粉", rgb: "#F7E8E4", type: "light" },
        { name: "草香", rgb: "#F5F8F3", type: "light" },
        { name: "系统默认", rgb: null, type: "dark" },
        { name: "暗夜黑", rgb: "#1a1a2e", type: "dark" },
        { name: "深墨蓝", rgb: "#16213e", type: "dark" },
        { name: "青夜", rgb: "#2A363F", type: "dark" },
        { name: "暗蓝灰", rgb: "#1e2d3d", type: "dark" },
        { name: "墨黛蓝", rgb: "#1a2a2e", type: "dark" },
        { name: "暗橄榄", rgb: "#1e2319", type: "dark" },
        { name: "暮云灰", rgb: "#252228", type: "dark" },
    ];
    const autoModes = ["开启", "关闭"];

    // ======================== 模式检测 ========================
    function isDoubleColumnMode() {
        // 双栏模式：按钮 class 为 isHorizontalReader
        return !!document.querySelector('.readerControls_item.isHorizontalReader');
    }

    function isSystemDarkMode() {
        // 微信读书通过 body 的 wr_whiteTheme class 标识浅色模式
        // 没有 wr_whiteTheme 时为深色模式
        return !document.body.classList.contains('wr_whiteTheme');
    }

    // ======================== 配置状态（PreferencesStore） ========================
    // chrome.storage.local callback 风格 → Promise 适配
    const chromeStorage = {
        get: (key, def) => new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key] !== undefined ? result[key] : def);
            });
        }),
        set: (key, value) => { chrome.storage.local.set({ [key]: value }); },
        remove: (key) => { chrome.storage.local.remove(key); }
    };

    let store = null;

    function onStoreChange(key) {
        if (key === 'loaded') return;
        // 面板显示刷新由 panel 模块自订阅处理；此处只处理样式与运行时副作用
        if (key === 'bgIdx') theming.applyBgColor();
        if (key === 'autoMode' && store.get('autoMode') === 1) autoReader.stop();
    }

    // ======================== 初始化（异步读取配置） ========================
    async function init() {
        console.log('[悦读助手 v1.0] 初始化');

        // 从 chrome.storage 读取配置（PreferencesStore）
        store.subscribe(onStoreChange);
        await store.load();

        // 启动时校正存储主题与系统模式的失配（如上次深色下退出、这次浅色打开）。
        // 此时 body class 已稳定，无切换过渡期竞态（勿在 store 订阅回调里调用，
        // 见 preferences.js 中 ensureThemeAvailable 的警示注释）
        store.ensureThemeAvailable();

        theming.applyAll();
        panel.build();
        autoReader.initSpaceKey();
        navigation.start();
    }

    // ES module 按需加载（MV3 content script 支持 dynamic import）
    let theming = null;
    let autoReader = null;
    let panel = null;
    let navigation = null;
    // 注意：内容脚本中 import() 的相对路径以页面 URL 为基准，必须用扩展绝对路径
    Promise.all([
        import(chrome.runtime.getURL('lib/preferences.js')),
        import(chrome.runtime.getURL('lib/theming.js')),
        import(chrome.runtime.getURL('lib/auto-reader.js')),
        import(chrome.runtime.getURL('lib/panel.js')),
        import(chrome.runtime.getURL('lib/navigation.js')),
        import(chrome.runtime.getURL('lib/debug.js'))
    ]).then(([pref, them, auto, pan, nav, dbg]) => {
        store = pref.createStore({
            storage: chromeStorage,
            bgColors,
            widths,
            isSystemDarkMode
        });
        theming = them.createTheming({
            store,
            doc: document,
            win: window,
            widths,
            bgColors,
            isDoubleColumnMode
        });
        autoReader = auto.createAutoReader({
            store,
            doc: document,
            win: window,
            isDoubleColumnMode,
            onToggle: () => panel.refresh()
        });
        panel = pan.createPanel({
            store,
            autoReader,
            doc: document,
            win: window,
            widths,
            bgColors,
            autoModes,
            isDoubleColumnMode,
            onModeChange: () => { theming.applyBgColor(); panel.build(); }
        });
        navigation = nav.createNavigation({
            store,
            theming,
            panel,
            doc: document,
            win: window,
            isSystemDarkMode
        });
        dbg.initDebug(document, window);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            setTimeout(init, 300);
        }
    });

    console.log('[悦读助手 v1.0] content script 已加载');

})();
