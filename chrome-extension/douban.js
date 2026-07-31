// 微信读书悦读助手 — 豆瓣搜索联动
// 监听首页搜索框回车，通过 background service worker 代理请求豆瓣

(function() {
    'use strict';

    console.log('[豆瓣联动] content script 已加载');

    let lastQuery = '';
    let doubanPanel = null;

    // 样式
    function injectStyle() {
        if (document.getElementById('wr-douban-style')) return;
        let s = document.createElement('style');
        s.id = 'wr-douban-style';
        s.textContent = `
            #wr-douban-panel {
                position: fixed; right: 0; top: 60px; width: 380px; max-height: calc(100vh - 80px);
                background: #fff; color: #333; z-index: 99999;
                overflow-y: auto; border-radius: 12px 0 0 12px;
                box-shadow: -2px 0 16px rgba(0,0,0,0.12);
                font-size: 13px; transform: translateX(calc(100% - 6px));
                transition: transform 0.25s ease;
                border: 1px solid #e8e8e8; border-right: none;
            }
            #wr-douban-panel:hover { transform: translateX(0); }
            .wr-douban-header {
                padding: 14px 16px; border-bottom: 1px solid #f0f0f0;
                font-size: 15px; font-weight: bold; color: #07c160;
                display: flex; justify-content: space-between; align-items: center;
                position: sticky; top: 0; background: #fff; z-index: 1;
            }
            .wr-douban-list { padding: 8px; }
            .wr-douban-item {
                display: flex; gap: 10px; padding: 10px 8px;
                border-bottom: 1px solid #f5f5f5;
                cursor: pointer; transition: background 0.15s;
            }
            .wr-douban-item:hover { background: #f9f9f9; }
            .wr-douban-cover-wrap { width: 60px; height: 85px; flex-shrink: 0; position: relative; }
            .wr-douban-cover-img {
                width: 60px; height: 85px; object-fit: cover; border-radius: 3px;
            }
            .wr-douban-cover-fallback {
                width: 60px; height: 85px; border-radius: 3px; flex-shrink: 0;
                display: flex; align-items: center; justify-content: center;
            }
            .wr-douban-cover-fallback span {
                color: rgba(255,255,255,0.9); font-size: 10px; font-weight: bold;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                text-align: center; line-height: 1.3; padding: 4px;
                word-break: break-all; overflow: hidden;
                display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical;
            }
            .wr-douban-info { flex: 1; min-width: 0; }
            .wr-douban-title { font-size: 14px; color: #333; margin-bottom: 4px; line-height: 1.4; }
            .wr-douban-meta { font-size: 12px; color: #999; line-height: 1.4; }
            .wr-douban-rating { color: #e67e22; font-weight: bold; margin-top: 3px; }
            .wr-douban-loading { padding: 40px; text-align: center; color: #999; }
            .wr-douban-error { padding: 20px; color: #e74c3c; text-align: center; }
            #wr-douban-close { background: none; border: none; color: #bbb; cursor: pointer; font-size: 18px; }
            #wr-douban-close:hover { color: #333; }
        `;
        document.head.appendChild(s);
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    function createPanel(query) {
        if (doubanPanel) doubanPanel.remove();
        doubanPanel = document.createElement('div');
        doubanPanel.id = 'wr-douban-panel';

        let header = document.createElement('div');
        header.className = 'wr-douban-header';

        let titleSpan = document.createElement('span');
        titleSpan.textContent = '豆瓣: ' + query;

        let closeBtn = document.createElement('button');
        closeBtn.id = 'wr-douban-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function() {
            doubanPanel.remove();
            doubanPanel = null;
        });

        header.appendChild(titleSpan);
        header.appendChild(closeBtn);

        let listEl = document.createElement('div');
        listEl.className = 'wr-douban-list';
        let loading = document.createElement('div');
        loading.className = 'wr-douban-loading';
        loading.textContent = '搜索中...';
        listEl.appendChild(loading);

        doubanPanel.appendChild(header);
        doubanPanel.appendChild(listEl);
        document.body.appendChild(doubanPanel);

        return doubanPanel;
    }

    async function searchDouban(query, panel) {
        let listEl = panel.querySelector('.wr-douban-list');

        // 通过 background service worker 代理请求
        chrome.runtime.sendMessage({ type: 'DOUBAN_SEARCH', query: query }, async function(resp) {
            if (chrome.runtime.lastError || !resp) {
                listEl.innerHTML = '<div class="wr-douban-error">网络请求失败</div>';
                console.log('[豆瓣联动] 请求错误:', chrome.runtime.lastError ? chrome.runtime.lastError.message : 'no response');
                return;
            }
            if (!resp.ok) {
                let errMsg = '网络请求失败';
                if (resp.error === 'DOUBAN_BLOCKED') errMsg = '豆瓣反爬拦截，请稍后再试';
                else if (resp.error === 'TIMEOUT') errMsg = '请求豆瓣超时';
                else if (resp.error) errMsg = resp.error;
                listEl.innerHTML = '<div class="wr-douban-error">' + escapeHTML(errMsg) + '</div>';
                console.log('[豆瓣联动] 请求错误:', resp.error);
                return;
            }

            // 解析器按需加载（内容脚本 import() 必须用扩展绝对路径，chrome 会缓存）
            const { parseResults } = await import(chrome.runtime.getURL('lib/douban-parser.js'));
            let results = parseResults(resp.data);
            console.log('[豆瓣联动] 响应长度:', resp.data.length, '解析结果:', results.length);

            if (results.length === 0) {
                listEl.innerHTML = '<div class="wr-douban-error">未解析到结果</div>';
                return;
            }

            renderResults(listEl, results);
        });
    }

    let placeholderColors = [
        'background:linear-gradient(135deg,#667eea,#764ba2);',
        'background:linear-gradient(135deg,#f093fb,#f5576c);',
        'background:linear-gradient(135deg,#4facfe,#00f2fe);',
        'background:linear-gradient(135deg,#43e97b,#38f9d7);',
        'background:linear-gradient(135deg,#fa709a,#fee140);',
        'background:linear-gradient(135deg,#a18cd1,#fbc2eb);',
        'background:linear-gradient(135deg,#fccb90,#d57eeb);',
        'background:linear-gradient(135deg,#e0c3fc,#8ec5fc);',
        'background:linear-gradient(135deg,#f5576c,#ff6f00);',
        'background:linear-gradient(135deg,#30cfd0,#330867);',
    ];

    function renderResults(listEl, results) {
        listEl.innerHTML = '';

        results.forEach(function(b, i) {
            let colorStyle = placeholderColors[i % placeholderColors.length];
            let title = b.title || '?';

            //封面 wrap
            let wrap = document.createElement('div');
            wrap.className = 'wr-douban-cover-wrap';

            if (b.cover) {
                let img = document.createElement('img');
                img.className = 'wr-douban-cover-img';
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
            fallback.className = 'wr-douban-cover-fallback';
            fallback.style.cssText = colorStyle + (b.cover ? ';display:none' : '');
            let fallbackSpan = document.createElement('span');
            fallbackSpan.textContent = title;
            fallback.appendChild(fallbackSpan);
            wrap.appendChild(fallback);

            // 信息区
            let info = document.createElement('div');
            info.className = 'wr-douban-info';

            let titleEl = document.createElement('div');
            titleEl.className = 'wr-douban-title';
            titleEl.textContent = (i + 1) + '. ' + b.title;
            info.appendChild(titleEl);

            let meta = document.createElement('div');
            meta.className = 'wr-douban-meta';
            meta.textContent = [b.author, b.publisher, b.year].filter(Boolean).join(' | ');
            info.appendChild(meta);

            if (b.rating) {
                let rating = document.createElement('div');
                rating.className = 'wr-douban-rating';
                rating.textContent = '★ ' + b.rating;
                info.appendChild(rating);
            }

            // 条目
            let item = document.createElement('div');
            item.className = 'wr-douban-item';
            item.dataset.url = b.url;
            item.appendChild(wrap);
            item.appendChild(info);
            item.addEventListener('click', function() {
                window.open(b.url, '_blank');
            });

            listEl.appendChild(item);
        });
    }

    // 监听搜索框回车
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        let active = document.activeElement;
        if (!active || !active.classList.contains('wr_index_page_search_bar_input')) return;
        let query = active.value.trim();
        if (!query || query === lastQuery) return;
        lastQuery = query;

        console.log('[豆瓣联动] 搜索:', query);
        injectStyle();
        let panel = createPanel(query);
        searchDouban(query, panel);
    }, true);

    console.log('[豆瓣联动] 已就绪');
})();
