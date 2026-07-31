// 样式应用模块：宽屏 + 主题颜色 + 沉浸式
// CSS 生成部分为纯函数（可测试）；DOM 操作部分注入 doc/win

// ---- 宽屏规则表（单一数据源：CSS 内联层与 MutationObserver 层共用）----
const WIDE_RULES = [
    { sel: '.readerContent', props: { 'max-width': '100%', 'width': '100%', 'margin': '0 auto' } },
    { sel: '.readerTopBar, .readerTopBar_inner', props: { 'max-width': '100%' } },
    { sel: '.readerControls', props: { 'align-items': 'flex-end', 'margin-left': '45.5%' } },
    { sel: '.readerCatalog, .readerNotePanel', props: { 'left': 'auto', 'right': '0' } },
    { sel: '.readerAIChatPanel', props: { 'left': 'auto', 'right': '0', 'width': '400px', 'max-width': '400px' } },
    { sel: '.readerChapterContent', props: { 'max-width': '100%', 'width': 'auto', 'margin': '0 40px' } },
    { sel: '.app_content, .wr_various_font_provider_wrapper, .readerChapterContent_container, .renderTargetContainer, .renderTargetContent',
        props: { 'max-width': '100%', 'width': 'auto' } }
];

// ---- CSS 生成（纯函数） ----

// 宽屏 CSS（持久样式表层，规则固定，无需参数化）。
// 注意：此层与 WIDE_RULES 的选择器集合必须保持一致——CSS 层带 .readerContent 祖先前缀
// （持久对抗内联覆盖），WIDE_RULES 为裸选择器（即时内联 + observer 反击），
// 二者作用域不同但覆盖同一批元素；tests/theming.test.js 有防漂移断言。
export function buildWidescreenCss() {
    return `
.readerContent { max-width: 100% !important; width: 100% !important; margin: 0 auto !important; }
.readerContent .readerChapterContent { max-width: 100% !important; width: auto !important; margin: 0 40px !important; }
.readerContent .app_content,
.readerContent .wr_various_font_provider_wrapper,
.readerContent .readerChapterContent_container,
.readerContent .renderTargetContainer,
.readerContent .renderTargetContent { max-width: 100% !important; width: auto !important; }
.readerTopBar, .readerTopBar_inner { max-width: 100% !important; }
.readerControls { align-items: flex-end !important; margin-left: 45.5% !important; }
.readerCatalog, .readerNotePanel { left: auto !important; right: 0 !important; }
.readerAIChatPanel { left: auto !important; right: 0 !important; width: 400px !important; max-width: 400px !important; }
`;
}

// 主题颜色 CSS。双栏模式文字由 Canvas 渲染，CSS color 无法影响，仅设背景与 UI 颜色
export function buildBgCss(theme, isDualColumn) {
    const color = theme.rgb;
    const isDark = theme.type === 'dark';
    const textColor = isDark ? '#d4d4d4' : '#333333';
    const subTextColor = isDark ? '#a0a0a0' : '#555555';

    const base = `
html, body, #app, .app, #routerView, .routerView { background-color: ${color} !important; }
.wr_horizontalReader, .wr_horizontalReader_app_content { background-color: ${color} !important; }
.readerContent, .app_content, .wr_various_font_provider_wrapper,
.readerChapterContent, .readerChapterContent_container, .renderTargetContainer, .renderTargetContent { background-color: ${color} !important; }
.page, .page_left, .page_right, .page_show, .page_space_top, .page_space_bottom { background-color: ${color} !important; }
.readerTopBar, .readerTopBar_inner, .readerTopBar_left, .readerTopBar_right,
.readerBottomBar, .readerBottomBar_content, .readerFooter, .readerFooter_button,
.readerControls, .readerControls_item { background-color: ${color} !important; }
.readerChapterContent, .wr_page_reader, .readerContent, .app_content,
.wr_various_font_provider_wrapper { background-image: none !important; }
.readerTopBar_title_chapter, .readerTopBar_title_link, .readerTopBar_link, .readerTopBar a { color: ${textColor} !important; }
.readerTopBar_title, .readerBottomBar span, .readerFooter_button span { color: ${subTextColor} !important; }
.renderTargetPageInfo_header, .renderTarget_pager, .renderTargetPageInfo_header * { color: ${textColor} !important; }
`;

    if (isDualColumn) return base;

    // 滚动模式额外文字颜色（与 base 中同名选择器的声明合并，等效于原实现）
    const scrollOnly = `
html, body, #app, .app, #routerView, .routerView { color: ${textColor} !important; }
.wr_horizontalReader, .wr_horizontalReader_app_content { color: ${textColor} !important; }
.wr_horizontalReader, .wr_horizontalReader * { color: ${textColor} !important; }
.readerChapterContent, .readerChapterContent .renderTargetContent, .readerChapterContent p, .readerChapterContent span, .readerChapterContent div { color: ${textColor} !important; }
.readerChapterContent, .readerChapterContent_container, .renderTargetContainer, .renderTargetContent { color: ${textColor} !important; }
.readerCatalog, .readerCatalog *, .readerNotePanel { background-color: ${color} !important; color: ${textColor} !important; }
.preRenderContainer, .preRenderContainer * { color: ${textColor} !important; }
.renderTargetContainer, .renderTargetContainer * { color: ${textColor} !important; }
.readerChapterContent_container, .readerChapterContent_container * { color: ${textColor} !important; }
`;
    return base + scrollOnly;
}

