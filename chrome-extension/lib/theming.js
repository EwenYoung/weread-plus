// 样式应用模块：宽屏 + 主题颜色 + 沉浸式
// CSS 生成部分为纯函数（可测试）；DOM 操作部分注入 doc/win

// 滚动模式正文文字色（深色主题配浅字、浅色主题配深字）。
// CSS 生成、内联覆盖与 canvas 像素自愈共用，避免多处硬编码后不同步
const DARK_TEXT = '#d4d4d4';
const LIGHT_TEXT = '#333333';

// ---- 宽屏规则表（单一数据源：CSS 内联层与 MutationObserver 层共用）----
// 正文两侧气口：按视口宽度取百分比，1920 屏每侧约 230px，避免正文撑满全屏
const WIDE_BODY_MARGIN = '0 12%';
const WIDE_RULES = [
    { sel: '.readerContent', props: { 'max-width': '100%', 'width': '100%', 'margin': '0 auto' } },
    { sel: '.readerTopBar, .readerTopBar_inner', props: { 'max-width': '100%' } },
    { sel: '.readerControls', props: { 'align-items': 'flex-end', 'margin-left': '45.5%' } },
    { sel: '.readerCatalog, .readerNotePanel', props: { 'left': 'auto', 'right': '0' } },
    { sel: '.readerAIChatPanel', props: { 'left': 'auto', 'right': '0', 'width': '400px', 'max-width': '400px' } },
    { sel: '.readerChapterContent', props: { 'max-width': '100%', 'width': 'auto', 'margin': WIDE_BODY_MARGIN } },
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
.readerContent .readerChapterContent { max-width: 100% !important; width: auto !important; margin: ${WIDE_BODY_MARGIN} !important; }
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
    const textColor = isDark ? DARK_TEXT : LIGHT_TEXT;
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
    // 系统深浅色切换的 canvas 保护窗口（见 onSystemThemeChange）
    let canvasToggleSuppressedUntil = 0;
    let systemThemeGen = 0;

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

    // 收集正文 canvas。优先精确选择器；微信读书改版可能更换类名导致选择器
    // 静默失效（历史上因此让 canvas 修复失灵），匹配不到时退化为 reader 容器内
    // 的全部 canvas（按尺寸过滤图标类小 canvas）。不退化到全页面 canvas：
    // 评论区等处的画布会被误分析误染
    function collectReaderCanvases() {
        let canvases = doc.querySelectorAll('.readerChapterContent canvas, .renderTargetContent canvas, .wr_canvasContainer canvas');
        if (canvases.length === 0) {
            canvases = Array.prototype.filter.call(
                doc.querySelectorAll('.readerContent canvas, .app_content canvas'),
                function(c) { return c.width >= 200 || c.height >= 200; }
            );
        }
        return canvases;
    }

    function reRenderCanvas() {
        // 系统深浅色切换的保护窗口内不 display 切换 canvas：会打断微信读书按新主题的
        // 重渲染（实测导致文字残留旧主题色）
        if (win.performance.now() < canvasToggleSuppressedUntil) return;
        let canvases = collectReaderCanvases();
        console.log('[悦读助手] reRenderCanvas:', canvases.length, '个 canvas (宽屏)');
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

    // 系统深浅色切换处理（由 navigation 在切换第一时间调用，先于新主题样式应用）：
    // 1. 开启保护窗口：窗口内 reRenderCanvas（宽屏路径）不得 display 切换 canvas，
    //    避免打断微信读书按新主题的重渲染；
    // 2. 立即开始像素自愈循环（见 healReaderCanvases），修正 canvas 里残留的旧主题像素
    function onSystemThemeChange() {
        systemThemeGen++;
        let gen = systemThemeGen;
        canvasToggleSuppressedUntil = win.performance.now() + 3500;
        healIssueKeys = new Set(); // 异常日志重新计数：新一次切换的问题重新提示
        // 像素自愈：切换瞬间（setTimeout 0，在 handleModeChange 应用新主题之后）立即
        // 改写 canvas 旧像素，把"灰字窗口期"压到最短；随后重复几次，对抗微信读书
        // 迟到的重绘把颜色改回去（幂等，颜色已正确时是空操作）。
        // 不再做 display 切换：新版微信读书不响应它，只会白闪一帧
        [0, 300, 800, 1500, 2500, 3500].forEach(function(delay) {
            setTimeout(function() {
                if (gen !== systemThemeGen) return; // 期间又切换了一次，交给最新一轮自愈
                if (isDoubleColumnMode()) return;   // 双栏模式由 forceCanvasRedraw 覆盖
                healReaderCanvases();
            }, delay);
        });
    }

    // ======================== Canvas 像素自愈 ========================
    // 微信读书滚动模式正文由 canvas 渲染。系统深浅色切换时它在翻转 body class 之前
    // 就按旧文字色画好了 canvas，之后不再重绘，也不响应 resize/display 切换（新版
    // 实测）——CSS 无法修正已画好的位图，只能读取像素分析后直接改写

    // 自愈异常日志去重：同一问题在一次系统切换的多轮自愈中只提示一次
    let healIssueKeys = null;

    function hexToRgb(hex) {
        return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    }

    // 采样分析 canvas，区分"纯文字层"（大量透明像素）与"整页绘制层"（不透明）。
    // 像素读取经自建的 willReadFrequently 离屏画布中转：微信读书的 canvas 上下文
    // 创建时没带该标志且无法补设（仅首次创建生效），直接反复 getImageData 会触发
    // Chrome 回读性能警告。分析用缩小副本（长画布全尺寸读取可达数十 MB、每轮自愈
    // 都要读），只在确认需要重染时才由 recolorTextCanvas 做全尺寸读改写。
    // 返回 null 表示像素不可读（跨域污染 / 零尺寸）
    function analyzeCanvas(c) {
        let scale = Math.min(1, 256 / Math.max(c.width, c.height));
        let w = Math.max(1, Math.round(c.width * scale));
        let h = Math.max(1, Math.round(c.height * scale));
        let buf = doc.createElement('canvas');
        buf.width = w;
        buf.height = h;
        let bctx = null;
        try {
            bctx = buf.getContext('2d', { willReadFrequently: true });
            if (bctx) bctx.drawImage(c, 0, 0, w, h);
        } catch (e) { return null; }
        if (!bctx) return null;
        let img;
        try { img = bctx.getImageData(0, 0, w, h); } catch (e) { return null; }
        let d = img.data;
        let transparent = 0, total = 0, fgN = 0, fgR = 0, fgG = 0, fgB = 0;
        for (let i = 0; i < d.length; i += 4) { // 副本已缩小，全量遍历也很快
            total++;
            if (d[i + 3] < 32) { transparent++; continue; }
            fgN++; fgR += d[i]; fgG += d[i + 1]; fgB += d[i + 2];
        }
        if (total === 0) return null;
        return {
            transparentRatio: transparent / total,
            fgColor: fgN ? [Math.round(fgR / fgN), Math.round(fgG / fgN), Math.round(fgB / fgN)] : null
        };
    }

    // 纯文字层重染（全尺寸读改写一次完成）：只改与检测到的旧文字色相近的像素，
    // 保留 alpha（含抗锯齿边缘）——画布内的彩色标注/线条不参与重染。
    // 返回 false 表示无法读取或无法写回（WebGL/离屏渲染 canvas 拿不到 2D 上下文）
    function recolorTextCanvas(c, oldRgb, textRgb) {
        let buf = doc.createElement('canvas');
        buf.width = c.width;
        buf.height = c.height;
        let bctx = null;
        try {
            bctx = buf.getContext('2d', { willReadFrequently: true });
            if (bctx) bctx.drawImage(c, 0, 0);
        } catch (e) { return false; }
        if (!bctx) return false;
        let img;
        try { img = bctx.getImageData(0, 0, c.width, c.height); } catch (e) { return false; }
        let writeCtx = null;
        try { writeCtx = c.getContext('2d'); } catch (e) { writeCtx = null; }
        if (!writeCtx) return false;
        let d = img.data;
        let or = oldRgb[0], og = oldRgb[1], ob = oldRgb[2];
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            let dr = d[i] - or, dg = d[i + 1] - og, db = d[i + 2] - ob;
            if (dr * dr + dg * dg + db * db > 120 * 120) continue; // 非旧文字色的像素不动
            d[i] = textRgb[0]; d[i + 1] = textRgb[1]; d[i + 2] = textRgb[2];
        }
        writeCtx.putImageData(img, 0, 0);
        return true;
    }

    function healIssueLog(c, tag, msg) {
        let key = tag + ':' + c.width + 'x' + c.height;
        if (healIssueKeys && healIssueKeys.has(key)) return;
        if (!healIssueKeys) healIssueKeys = new Set();
        healIssueKeys.add(key);
        console.log('[悦读助手] canvas 自愈:', c.width + 'x' + c.height, msg);
    }

    function healReaderCanvases() {
        let theme = bgColors[store.get('bgIdx')];
        let isDark = theme.type === 'dark';
        let textRgb = hexToRgb(isDark ? DARK_TEXT : LIGHT_TEXT);
        let textLum = 0.299 * textRgb[0] + 0.587 * textRgb[1] + 0.114 * textRgb[2];

        collectReaderCanvases().forEach(function(c) {
            if (!c.width || !c.height) return;
            let info = analyzeCanvas(c);
            if (!info) { healIssueLog(c, 'unreadable', '像素不可读（canvas 被跨域资源污染），跳过'); return; }
            let fg = info.fgColor;
            if (!fg) return;
            let fgLum = 0.299 * fg[0] + 0.587 * fg[1] + 0.114 * fg[2];
            if (theme.rgb) {
                // 插件主题：期望文字色即插件常量，接近即正确（自愈循环会重复
                // 调用，正确的保持静默，避免刷屏）
                if (Math.abs(fgLum - textLum) < 40) return;
            } else {
                // 系统默认：原生文字色未必等于插件常量，不能按精确色距判断，
                // 否则会误染健康的原生渲染。只按方向判断残留——文字亮度仍
                // 属于旧模式（浅色模式下偏浅字 / 深色模式下偏深字）才重染
                let looksHealthy = isDark ? fgLum >= 120 : fgLum < 120;
                if (looksHealthy) return;
            }
            if (info.transparentRatio <= 0.5) {
                // 整页绘制层可能含插图，重染风险高，只记录不改写
                healIssueLog(c, 'opaque', '整页绘制层颜色异常 rgb(' + fg.join(',') + ')，期望 rgb(' + textRgb.join(',') + ')，暂未处理');
                return;
            }
            if (recolorTextCanvas(c, fg, textRgb)) {
                console.log('[悦读助手] canvas 自愈:', c.width + 'x' + c.height,
                    '重染 rgb(' + fg.join(',') + ') → rgb(' + textRgb.join(',') + ')');
            } else {
                healIssueLog(c, 'nowrite', '像素可读但无法写回（WebGL/离屏渲染 canvas），跳过');
            }
        });
    }

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

    // 撤除插件写入的内联文字色：仅匹配插件自身的两套颜色（#d4d4d4 / #333 的
    // rgb 序列化形式），微信读书原生内联样式不受影响
    function clearPluginTextColors() {
        doc.querySelectorAll('[style*="color"]').forEach(function(el) {
            if (!el.style.color) return;
            let style = el.getAttribute('style') || '';
            if (style.indexOf('212, 212, 212') !== -1 || style.indexOf('212,212,212') !== -1
                || style.indexOf('51, 51, 51') !== -1 || style.indexOf('51,51,51') !== -1) {
                el.style.removeProperty('color');
            }
        });
    }

    function applyBgColor() {
        let theme = bgColors[store.get('bgIdx')];

        // 系统默认（rgb 为空）：撤除插件配色，微信读书原生外观接管。
        // 停掉文字色 observer（否则会把插件颜色重新强写回去），只清插件自己
        // 写入的内联文字色，不动微信读书原生样式
        if (!theme.rgb) {
            stopColorObserver();
            addStyle('bgColor', '');
            clearPluginTextColors();
            // 双栏模式 display 切换帮微信读书按原生色重绘 canvas；
            // 滚动模式它自己会重绘，不干预
            if (isDoubleColumnMode()) forceCanvasRedraw();
            console.log('[悦读助手] applyBgColor: 系统默认（跟随微信读书原生外观）');
            return;
        }

        let color = theme.rgb;
        let isDark = theme.type === 'dark';
        let textColor = isDark ? DARK_TEXT : LIGHT_TEXT;
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
            let textColor = isDark ? DARK_TEXT : LIGHT_TEXT;
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
        applyAll, applyWidth, applyBgColor, applyImmersive, onSystemThemeChange
    };
}
