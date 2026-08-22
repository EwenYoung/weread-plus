// 导航与刷新模块：SPA 导航 + 模式监听 + 统一刷新流（StyleRefresher）
// 各类"需要重应用样式"的事件统一入口，延时重试策略集中实现（替代原 modeRetryTimers 数组）

export function createNavigation({ store, theming, panel, doc, win, isSystemDarkMode }) {
    let retryTimers = [];
    let lastDarkMode = false;
    let lastUrl = '';
    let mutationObserver = null;
    let obsTimer = null;

    function clearRetryTimers() {
        retryTimers.forEach(clearTimeout);
        retryTimers = [];
    }

    // 带延时重试的刷新：对抗微信读书自身样式更新（延迟多次覆盖）
    function refreshWithRetry(fn, delays) {
        fn();
        delays.forEach((d) => retryTimers.push(setTimeout(fn, d)));
    }

    // 系统深浅色切换：恢复该模式记住的主题，重建面板，重试覆盖。
    // isDark 由调用方传入事件给出的新模式，不能在回调里读 body class——
    // matchMedia 事件先于微信读书更新 body.wr_whiteTheme，此刻读到的是旧模式，
    // 会把旧深色主题重新写回微信读书正按新主题重渲染的 canvas，造成文字残留旧色
    function handleModeChange(isDark) {
        // 清除上一轮的延时重试，防止快速切换时堆积
        clearRetryTimers();

        // 系统切换的 canvas 保护窗口 + 滚动模式兜底重绘（需先于新主题样式应用）
        theming.onSystemThemeChange();

        // 恢复目标模式上次使用的主题，首次进入该模式时为该模式默认
        //（set 触发订阅者重应用样式）
        store.applySystemMode(isDark);
        panel.build();
        refreshWithRetry(theming.applyBgColor, [300, 800, 1500]);
    }

    // 双信号去重：prefers-color-scheme 事件与 body class 变化都会报告系统模式切换，
    // 先到的信号已处理完成，后到的直接跳过
    function onSystemModeChange(isDark) {
        if (isDark === lastDarkMode) return;
        lastDarkMode = isDark;
        console.log('[悦读助手] 系统深色模式切换:', isDark ? '深色' : '浅色');
        handleModeChange(isDark);
    }

    function startModeWatching() {
        lastDarkMode = isSystemDarkMode();

        // 监听系统深色/浅色模式变化（prefers-color-scheme）。
        // 用事件携带的新模式（e.matches），不读 body class（此刻尚未更新）
        win.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            console.log('[悦读助手] prefers-color-scheme 切换');
            onSystemModeChange(e.matches);
        });

        // 监听 body/html class 变化（微信读书自己的深色模式切换）。
        // class 变化时 body 已是新状态，读 isSystemDarkMode() 是准确的
        let modeObserver = new MutationObserver(function() {
            onSystemModeChange(isSystemDarkMode());
        });
        modeObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
        modeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    // SPA 导航监听：劫持 history + popstate
    function startNavWatching() {
        lastUrl = win.location.href;

        let push = win.history.pushState;
        let replace = win.history.replaceState;
        win.history.pushState = function() { push.apply(this, arguments); onNav(); };
        win.history.replaceState = function() { replace.apply(this, arguments); onNav(); };
        win.addEventListener('popstate', onNav);

        function onNav() {
            if (win.location.href === lastUrl) return;
            lastUrl = win.location.href;
            console.log('[悦读助手] SPA 导航检测, 断开旧 DOM 监听, 延迟重新应用样式');

            // 断开旧 MutationObserver，防止内存泄漏
            if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
            if (obsTimer) { clearTimeout(obsTimer); obsTimer = null; }

            setTimeout(function() {
                theming.applyAll();
                startObserving(); // 新页面重新监听
            }, 600);
        }
    }

    // 内容区 DOM 监听：重建时重新应用样式
    function startObserving() {
        let target = doc.querySelector('.readerContent');
        if (!target) return;
        theming.applyWidth();
        theming.applyBgColor();
        mutationObserver = new MutationObserver(function() {
            if (obsTimer) clearTimeout(obsTimer);
            obsTimer = setTimeout(function() {
                theming.applyAll();
            }, 400);
        });
        mutationObserver.observe(target, { childList: true, subtree: true });
        console.log('[悦读助手] DOM 监听已启动');
    }

    function start() {
        startModeWatching();
        startNavWatching();

        // CSS 样式表规则持久生效，不必延时重试
        if (store.get('widthIdx') === 1) {
            setTimeout(theming.applyWidth, 2000);
        }

        // 初始监听：等 .readerContent 出现
        let tryObserve = setInterval(function() {
            if (doc.querySelector('.readerContent')) {
                clearInterval(tryObserve);
                theming.applyWidth();
                startObserving();
            }
        }, 500);
    }

    return { start };
}
