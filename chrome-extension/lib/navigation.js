// 导航与刷新模块：SPA 导航 + 模式监听 + 统一刷新流（StyleRefresher）
// 各类"需要重应用样式"的事件统一入口，延时重试策略集中实现（替代原 modeRetryTimers 数组）

export function createNavigation({ store, theming, panel, bgColors, doc, win, isSystemDarkMode }) {
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

    // 系统深浅色切换：换到当前模式第一个主题色，重建面板，重试覆盖
    function handleModeChange() {
        // 清除上一轮的延时重试，防止快速切换时堆积
        clearRetryTimers();

        // 切换到当前模式的第一个主题色（set 触发订阅者重应用样式）
        let available = store.getAvailableColors();
        store.set('bgIdx', bgColors.findIndex((c) => c.name === available[0].name));
        panel.build();
        refreshWithRetry(theming.applyBgColor, [300, 800, 1500]);
    }

    function startModeWatching() {
        lastDarkMode = isSystemDarkMode();

        // 监听系统深色/浅色模式变化（prefers-color-scheme）
        win.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
            console.log('[悦读助手] prefers-color-scheme 切换');
            handleModeChange();
        });

        // 监听 body/html class 变化（微信读书自己的深色模式切换）
        let modeObserver = new MutationObserver(function() {
            let currentDark = isSystemDarkMode();
            if (currentDark !== lastDarkMode) {
                console.log('[悦读助手] 系统深色模式切换:', currentDark ? '深色' : '浅色');
                lastDarkMode = currentDark;
                handleModeChange();
            }
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