export function buildImmersiveCss() {
    return `
.readerTopBar, .readerBottomBar, .readerControls {
    transition: opacity 0.2s ease;
    opacity: 0 !important;
}
.readerTopBar:hover, .readerBottomBar:hover, .readerControls:hover {
    opacity: 1 !important;
}
body::-webkit-scrollbar { display: none !important; }
`;
}

// ---- 应用逻辑（DOM 操作） ----

export function createTheming({ store, doc, win, widths, bgColors, isDoubleColumnMode }) {
    let styleEl = null;
    let styleCache = {};

    // 滚动模式强制覆盖的内联文字颜色选择器
    const TEXT_SELECTORS = [
        '.readerChapterContent', '.readerChapterContent *',
        '.renderTargetContent', '.renderTargetContent *',
        '.renderTargetContainer', '.renderTargetContainer *',
        '.preRenderContainer', '.preRenderContainer *',
        '.readerChapterContent_container', '.readerChapterContent_container *',
        '.page', '.page *',
        '.wr_flyleaf_page', '.wr_flyleaf_page *',
        '.reader_flyleaf_container', '.reader_flyleaf_container *',
        '.wr_horizontalReader', '.wr_horizontalReader *'
    ];

    function getStyleEl() {
        if (styleEl && styleEl.parentNode) return styleEl;
        // SPA 导航/微信读书重建可能替换 <head>，旧元素已脱离 DOM：重建元素，
        // 规则注册表（styleCache）保留，由 renderStyles 全量重写
        styleEl = doc.getElementById('wr-enhanced-styles');
        if (!styleEl) {
            styleEl = doc.createElement('style');
            styleEl.id = 'wr-enhanced-styles';
            doc.head.appendChild(styleEl);
        }
        return styleEl;
    }

    function renderStyles() {
        let el = getStyleEl();
        el.textContent = Object.values(styleCache).join('\n');
    }

    function addStyle(key, css) {
        // 幂等：规则相同且元素仍有效时跳过；元素丢失（微信读书重建 head）时全量重写
        if (styleCache[key] === css && styleEl && styleEl.parentNode) return;
        styleCache[key] = css;
        renderStyles();
    }

    // 按规则表对单个元素应用宽屏内联样式
    function applyRulesTo(el) {
        if (!el) return;
        for (const rule of WIDE_RULES) {
            if (el.matches(rule.sel)) {
                for (const [prop, value] of Object.entries(rule.props)) {
                    el.style.setProperty(prop, value, 'important');
                }
                return;
            }
        }
    }

    // ======================== 宽屏 ========================

    function applyWidth() {
        // 双栏模式下不应用宽屏
        if (isDoubleColumnMode()) return;

        let cfg = widths[store.get('widthIdx')];
        // ponytail: 宽度预设仅支持 ""（默认）与 "100%"（宽屏），WIDE_RULES 硬编码 100%
        let w = cfg.width || '';

        if (w) {
            // 第1层：CSS 样式表规则（持久存在，对抗普通内联样式）
            addStyle('wideScreen', buildWidescreenCss());

            // 第2层：内联 !important 立即应用
            applyWidthInline();

            // 第3层：监听微信读书覆盖样式，立即反击
            startWidthObserver();

            // Canvas 重渲染：微信读书用 Canvas 渲染文字，容器宽度变化后需重绘
            // 等微信读书自己渲染完再触发（太早会干扰），2000ms applyWidth 兜底
            setTimeout(reRenderCanvas, 800);
        } else {
            addStyle('wideScreen', '');
            stopWidthObserver();
            // 清除内联 !important 样式（关闭宽屏时布局立即恢复，不依赖刷新）
            for (const rule of WIDE_RULES) {
                doc.querySelectorAll(rule.sel).forEach(function(el) {
                    for (const prop of Object.keys(rule.props)) {
                        el.style.removeProperty(prop);
                    }
                });
            }
        }

        console.log('[悦读助手] applyWidth:', cfg.title);
    }

    function reRenderCanvas() {
        let canvases = doc.querySelectorAll('.readerChapterContent canvas, .renderTargetContent canvas');
        if (canvases.length === 0) return;
        // 触发 resize 事件 + display 切换，让微信读书的 Canvas 跟随新容器宽度重绘
        win.dispatchEvent(new win.Event('resize'));
        canvases.forEach(function(c) {
            c.style.display = 'none';
            c.offsetHeight; // force reflow
            c.style.display = '';
        });
    }

    function applyWidthInline() {
        for (const rule of WIDE_RULES) {
            doc.querySelectorAll(rule.sel).forEach(applyRulesTo);
        }
    }

    let widthObserver = null;
    let widthRetryTimer = null;
    let applyingWidth = false;

    function startWidthObserver() {
        stopWidthObserver();

        let targets = [];
        for (const rule of WIDE_RULES) {
            doc.querySelectorAll(rule.sel).forEach(function(el) { targets.push(el); });
        }

        if (targets.length === 0) {
            // .readerContent 还未创建，500ms 后重试
            widthRetryTimer = setTimeout(startWidthObserver, 500);
            return;
        }
        widthRetryTimer = null;

        widthObserver = new MutationObserver(function(mutations) {
            if (applyingWidth) return;
            applyingWidth = true;

            mutations.forEach(function(mutation) {
                if (mutation.type !== 'attributes' || mutation.attributeName !== 'style') return;
                applyRulesTo(mutation.target);
            });

            // ponytail: setTimeout 延迟清标志, 避免我们自己的 setProperty 触发的 mutation callback 再次进入
            setTimeout(function() { applyingWidth = false; }, 0);
        });

        targets.forEach(function(el) {
            widthObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
        });

        console.log('[悦读助手] 宽屏样式监听已启动 (' + targets.length + ' 个元素)');
    }

    function stopWidthObserver() {
        if (widthObserver) {
            widthObserver.disconnect();
            widthObserver = null;
        }
        if (widthRetryTimer) {
            clearTimeout(widthRetryTimer);
            widthRetryTimer = null;
        }
    }

    // ======================== 主题颜色 ========================

    // 强制 Canvas 重渲染（仅双栏模式）：微信读书双栏切主题时会创建新 Canvas 却用旧主题色渲染，
    // 需 display 切换强制重绘。滚动模式禁用此方法——微信读书会自己重渲染，打断反而破坏它。
    // 延迟 1s 执行并确认模式：微信读书模式切换（双栏→滚动）期间 applyBgColor 可能误判双栏，
    // 此时打断会破坏微信读书正在构建的滚动 canvas 渲染
    function forceCanvasRedraw() {
        setTimeout(function() {
            if (!isDoubleColumnMode()) return;
            win.requestAnimationFrame(function() {
                let canvases = doc.querySelectorAll('.wr_canvasContainer canvas');
                if (canvases.length === 0) return;
                canvases.forEach(function(c) {
                    c.style.display = 'none';
                    c.offsetHeight;
                    c.style.display = '';
                });
            });
        }, 1000);
    }

    function applyBgColor() {
        let theme = bgColors[store.get('bgIdx')];
        let color = theme.rgb;
        let isDark = theme.type === 'dark';
        let textColor = isDark ? '#d4d4d4' : '#333333';
        let isDualColumn = isDoubleColumnMode();

        if (isDualColumn) {
            // 双栏模式文字由 Canvas 渲染，CSS color 无法影响，只设背景色和 UI 元素颜色
            stopColorObserver();
            addStyle('bgColor', buildBgCss(theme, true));

            // 清除插件旧内联文字颜色（不设新的）
            doc.querySelectorAll('[style*="color"]').forEach(function(el) {
                el.style.removeProperty('color');
            });

            forceCanvasRedraw();
            return;
        }

        // === 滚动模式 ===
        addStyle('bgColor', buildBgCss(theme, false));

        // 用内联样式强制覆盖文字颜色，先清除旧的内联颜色再设置新的
        TEXT_SELECTORS.forEach(function(sel) {
            doc.querySelectorAll(sel).forEach(function(el) {
                // 先清除内联样式中的 color
                el.style.removeProperty('color');
                // 再设置新的颜色
                el.style.setProperty('color', textColor, 'important');
            });
        });

        // 额外处理：清除所有带有旧颜色的内联样式
        // 只处理内联声明了 color 的元素（[style*="color"] 也会匹配 background-color 等）
        doc.querySelectorAll('[style*="color"]').forEach(function(el) {
            if (!el.style.color) return;
            let style = el.getAttribute('style') || '';
            // 检查是否包含深色模式颜色
            if (style.indexOf('212, 212, 212') !== -1 || style.indexOf('212,212,212') !== -1) {
                el.style.removeProperty('color');
                el.style.setProperty('color', textColor, 'important');
            }
            // 检查是否包含浅色模式颜色但当前是深色模式
            if (isDark && (style.indexOf('51, 51, 51') !== -1 || style.indexOf('51,51,51') !== -1)) {
                el.style.removeProperty('color');
                el.style.setProperty('color', textColor, 'important');
            }
        });

        startColorObserver();
        // 注意：滚动模式不强制 Canvas 重绘——微信读书切主题后自己会重渲染 canvas，
        // 我们的 display 切换会打断它的重渲染（实测导致文字残留旧主题色）
    }

    // 持续监听内联样式变化，强制覆盖微信读书设置的文字颜色
    let colorObserver = null;
    let colorObserverTarget = null;
    let applyingColor = false;
    function startColorObserver() {
        // 优先观察滚动模式正文容器：双栏切滚动后 .wr_horizontalReader 可能残留（隐藏），
        // 观察它收不到正文内联样式变化
        let target = doc.querySelector('.readerChapterContent') || doc.querySelector('.wr_horizontalReader') || doc.querySelector('.readerContent');
        if (!target) return;
        // SPA 导航替换节点后旧 observer 失效：target 变化或已脱离 DOM 时重新挂载
        if (colorObserver) {
            if (colorObserverTarget === target && target.isConnected) return;
            colorObserver.disconnect();
            colorObserver = null;
        }
        colorObserverTarget = target;
        colorObserver = new MutationObserver(function() {
            // 防递归：回调自身写颜色会再次触发 mutation，延迟清标志（同 widthObserver）
            if (applyingColor) return;
            applyingColor = true;
            let theme = bgColors[store.get('bgIdx')];
            let isDark = theme.type === 'dark';
            let textColor = isDark ? '#d4d4d4' : '#333333';
            // 只处理内联声明了 color 的元素，避免误伤 background-color 等
            doc.querySelectorAll('[style*="color"]').forEach(function(el) {
                if (!el.style.color) return;
                let computed = win.getComputedStyle(el).color;
                let expected = isDark ? 'rgb(212, 212, 212)' : 'rgb(51, 51, 51)';
                if (computed !== expected) {
                    el.style.setProperty('color', textColor, 'important');
                }
            });
            setTimeout(function() { applyingColor = false; }, 0);
        });
        colorObserver.observe(target, { attributes: true, subtree: true, attributeFilter: ['style'] });
    }

    function stopColorObserver() {
        if (colorObserver) { colorObserver.disconnect(); colorObserver = null; }
    }

    // ======================== 沉浸式 ========================

    function applyImmersive() {
        addStyle('immersive', buildImmersiveCss());
    }

    function applyAll() {
        applyWidth();
        applyBgColor();
        applyImmersive();
    }

    return {
        applyAll, applyWidth, applyBgColor, applyImmersive
    };
}
