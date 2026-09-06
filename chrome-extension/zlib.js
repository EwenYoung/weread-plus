// 微信读书悦读助手 — Z-Library 搜索联动
// 与 douban.js 同一触发（首页搜索框回车），结果面板滑出在页面左侧；
// 后台镜像轮询失败时降级为打开镜像搜索页

(function() {
    'use strict';

    console.log('[Z-Library联动] content script 已加载');

    let lastQuery = '';
    let zlibPanel = null;

    function injectStyle() {
        if (document.getElementById('wr-zlib-style')) return;
        let s = document.createElement('style');
        s.id = 'wr-zlib-style';
        s.textContent = `
            #wr-zlib-panel {
                position: fixed; left: 0; top: 60px; width: 380px; max-height: calc(100vh - 80px);
                background: #fff; color: #333; z-index: 99999;
                overflow-y: auto; border-radius: 0 12px 12px 0;
                box-shadow: 2px 0 16px rgba(0,0,0,0.12);
                font-size: 13px; transform: translateX(calc(-100% + 6px));
                transition: transform 0.25s ease;
                border: 1px solid #e8e8e8; border-left: none;
            }
            #wr-zlib-panel:hover { transform: translateX(0); }
            .wr-zlib-header {
                padding: 14px 16px; border-bottom: 1px solid #f0f0f0;
                font-size: 15px; font-weight: bold; color: #0e9488;
                display: flex; justify-content: space-between; align-items: center;
                position: sticky; top: 0; background: #fff; z-index: 1;
            }
            .wr-zlib-list { padding: 8px; }
            .wr-zlib-item {
                display: flex; gap: 10px; padding: 10px 8px;
                border-bottom: 1px solid #f5f5f5;
                cursor: pointer; transition: background 0.15s;
            }
            .wr-zlib-item:hover { background: #f9f9f9; }
            .wr-zlib-cover-wrap { width: 60px; height: 85px; flex-shrink: 0; position: relative; }
            .wr-zlib-cover-img {
                width: 60px; height: 85px; object-fit: cover; border-radius: 3px;
            }
            .wr-zlib-cover-fallback {
                width: 60px; height: 85px; border-radius: 3px; flex-shrink: 0;
                display: flex; align-items: center; justify-content: center;
            }
            .wr-zlib-cover-fallback span {
                color: rgba(255,255,255,0.9); font-size: 10px; font-weight: bold;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                text-align: center; line-height: 1.3; padding: 4px;
                word-break: break-all; overflow: hidden;
                display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical;
            }
            .wr-zlib-info { flex: 1; min-width: 0; }
            .wr-zlib-title { font-size: 14px; color: #333; margin-bottom: 4px; line-height: 1.4; }
            .wr-zlib-meta { font-size: 12px; color: #999; line-height: 1.4; }
            .wr-zlib-rating { color: #0e9488; font-weight: bold; margin-top: 3px; }
            .wr-zlib-loading { padding: 40px; text-align: center; color: #999; }
            .wr-zlib-error { padding: 20px; color: #e74c3c; text-align: center; line-height: 1.8; }
            .wr-zlib-error button {
                margin-top: 6px; padding: 5px 12px; cursor: pointer;
                border: 1px solid #0e9488; border-radius: 4px;
                background: #fff; color: #0e9488; font-size: 12px;
            }
            .wr-zlib-error button:hover { background: #0e9488; color: #fff; }
            #wr-zlib-close { background: none; border: none; color: #bbb; cursor: pointer; font-size: 18px; }
            #wr-zlib-close:hover { color: #333; }
        `;
        document.head.appendChild(s);
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    function searchUrl(query, mirror) {
        return (mirror || 'https://zh.z-library.im') + '/s/' + encodeURIComponent(query) + '/';
    }

    function createPanel(query) {
        if (zlibPanel) zlibPanel.remove();
        zlibPanel = document.createElement('div');
        zlibPanel.id = 'wr-zlib-panel';

        let header = document.createElement('div');
        header.className = 'wr-zlib-header';

        let titleSpan = document.createElement('span');
        titleSpan.textContent = 'Z-Library: ' + query;

        let closeBtn = document.createElement('button');
        closeBtn.id = 'wr-zlib-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function() {
            zlibPanel.remove();
            zlibPanel = null;
        });

        header.appendChild(titleSpan);
        header.appendChild(closeBtn);

        let listEl = document.createElement('div');
        listEl.className = 'wr-zlib-list';
        let loading = document.createElement('div');
        loading.className = 'wr-zlib-loading';
        loading.textContent = '搜索中...';
        listEl.appendChild(loading);

        zlibPanel.appendChild(header);
        zlibPanel.appendChild(listEl);
        document.body.appendChild(zlibPanel);

        return zlibPanel;
    }

    // 失败兜底：面板内给出"打开镜像搜索页"按钮（错误文案为常量，仅 query 走 escapeHTML）
    function renderError(listEl, message, query, mirror) {
        listEl.innerHTML = '<div class="wr-zlib-error">' + escapeHTML(message) +
            '<br><button id="wr-zlib-open">打开 Z-Library 搜索页</button></div>';
        let openBtn = listEl.querySelector('#wr-zlib-open');
        openBtn.addEventListener('click', function() {
            window.open(searchUrl(query, mirror), '_blank');
        });
    }

    async function searchZlib(query, panel) {
        let listEl = panel.querySelector('.wr-zlib-list');

        // 通过 background service worker 代理请求（镜像轮询在后台完成）
        // 整个回调套兜底：动态 import 或解析抛异常时面板不能停在"搜索中"
        chrome.runtime.sendMessage({ type: 'ZLIB_SEARCH', query: query }, async function(resp) {
            try {
                if (chrome.runtime.lastError || !resp) {
                    renderError(listEl, '网络请求失败', query);
                    console.log('[Z-Library联动] 请求错误:', chrome.runtime.lastError ? chrome.runtime.lastError.message : 'no response');
                    return;
                }
                if (!resp.ok) {
                    let errMsg = '网络请求失败';
                    if (resp.error === 'ZLIB_BLOCKED') errMsg = '镜像被人机验证拦截，可直接打开搜索页';
                    else if (resp.error === 'TIMEOUT') errMsg = '请求 Z-Library 超时';
                    else if (resp.error) errMsg = resp.error;
                    renderError(listEl, errMsg, query, resp.mirror);
                    console.log('[Z-Library联动] 请求错误:', resp.error);
                    return;
                }

                // 解析器按需加载（内容脚本 import() 必须用扩展绝对路径，chrome 会缓存）
                const { parseResults } = await import(chrome.runtime.getURL('lib/zlib-parser.js'));
                let results = parseResults(resp.html, resp.mirror);
                console.log('[Z-Library联动] 响应长度:', resp.html.length, '镜像:', resp.mirror, '解析结果:', results.length);

                if (results.length === 0) {
                    // 关键路径匹配为空必须打日志：新旧版结构标记位置是排查解析失效的第一线索
                    console.log('[Z-Library联动] 解析为空。标记位置 z-bookcard:', resp.html.indexOf('z-bookcard'),
                        'resItemBox:', resp.html.indexOf('resItemBox'),
                        'searchResultBox:', resp.html.indexOf('searchResultBox'),
                        '响应长度:', resp.html.length);
                    renderError(listEl, '未解析到结果（可能无命中，或需登录 Z-Library）', query, resp.mirror);
                    return;
                }

                renderResults(listEl, results);
            } catch (err) {
                console.log('[Z-Library联动] 结果处理异常:', err && err.message);
                renderError(listEl, '结果处理失败', query, resp && resp.mirror);
            }
        });
    }

    let placeholderColors = [
        'background:linear-gradient(135deg,#0e9488,#4fb3a9);',
        'background:linear-gradient(135deg,#2c5364,#203a43);',
        'background:linear-gradient(135deg,#0093E9,#80D0C7);',
        'background:linear-gradient(135deg,#1f4037,#99f2c8);',
        'background:linear-gradient(135deg,#0f2027,#2c5364);',
        'background:linear-gradient(135deg,#136a8a,#267871);',
        'background:linear-gradient(135deg,#0e9488,#2c5364);',
        'background:linear-gradient(135deg,#00b09b,#96c93d);'
    ];

    function renderResults(listEl, results) {
        listEl.innerHTML = '';

        results.forEach(function(b, i) {
            let colorStyle = placeholderColors[i % placeholderColors.length];
            let title = b.title || '?';

            //封面 wrap
            let wrap = document.createElement('div');
            wrap.className = 'wr-zlib-cover-wrap';

            if (b.cover) {
                let img = document.createElement('img');
                img.className = 'wr-zlib-cover-img';
                img.src = b.cover;
                img.referrerPolicy = 'no-referrer';
                img.loading = 'lazy';
                img.alt = '';
                img.addEventListener('error', function() {
                    img.style.display = 'none';
                    fallback.style.display = 'flex';
                });
                wrap.appendChild(img);
            }

            let fallback = document.createElement('div');
            fallback.className = 'wr-zlib-cover-fallback';
            fallback.style.cssText = colorStyle + (b.cover ? ';display:none' : '');
            let fallbackSpan = document.createElement('span');
            fallbackSpan.textContent = title;
            fallback.appendChild(fallbackSpan);
            wrap.appendChild(fallback);

            // 信息区
            let info = document.createElement('div');
            info.className = 'wr-zlib-info';

            let titleEl = document.createElement('div');
            titleEl.className = 'wr-zlib-title';
            titleEl.textContent = (i + 1) + '. ' + title;
            info.appendChild(titleEl);

            let meta = document.createElement('div');
            meta.className = 'wr-zlib-meta';
            meta.textContent = [b.author, b.year, b.language, b.ext].filter(Boolean).join(' | ');
            info.appendChild(meta);

            if (b.rating) {
                let rating = document.createElement('div');
                rating.className = 'wr-zlib-rating';
                rating.textContent = '♥ ' + b.rating;
                info.appendChild(rating);
            }

            // 条目
            let item = document.createElement('div');
            item.className = 'wr-zlib-item';
            item.dataset.url = b.url;
            item.appendChild(wrap);
            item.appendChild(info);
            item.addEventListener('click', function() {
                window.open(b.url, '_blank');
            });

            listEl.appendChild(item);
        });
    }

    // 监听搜索框回车（与 douban.js 并行触发，各出各的面板）
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        let active = document.activeElement;
        if (!active || !active.classList.contains('wr_index_page_search_bar_input')) return;
        let query = active.value.trim();
        if (!query || query === lastQuery) return;
        lastQuery = query;

        console.log('[Z-Library联动] 搜索:', query);
        injectStyle();
        let panel = createPanel(query);
        searchZlib(query, panel);
    }, true);

    console.log('[Z-Library联动] 已就绪');
})();
