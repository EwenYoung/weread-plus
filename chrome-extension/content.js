// 微信读书 · 悦读助手 — Chrome 插件版
// 从油猴脚本迁移，Manifest V3

(function() {
    'use strict';

    // ======================== 存储（chrome.storage.local） ========================
    function storageGet(key, def) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                let v = result[key];
                resolve(v !== undefined ? v : def);
            });
        });
    }
    function storageSet(key, val) {
        chrome.storage.local.set({ [key]: val });
    }

    // ======================== 样式管理 ========================
    let _styleEl = null;
    let _styleCache = {};

    function getStyleEl() {
        if (_styleEl && _styleEl.parentNode) return _styleEl;
        _styleEl = document.getElementById('wr-enhanced-styles');
        if (!_styleEl) {
            _styleEl = document.createElement('style');
            _styleEl.id = 'wr-enhanced-styles';
            document.head.appendChild(_styleEl);
        }
        return _styleEl;
    }

    function addStyle(key, css) {
        if (_styleCache[key] === css) return;
        _styleCache[key] = css;
        let el = getStyleEl();
        el.textContent = Object.values(_styleCache).join('\n');
    }

    // ======================== 配置项 ========================
    const widths = [
        { title: "默认", width: "", alignItems: "flex-start", marginLeft: "" },
        { title: "宽屏", width: "100%", alignItems: "flex-end", marginLeft: "45.5%" },
    ];
    const bgColors = [
        { name: "Claude 暖白", rgb: "#FAF5EE", type: "light" },
        { name: "Claude 米杏", rgb: "#F0E6D3", type: "light" },
        { name: "Claude 浅棕", rgb: "#E8DCC8", type: "light" },
        { name: "杏仁黄", rgb: "#FAF9DE", type: "light" },
        { name: "海天蓝", rgb: "#DCE2F1", type: "light" },
        { name: "暗夜黑", rgb: "#1a1a2e", type: "dark" },
        { name: "深墨蓝", rgb: "#16213e", type: "dark" },
        { name: "墨绿", rgb: "#1b3a2d", type: "dark" },
        { name: "暗蓝灰", rgb: "#1e2d3d", type: "dark" },
        { name: "墨黛蓝", rgb: "#1a2a2e", type: "dark" },
        { name: "暗橄榄", rgb: "#1e2319", type: "dark" },
        { name: "暮云灰", rgb: "#252228", type: "dark" },
    ];
    const autoModes = ["开启", "关闭"];
    const scrollStepPresets = [1, 2, 3, 5, 8];
    const scrollIntervalPresets = [20, 30, 50, 80, 100];
    const autoStopPresets = [0, 10, 30, 60, 120];

    // ======================== 当前状态 ========================
    let widthIdx = 0, bgIdx = 0, autoMode = 0;
    let scrollStep = 2, scrollInterval = 30, autoStopMinutes = 0;
    let autoScrollFlag = false;
    let scrollIntervalId = null;
    let scrollTimeoutId = null;
    let stopTimer = null;

    // ======================== 模式检测 ========================
    function isScrollMode() {
        // 滚动模式：按钮 class 为 isNormalReader
        return !!document.querySelector('.readerControls_item.isNormalReader');
    }

    function isDoubleColumnMode() {
        // 双栏模式：按钮 class 为 isHorizontalReader
        return !!document.querySelector('.readerControls_item.isHorizontalReader');
    }

    function isSystemDarkMode() {
        // 检测微信读书系统深色模式
        // 微信读书通常通过 body 或 html 的 class 来标识深色模式
        return document.body.classList.contains('dark') ||
               document.body.classList.contains('theme-dark') ||
               document.documentElement.classList.contains('dark') ||
               document.documentElement.classList.contains('theme-dark') ||
               window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // 获取当前系统模式下可用的主题色
    function getAvailableColors() {
        let isDark = isSystemDarkMode();
        return bgColors.filter(c => (isDark && c.type === 'dark') || (!isDark && c.type === 'light'));
    }

    // 获取当前主题色在可用列表中的索引
    function getCurrentColorIndex() {
        let available = getAvailableColors();
        let current = bgColors[bgIdx];
        let idx = available.findIndex(c => c.name === current.name);
        return idx >= 0 ? idx : 0;
    }

    // ======================== 样式应用 ========================
    function applyWidth() {
        // 双栏模式下不应用宽屏
        if (isDoubleColumnMode()) return;

        let cfg = widths[widthIdx];
        let w = cfg.width || '';
        let reader = document.querySelector('.readerContent');
        if (!reader) return;

        if (w) {
            reader.style.setProperty('max-width', w, 'important');
            reader.style.setProperty('width', w, 'important');
            reader.style.setProperty('margin', '0 auto', 'important');
        } else {
            reader.style.removeProperty('max-width');
            reader.style.removeProperty('width');
            reader.style.removeProperty('margin');
        }

        var innerSels = [
            '.readerContent .app_content',
            '.readerContent .wr_various_font_provider_wrapper',
            '.readerContent .readerChapterContent',
            '.readerContent .renderTargetContainer',
            '.readerContent .renderTargetContent'
        ];
        innerSels.forEach(function(sel) {
            document.querySelectorAll(sel).forEach(function(el) {
                if (w) {
                    el.style.setProperty('max-width', '100%', 'important');
                    el.style.setProperty('width', 'auto', 'important');
                } else {
                    el.style.removeProperty('max-width');
                    el.style.removeProperty('width');
                }
            });
        });

        document.querySelectorAll('.readerTopBar, .readerTopBar_inner').forEach(function(el) {
            if (w) el.style.setProperty('max-width', w, 'important');
            else el.style.removeProperty('max-width');
        });

        var controls = document.querySelector('.readerControls');
        if (controls) {
            if (w) {
                controls.style.setProperty('align-items', cfg.alignItems, 'important');
                controls.style.setProperty('margin-left', cfg.marginLeft, 'important');
            } else {
                controls.style.removeProperty('align-items');
                controls.style.removeProperty('margin-left');
            }
        }
        console.log('[悦读助手] applyWidth:', cfg.title);
    }

    function applyBgColor() {
        let theme = bgColors[bgIdx];
        let color = theme.rgb;
        let isDark = theme.type === 'dark';
        let textColor = isDark ? '#d4d4d4' : '#333333';
        let subTextColor = isDark ? '#a0a0a0' : '#555555';
        addStyle('bgColor', `
            html, body, #app, .app, #routerView, .routerView { background-color: ${color} !important; color: ${textColor} !important; }
            .wr_horizontalReader, .wr_horizontalReader_app_content { background-color: ${color} !important; color: ${textColor} !important; }
            .readerContent, .app_content, .wr_various_font_provider_wrapper,
            .readerChapterContent, .readerChapterContent_container, .renderTargetContainer, .renderTargetContent { background-color: ${color} !important; }
            .readerTopBar, .readerTopBar_inner, .readerTopBar_left, .readerTopBar_right,
            .readerBottomBar, .readerBottomBar_content, .readerFooter, .readerFooter_button,
            .readerControls, .readerControls_item { background-color: ${color} !important; }
            .readerChapterContent, .wr_page_reader, .readerContent, .app_content,
            .wr_various_font_provider_wrapper { background-image: none !important; }
            .readerChapterContent, .readerChapterContent .renderTargetContent, .readerChapterContent p, .readerChapterContent span { color: ${textColor} !important; }
            .readerTopBar_title_chapter, .readerTopBar_title_link, .readerTopBar_link, .readerTopBar a { color: ${textColor} !important; }
            .readerTopBar_title, .readerBottomBar span, .readerFooter_button span { color: ${subTextColor} !important; }
            .readerCatalog, .readerCatalog *, .readerNotePanel, .readerNotePanel * { background-color: ${color} !important; color: ${textColor} !important; }
        `);
    }

    function applyImmersive() {
        addStyle('immersive', `
            .readerTopBar, .readerBottomBar, .readerControls {
                transition: opacity 0.2s ease;
                opacity: 0 !important;
            }
            .readerTopBar:hover, .readerBottomBar:hover, .readerControls:hover {
                opacity: 1 !important;
            }
            body::-webkit-scrollbar { display: none !important; }
        `);
    }

    function reapplyAllStyles() {
        applyWidth(); applyBgColor(); applyImmersive();
    }

    // ======================== 自动阅读 ========================
    function findNextPageButton() {
        const selectors = ['[class*="readerFooter_button"]', '[class*="readerHeaderButton"]', '.readerFooter_button', '.readerHeaderButton'];
        for (let sel of selectors) {
            let btns = document.querySelectorAll(sel);
            for (let btn of btns) {
                let text = (btn.textContent || '') + (btn.getAttribute('title') || '') + (btn.getAttribute('aria-label') || '');
                if (/下一|next|→|❯|▶|arrow/i.test(text)) return btn;
            }
        }
        return null;
    }

    function tryTurnPage() {
        let nextBtn = findNextPageButton();
        if (nextBtn) { nextBtn.click(); return true; }
        let readerEl = document.querySelector('.readerContent, .app_content, #routerView');
        let target = readerEl || document.body;
        ['keydown','keyup'].forEach(type => target.dispatchEvent(new KeyboardEvent(type, { key: 'ArrowRight', keyCode: 39, code: 'ArrowRight', bubbles: true, cancelable: true })));
        if (!('ontouchstart' in window) || window.innerWidth > 768) {
            let contentEl = document.querySelector('.readerContent, .app_content, .readerChapterContent');
            if (contentEl) {
                let rect = contentEl.getBoundingClientRect();
                contentEl.dispatchEvent(new MouseEvent('click', { clientX: rect.right - 50, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
            }
        }
        return true;
    }

    function startAutoScrollInterval(step) {
        if (scrollIntervalId) clearInterval(scrollIntervalId);
        if (scrollTimeoutId) clearTimeout(scrollTimeoutId);
        scrollIntervalId = setInterval(() => {
            if (!autoScrollFlag) return;
            let scrollTop = window.scrollY;
            let docHeight = document.documentElement.scrollHeight;
            let winHeight = window.innerHeight;
            if (scrollTop + winHeight + 10 >= docHeight) {
                tryTurnPage();
                clearInterval(scrollIntervalId);
                scrollIntervalId = null;
                scrollTimeoutId = setTimeout(() => {
                    scrollTimeoutId = null;
                    if (!autoScrollFlag) return;
                    let newDocHeight = document.documentElement.scrollHeight;
                    if (newDocHeight > docHeight || window.scrollY < 100) startAutoScrollInterval(step);
                    else { stopAutoScroll(); console.log('[悦读助手] 已到达末尾'); }
                }, 2000);
            } else {
                window.scrollBy({ top: step, behavior: 'instant' });
            }
        }, scrollInterval);
    }

    function startAutoScroll() {
        if (autoScrollFlag) return;
        // 双栏模式下禁用自动阅读
        if (isDoubleColumnMode()) return;
        autoScrollFlag = true;
        if (autoMode === 1) {
            if (scrollIntervalId) clearInterval(scrollIntervalId);
            scrollIntervalId = setInterval(() => {
                if (!autoScrollFlag) return;
                let atBottom = window.scrollY + window.innerHeight + 10 >= document.documentElement.scrollHeight;
                if (atBottom) window.scrollTo({ top: 0, behavior: 'instant' });
                else window.scrollBy({ top: 1, behavior: 'instant' });
            }, scrollInterval);
        } else {
            startAutoScrollInterval(scrollStep);
        }
        if (autoStopMinutes > 0 && stopTimer === null) {
            stopTimer = setTimeout(() => stopAutoScroll(), autoStopMinutes * 60 * 1000);
        }
    }

    function stopAutoScroll() {
        if (!autoScrollFlag) return;
        autoScrollFlag = false;
        if (scrollIntervalId) { clearInterval(scrollIntervalId); scrollIntervalId = null; }
        if (scrollTimeoutId) { clearTimeout(scrollTimeoutId); scrollTimeoutId = null; }
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    }

    // ======================== 空格键控制 ========================
    let _spaceKeyHandler = null;
    function initSpaceKeyHandler() {
        if (_spaceKeyHandler) return;
        _spaceKeyHandler = function(e) {
            if (e.keyCode !== 32 && e.key !== ' ' && e.code !== 'Space') return;
            let tag = (document.activeElement && document.activeElement.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (document.activeElement && document.activeElement.isContentEditable) return;
            e.preventDefault(); e.stopPropagation();
            if (autoScrollFlag) stopAutoScroll();
            else startAutoScroll();
            updatePanelDisplay();
        };
        document.addEventListener('keydown', _spaceKeyHandler, true);
    }

    // ======================== 控制面板 ========================
    function buildControlPanel() {
        let old = document.getElementById('wr-control-panel');
        if (old) old.remove();

        if (!document.getElementById('wr-panel-style')) {
            let s = document.createElement('style');
            s.id = 'wr-panel-style';
            s.textContent = `
                #wr-control-panel {
                    position: fixed; top: 50%; right: 0; z-index: 999999;
                    transform: translateX(100%) translateY(-50%);
                    transition: transform 0.25s ease;
                    display: flex; flex-direction: row;
                }
                #wr-control-panel.wr-show {
                    transform: translateX(0) translateY(-50%);
                }
                .wr-panel-trigger {
                    position: fixed; right: 0; top: 50%; transform: translateY(-50%);
                    width: 8px; height: 120px; z-index: 999998;
                    cursor: pointer;
                }
                .wr-panel-body {
                    background: #faf6ee;
                    background-image:
                        radial-gradient(ellipse at 20% 50%, rgba(196,167,125,0.06) 0%, transparent 50%),
                        radial-gradient(ellipse at 80% 20%, rgba(196,167,125,0.04) 0%, transparent 50%);
                    backdrop-filter: blur(8px);
                    padding: 10px 12px;
                    border-radius: 10px;
                    max-height: 70vh; overflow-y: auto;
                    color: #3d3020; font-size: 12px;
                    min-width: 170px;
                    box-shadow: -4px 4px 20px rgba(80,60,30,0.12), inset 0 0 30px rgba(196,167,125,0.04);
                    border: 1px solid #e0d5c0;
                    position: relative;
                }
                .wr-panel-body h3 {
                    margin: 0 0 8px 0; font-size: 13px; color: #7a5c3a;
                    border-bottom: 1px solid #e0d5c0; padding-bottom: 6px;
                    font-weight: 600; letter-spacing: 0.5px;
                }
                .wr-panel-row {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 4px 0; border-bottom: 1px dotted rgba(120,90,50,0.15);
                }
                .wr-panel-row span.wr-label { color: #8a7560; flex-shrink: 0; margin-right: 8px; font-size: 11px; }
                .wr-panel-row button {
                    background: rgba(196,167,125,0.12); border: 1px solid rgba(196,167,125,0.2); color: #5a4530;
                    padding: 2px 8px; border-radius: 4px; cursor: pointer;
                    font-size: 11px; white-space: nowrap;
                    transition: 0.15s ease;
                }
                .wr-panel-row button:hover { background: rgba(196,167,125,0.25); border-color: rgba(196,167,125,0.4); }
                .wr-panel-row button.wr-active { background: rgba(196,167,125,0.25); border-color: rgba(196,167,125,0.4); }
                .wr-btn-group { display: flex; align-items: center; gap: 3px; }
                .wr-btn-arrow {
                    background: rgba(196,167,125,0.12); border: 1px solid rgba(196,167,125,0.2); color: #5a4530;
                    width: 18px; height: 18px; border-radius: 50%; cursor: pointer;
                    font-size: 12px; line-height: 1; padding: 0;
                    display: flex; align-items: center; justify-content: center;
                    transition: 0.15s ease;
                }
                .wr-btn-arrow:hover { background: rgba(196,167,125,0.3); border-color: rgba(196,167,125,0.5); }
                .wr-bg-name { font-size: 11px; color: #8a7560; min-width: 56px; text-align: center; }
                .wr-sub-val { font-size: 11px; color: #5a4530; min-width: 50px; text-align: center; }
                .wr-sub-row {
                    padding-left: 12px !important; opacity: 0.85;
                    max-height: 0; overflow: hidden; padding: 0; border: none;
                    transition: max-height 0.2s ease, opacity 0.15s ease, padding 0.2s ease;
                }
                .wr-sub-row .wr-label { font-size: 10px; }
                .wr-panel-body.wr-auto-on .wr-sub-row {
                    max-height: 40px; padding: 4px 0;
                    border-bottom: 1px dotted rgba(120,90,50,0.15); opacity: 0.85;
                }
                .wr-panel-actions {
                    display: flex; gap: 4px; flex-wrap: wrap; padding-left: 12px;
                    max-height: 0; overflow: hidden; margin-top: 0; opacity: 0;
                    transition: max-height 0.2s ease, opacity 0.15s ease, margin-top 0.2s ease;
                }
                .wr-panel-body.wr-auto-on .wr-panel-actions {
                    max-height: 40px; margin-top: 4px; opacity: 1;
                }
                .wr-panel-actions button {
                    flex: 1; padding: 2px 8px;
                    border-radius: 10px; border: none; cursor: pointer;
                    font-size: 11px; transition: 0.15s;
                }
                .wr-btn-play { background: rgba(160,128,80,0.2); color: #5a4530; border: 1px solid rgba(160,128,80,0.3); border-radius: 4px; }
                .wr-btn-play:hover { background: rgba(160,128,80,0.35); }
                .wr-btn-stop { background: rgba(120,90,50,0.2); color: #4a3520; border: 1px solid rgba(120,90,50,0.3); border-radius: 4px; }
                .wr-btn-stop:hover { background: rgba(120,90,50,0.35); }
                .wr-btn-mode { background: rgba(160,128,80,0.2); color: #5a4530; }
                .wr-btn-mode:hover { background: rgba(160,128,80,0.35); }
            `;
            document.head.appendChild(s);
        }

        let panel = document.createElement('div');
        panel.id = 'wr-control-panel';

        // 双栏模式下只显示背景颜色，隐藏宽屏和自动阅读相关控件
        var rows = [];
        if (!isDoubleColumnMode()) {
            rows.push({ label: '屏幕宽度',  key: 'width',      val: widths[widthIdx].title });
        }
        rows.push({ label: '背景颜色',  key: 'bg',         val: bgColors[bgIdx].name, isBg: true });
        if (!isDoubleColumnMode()) {
            rows.push({ label: '自动模式',  key: 'autoMode',   val: autoModes[autoMode] });
            rows.push({ label: '滚动步长',  key: 'scrollStep', val: scrollStep + 'px', isSub: true });
            rows.push({ label: '滚动间隔',  key: 'scrollInt',  val: scrollInterval + 'ms', isSub: true });
            rows.push({ label: '自动停止',  key: 'autoStop',   val: autoStopMinutes === 0 ? '不停止' : autoStopMinutes + '分钟', isSub: true });
        }

        let rowsHTML = rows.map(r => {
            if (r.isBg) {
                return '<div class="wr-panel-row">' +
                    '<span class="wr-label">' + r.label + '</span>' +
                    '<span class="wr-btn-group">' +
                    '<button data-key="bg_prev" class="wr-btn-arrow">‹</button>' +
                    '<span class="wr-bg-name">' + r.val + '</span>' +
                    '<button data-key="bg_next" class="wr-btn-arrow">›</button>' +
                    '</span></div>';
            }
            let subClass = r.isSub ? ' wr-sub-row' : '';
            if (r.isSub) {
                return '<div class="wr-panel-row' + subClass + '">' +
                    '<span class="wr-label">' + r.label + '</span>' +
                    '<span class="wr-btn-group">' +
                    '<button data-key="' + r.key + '_prev" class="wr-btn-arrow">‹</button>' +
                    '<span class="wr-sub-val" data-key="' + r.key + '">' + r.val + '</span>' +
                    '<button data-key="' + r.key + '_next" class="wr-btn-arrow">›</button>' +
                    '</span></div>';
            }
            return '<div class="wr-panel-row' + subClass + '">' +
                '<span class="wr-label">' + r.label + '</span>' +
                '<button data-key="' + r.key + '">' + r.val + '</button>' +
                '</div>';
        }).join('');

        let bodyClass = autoMode === 0 ? 'wr-auto-on' : '';
        let btnLabel = autoScrollFlag ? '暂停' : '开始阅读';
        let btnClass = autoScrollFlag ? 'wr-btn-stop' : 'wr-btn-play';

        panel.innerHTML = `
            <div class="wr-panel-body ${bodyClass}">
                <h3>悦读助手</h3>
                ${rowsHTML}
                <div class="wr-panel-actions">
                    <button class="${btnClass}" id="wr-btn-toggle">${btnLabel}</button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        let trigger = document.createElement('div');
        trigger.className = 'wr-panel-trigger';
        trigger.addEventListener('mouseenter', function() {
            panel.classList.add('wr-show');
        });
        document.body.appendChild(trigger);

        let hideTimer = null;
        panel.addEventListener('mouseleave', function() {
            hideTimer = setTimeout(function() {
                panel.classList.remove('wr-show');
            }, 500);
        });
        panel.addEventListener('mouseenter', function() {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        });

        panel.querySelectorAll('button[data-key]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                handlePanelClick(btn.getAttribute('data-key'), btn);
            });
        });

        let toggleBtn = panel.querySelector('#wr-btn-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (autoScrollFlag) stopAutoScroll();
                else startAutoScroll();
                updatePanelDisplay();
            });
        }

        console.log('[悦读助手] 控制面板已创建');

        // 监听模式切换按钮点击，动态重建面板
        // 模式切换按钮：isNormalReader（滚动） ↔ isHorizontalReader（双栏）
        var modeBtn = document.querySelector('[class*="isNormalReader"], [class*="isHorizontalReader"]');
        if (modeBtn) {
            modeBtn.addEventListener('click', function() {
                setTimeout(function() {
                    buildControlPanel();
                }, 300);
            });
        }
    }

    // 在预设数组中循环切换值
    function cyclePreset(current, presets, delta) {
        var idx = presets.indexOf(current);
        if (idx === -1) idx = 0;
        return presets[(idx + delta + presets.length) % presets.length];
    }

    function handlePanelClick(key, btn) {
        console.log('[悦读助手] 点击:', key);
        var needReload = false;
        switch (key) {
            case 'width':
                widthIdx = (widthIdx + 1) % widths.length;
                storageSet("widthIdx", widthIdx);
                needReload = true;
                break;
            case 'bg_next':
                {
                    let available = getAvailableColors();
                    let currentIdx = getCurrentColorIndex();
                    let nextIdx = (currentIdx + 1) % available.length;
                    let nextColor = available[nextIdx];
                    bgIdx = bgColors.findIndex(c => c.name === nextColor.name);
                    storageSet("bgIdx", bgIdx);
                    applyBgColor();
                }
                break;
            case 'bg_prev':
                {
                    let available = getAvailableColors();
                    let currentIdx = getCurrentColorIndex();
                    let prevIdx = (currentIdx - 1 + available.length) % available.length;
                    let prevColor = available[prevIdx];
                    bgIdx = bgColors.findIndex(c => c.name === prevColor.name);
                    storageSet("bgIdx", bgIdx);
                    applyBgColor();
                }
                break;
            case 'autoMode':
                autoMode = autoMode === 0 ? 1 : 0;
                storageSet("autoMode", autoMode);
                if (autoMode === 1) stopAutoScroll();
                var pb = document.querySelector('.wr-panel-body');
                if (pb) pb.classList.toggle('wr-auto-on', autoMode === 0);
                break;
            case 'scrollStep_next':
            case 'scrollStep_prev':
                scrollStep = cyclePreset(scrollStep, scrollStepPresets, key.endsWith('_next') ? 1 : -1);
                storageSet("scrollStep", scrollStep);
                if (autoScrollFlag) { stopAutoScroll(); startAutoScroll(); }
                break;
            case 'scrollInt_next':
            case 'scrollInt_prev':
                scrollInterval = cyclePreset(scrollInterval, scrollIntervalPresets, key.endsWith('_next') ? 1 : -1);
                storageSet("scrollInterval", scrollInterval);
                if (autoScrollFlag) { stopAutoScroll(); startAutoScroll(); }
                break;
            case 'autoStop_next':
            case 'autoStop_prev':
                autoStopMinutes = cyclePreset(autoStopMinutes, autoStopPresets, key.endsWith('_next') ? 1 : -1);
                storageSet("autoStopMinutes", autoStopMinutes);
                break;
        }
        updatePanelDisplay();
        if (needReload) {
            console.log('[悦读助手] 宽度变更，1.5秒后刷新页面...');
            setTimeout(function() { location.reload(); }, 1500);
        }
    }

    function updatePanelDisplay() {
        let panel = document.getElementById('wr-control-panel');
        if (!panel) return;

        let map = {
            'width':      widths[widthIdx].title,
            'autoMode':   autoModes[autoMode],
        };
        Object.keys(map).forEach(function(key) {
            let btn = panel.querySelector('button[data-key="' + key + '"]');
            if (btn) btn.textContent = map[key];
        });

        let subMap = {
            'scrollStep': scrollStep + 'px',
            'scrollInt':  scrollInterval + 'ms',
            'autoStop':   autoStopMinutes === 0 ? '不停止' : autoStopMinutes + '分钟',
        };
        Object.keys(subMap).forEach(function(key) {
            let el = panel.querySelector('.wr-sub-val[data-key="' + key + '"]');
            if (el) el.textContent = subMap[key];
        });

        let bgName = panel.querySelector('.wr-bg-name');
        if (bgName) {
            let available = getAvailableColors();
            let current = bgColors[bgIdx];
            // 检查当前主题色是否在当前系统模式下可用
            let isAvailable = available.some(c => c.name === current.name);
            if (!isAvailable) {
                // 如果不可用，切换到第一个可用的主题色
                bgIdx = bgColors.findIndex(c => c.name === available[0].name);
                storageSet("bgIdx", bgIdx);
                applyBgColor();
            }
            bgName.textContent = bgColors[bgIdx].name;
        }

        let toggleBtn = panel.querySelector('#wr-btn-toggle');
        if (toggleBtn) {
            if (autoScrollFlag) {
                toggleBtn.textContent = '暂停';
                toggleBtn.className = 'wr-btn-stop';
            } else {
                toggleBtn.textContent = '开始阅读';
                toggleBtn.className = 'wr-btn-play';
            }
        }
    }

    // ======================== 诊断工具 ========================
    function diagnosePage() {
        console.log('========== [悦读助手] 页面结构诊断 ==========');
        console.log('视口:', window.innerWidth + 'x' + window.innerHeight);

        var targets = [
            'readerContent', 'app_content', 'wr_various_font_provider_wrapper',
            'readerChapterContent', 'renderTargetContainer', 'renderTargetContent'
        ];
        console.log('--- 容器完整诊断 ---');
        targets.forEach(function(cls) {
            var el = document.querySelector('.' + cls) || document.querySelector('[class*="' + cls + '"]');
            if (!el) { console.log('  ' + cls + ': 未找到'); return; }
            var cs = getComputedStyle(el);
            var rect = el.getBoundingClientRect();
            console.log('  ' + cls + ':',
                Math.round(rect.width) + 'px',
                '| max-w:', cs.maxWidth,
                '| w:', cs.width,
                '| margin:', cs.marginLeft + '/' + cs.marginRight,
                '| padding:', cs.paddingLeft + '/' + cs.paddingRight,
                '| display:', cs.display,
                '| box-sizing:', cs.boxSizing,
                '| inline:', (el.getAttribute('style') || '').substring(0, 250));
        });

        // readerChapterContent 实际父元素
        console.log('--- readerChapterContent 实际父元素 ---');
        var chapter = document.querySelector('.readerChapterContent');
        if (chapter) {
            var parent = chapter.parentElement;
            console.log('  父元素:', parent.tagName, parent.className, parent.id);
            var pcs = getComputedStyle(parent);
            console.log('  父 display:', pcs.display, 'width:', parent.getBoundingClientRect().width);
            var children = parent.children;
            console.log('  父有 ' + children.length + ' 个子元素:');
            for (var i = 0; i < children.length; i++) {
                var c = children[i];
                var cr = c.getBoundingClientRect();
                console.log('    [' + i + '] <' + c.tagName + '> class="' + (c.className || '') + '"',
                    Math.round(cr.width) + 'px');
            }
        }

        // 前3个可见文字段落
        console.log('--- 前3个可见文字段落 ---');
        var paras = document.querySelectorAll('.readerChapterContent p, .renderTargetContent p');
        var shown = 0;
        paras.forEach(function(p) {
            if (shown >= 3) return;
            var rect = p.getBoundingClientRect();
            if (rect.width < 100 || rect.height < 10) return;
            shown++;
            var cs = getComputedStyle(p);
            console.log('  <p>',
                Math.round(rect.width) + 'x' + Math.round(rect.height),
                '| max-w:', cs.maxWidth,
                '| w:', cs.width,
                '| margin:', cs.marginLeft + '/' + cs.marginRight,
                '| inline:', (p.getAttribute('style') || '').substring(0, 200));
        });

        console.log('========== 诊断完成 ==========');
    }
    window.__wrDiag = diagnosePage;

    // ======================== 初始化（异步读取配置） ========================
    async function init() {
        console.log('[悦读助手 v1.0] 初始化');

        // 从 chrome.storage 读取配置
        widthIdx = await storageGet("widthIdx", 0);
        bgIdx = Math.min(await storageGet("bgIdx", 0), bgColors.length - 1);
        autoMode = await storageGet("autoMode", 0);
        scrollStep = await storageGet("scrollStep", 2);
        scrollInterval = await storageGet("scrollInterval", 30);
        autoStopMinutes = await storageGet("autoStopMinutes", 0);

        reapplyAllStyles();
        buildControlPanel();
        initSpaceKeyHandler();

        // 监听系统深色/浅色模式变化
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
            console.log('[悦读助手] 系统深色模式切换');
            // 重新应用背景色，会自动调整到当前模式下的主题色
            applyBgColor();
            // 重建控制面板以更新显示
            buildControlPanel();
        });

        // 微信读书自身 JS 会在加载后重新计算布局，覆盖内联样式
        // 延迟再跑一次 applyWidth 确保宽屏生效
        if (widthIdx === 1) {
            setTimeout(applyWidth, 1000);
            setTimeout(applyWidth, 2500);
        }

        // SPA 导航监听
        var lastUrl = location.href;
        var mutationObserver = null;
        var obsTimer = null;

        var _push = history.pushState;
        var _replace = history.replaceState;
        history.pushState = function() { _push.apply(this, arguments); onNav(); };
        history.replaceState = function() { _replace.apply(this, arguments); onNav(); };
        window.addEventListener('popstate', onNav);

        function onNav() {
            if (location.href === lastUrl) return;
            lastUrl = location.href;
            console.log('[悦读助手] SPA 导航检测, 断开旧 DOM 监听, 延迟重新应用样式');

            // 断开旧 MutationObserver，防止内存泄漏
            if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
            if (obsTimer) { clearTimeout(obsTimer); obsTimer = null; }

            setTimeout(function() {
                reapplyAllStyles();
                startObserving(); // 新页面重新监听
            }, 600);
        }

        function startObserving() {
            var target = document.querySelector('.readerContent');
            if (!target) return;
            mutationObserver = new MutationObserver(function() {
                if (obsTimer) clearTimeout(obsTimer);
                obsTimer = setTimeout(function() {
                    applyWidth();
                    applyBgColor();
                }, 400);
            });
            mutationObserver.observe(target, { childList: true, subtree: true });
            console.log('[悦读助手] DOM 监听已启动');
        }

        // 初始监听
        var tryObserve = setInterval(function() {
            if (document.querySelector('.readerContent')) {
                clearInterval(tryObserve);
                startObserving();
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }

    console.log('[悦读助手 v1.0] content script 已加载');

})();
