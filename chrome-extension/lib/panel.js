// 控制面板模块：构建 + 交互 + 刷新
// 配置变化经 store 订阅自动刷新；开始/暂停直调 autoReader（spec D4）

export function createPanel({ store, autoReader, doc, win, widths, bgColors, autoModes, isDoubleColumnMode, onModeChange }) {
    function buildControlPanel() {
        let old = doc.getElementById('wr-control-panel');
        if (old) old.remove();

        if (!doc.getElementById('wr-panel-style')) {
            let s = doc.createElement('style');
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

                /* === 深色面板 === */
                body:not(.wr_whiteTheme) .wr-panel-body {
                    background: #1c1c22;
                    background-image:
                        radial-gradient(ellipse at 20% 50%, rgba(140,120,90,0.06) 0%, transparent 50%),
                        radial-gradient(ellipse at 80% 20%, rgba(140,120,90,0.04) 0%, transparent 50%);
                    color: #c8c0b4;
                    box-shadow: -4px 4px 20px rgba(0,0,0,0.35), inset 0 0 30px rgba(140,120,90,0.03);
                    border-color: #2e2e38;
                }
                body:not(.wr_whiteTheme) .wr-panel-body h3 {
                    color: #a89880;
                    border-bottom-color: #2e2e38;
                }
                body:not(.wr_whiteTheme) .wr-panel-row {
                    border-bottom-color: rgba(140,120,90,0.12);
                }
                body:not(.wr_whiteTheme) .wr-panel-row span.wr-label {
                    color: #8a8070;
                }
                body:not(.wr_whiteTheme) .wr-panel-row button {
                    background: rgba(140,120,90,0.12);
                    border-color: rgba(140,120,90,0.2);
                    color: #b0a490;
                }
                body:not(.wr_whiteTheme) .wr-panel-row button:hover {
                    background: rgba(140,120,90,0.25);
                    border-color: rgba(140,120,90,0.4);
                }
                body:not(.wr_whiteTheme) .wr-panel-row button.wr-active {
                    background: rgba(140,120,90,0.25);
                    border-color: rgba(140,120,90,0.4);
                }
                body:not(.wr_whiteTheme) .wr-btn-arrow {
                    background: rgba(140,120,90,0.12);
                    border-color: rgba(140,120,90,0.2);
                    color: #b0a490;
                }
                body:not(.wr_whiteTheme) .wr-btn-arrow:hover {
                    background: rgba(140,120,90,0.3);
                    border-color: rgba(140,120,90,0.5);
                }
                body:not(.wr_whiteTheme) .wr-bg-name {
                    color: #8a8070;
                }
                body:not(.wr_whiteTheme) .wr-sub-val {
                    color: #b0a490;
                }
                body:not(.wr_whiteTheme) .wr-panel-body.wr-auto-on .wr-sub-row {
                    border-bottom-color: rgba(140,120,90,0.12);
                }
                body:not(.wr_whiteTheme) .wr-btn-play {
                    background: rgba(140,120,90,0.18);
                    color: #b0a490;
                    border-color: rgba(140,120,90,0.25);
                }
                body:not(.wr_whiteTheme) .wr-btn-play:hover {
                    background: rgba(140,120,90,0.32);
                }
                body:not(.wr_whiteTheme) .wr-btn-stop {
                    background: rgba(110,90,60,0.2);
                    color: #a89880;
                    border-color: rgba(110,90,60,0.3);
                }
                body:not(.wr_whiteTheme) .wr-btn-stop:hover {
                    background: rgba(110,90,60,0.35);
                }
                body:not(.wr_whiteTheme) .wr-btn-mode {
                    background: rgba(140,120,90,0.18);
                    color: #b0a490;
                }
                body:not(.wr_whiteTheme) .wr-btn-mode:hover {
                    background: rgba(140,120,90,0.32);
                }
            `;
            doc.head.appendChild(s);
        }

        let panel = doc.createElement('div');
        panel.id = 'wr-control-panel';

        // 双栏模式下只显示主题颜色，隐藏宽屏和自动阅读相关控件
        let rows = [];
        if (!isDoubleColumnMode()) {
            rows.push({ label: '宽屏',  key: 'width',      val: widths[store.get('widthIdx')].title });
        }
        rows.push({ label: '主题颜色',  key: 'bg',         val: bgColors[store.get('bgIdx')].name, isBg: true });
        if (!isDoubleColumnMode()) {
            rows.push({ label: '自动模式',  key: 'autoMode',   val: autoModes[store.get('autoMode')] });
            rows.push({ label: '滚动步长',  key: 'scrollStep', val: store.get('scrollStep') + 'px', isSub: true });
            rows.push({ label: '滚动间隔',  key: 'scrollInt',  val: store.get('scrollInterval') + 'ms', isSub: true });
            rows.push({ label: '自动停止',  key: 'autoStop',   val: store.get('autoStopMinutes') === 0 ? '不停止' : store.get('autoStopMinutes') + '分钟', isSub: true });
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

        let bodyClass = store.get('autoMode') === 0 ? 'wr-auto-on' : '';
        let btnLabel = autoReader.isRunning() ? '暂停' : '开始阅读';
        let btnClass = autoReader.isRunning() ? 'wr-btn-stop' : 'wr-btn-play';
        let isDual = isDoubleColumnMode();

        panel.innerHTML = `
            <div class="wr-panel-body ${bodyClass}">
                <h3>悦读助手</h3>
                ${rowsHTML}
                ${isDual ? '' : '<div class="wr-panel-actions"><button class="' + btnClass + '" id="wr-btn-toggle">' + btnLabel + '</button></div>'}
            </div>
        `;

        doc.body.appendChild(panel);

        let trigger = doc.createElement('div');
        trigger.className = 'wr-panel-trigger';
        let hideTimer = null;
        trigger.addEventListener('mouseenter', function() {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            panel.classList.add('wr-show');
        });
        // 移出触发条（未进入面板）时延迟隐藏，避免面板常驻遮挡内容
        trigger.addEventListener('mouseleave', function() {
            hideTimer = setTimeout(function() {
                panel.classList.remove('wr-show');
            }, 500);
        });
        doc.body.appendChild(trigger);

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
                handlePanelClick(btn.getAttribute('data-key'));
            });
        });

        let toggleBtn = panel.querySelector('#wr-btn-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (autoReader.isRunning()) autoReader.stop();
                else autoReader.start();
                updatePanelDisplay();
            });
        }

        console.log('[悦读助手] 控制面板已创建');

        // 监听模式切换按钮点击，动态重建面板
        // 精确选择器：避免 [class*="..."] 子串匹配命中大容器导致点击即重建面板
        let modeBtn = doc.querySelector('.readerControls_item.isNormalReader, .readerControls_item.isHorizontalReader');
        if (modeBtn && !modeBtn.dataset.wrModeListenerAttached) {
            modeBtn.dataset.wrModeListenerAttached = '1';
            modeBtn.addEventListener('click', function() {
                setTimeout(function() {
                    onModeChange();
                }, 300);
            });
        }
    }

    function handlePanelClick(key) {
        console.log('[悦读助手] 点击:', key);
        // 状态变更统一走 PreferencesStore（含 key 协议与持久化）
        let action = store.handleAction(key);
        if (action.reload) {
            console.log('[悦读助手] 宽度变更，1.5秒后刷新页面...');
            setTimeout(function() { win.location.reload(); }, 1500);
        }
        if (action.scrollRestart && autoReader.isRunning()) {
            autoReader.stop();
            autoReader.start();
        }
        updatePanelDisplay();
    }

    function updatePanelDisplay() {
        let panel = doc.getElementById('wr-control-panel');
        if (!panel) return;

        let map = {
            'width':      widths[store.get('widthIdx')].title,
            'autoMode':   autoModes[store.get('autoMode')],
        };
        Object.keys(map).forEach(function(key) {
            let btn = panel.querySelector('button[data-key="' + key + '"]');
            if (btn) btn.textContent = map[key];
        });

        let subMap = {
            'scrollStep': store.get('scrollStep') + 'px',
            'scrollInt':  store.get('scrollInterval') + 'ms',
            'autoStop':   store.get('autoStopMinutes') === 0 ? '不停止' : store.get('autoStopMinutes') + '分钟',
        };
        Object.keys(subMap).forEach(function(key) {
            let el = panel.querySelector('.wr-sub-val[data-key="' + key + '"]');
            if (el) el.textContent = subMap[key];
        });

        let bgName = panel.querySelector('.wr-bg-name');
        if (bgName) {
            // 当前主题色在系统模式下不可用时回退（内部 set 会触发订阅者重应用样式）
            store.ensureThemeAvailable();
            bgName.textContent = bgColors[store.get('bgIdx')].name;
        }

        let toggleBtn = panel.querySelector('#wr-btn-toggle');
        if (toggleBtn) {
            if (autoReader.isRunning()) {
                toggleBtn.textContent = '暂停';
                toggleBtn.className = 'wr-btn-stop';
            } else {
                toggleBtn.textContent = '开始阅读';
                toggleBtn.className = 'wr-btn-play';
            }
        }
    }

    // 配置变化自动刷新显示（spec D4：panel 订阅 store）
    store.subscribe(function(key) {
        if (key === 'loaded') return;
        updatePanelDisplay();
        if (key === 'autoMode') {
            // 注意：wr-auto-on 在 .wr-panel-body 上（容器 #wr-control-panel 是外层动画元素）
            let pb = doc.querySelector('.wr-panel-body');
            if (pb) pb.classList.toggle('wr-auto-on', store.get('autoMode') === 0);
        }
    });

    return { build: buildControlPanel, refresh: updatePanelDisplay };
}
