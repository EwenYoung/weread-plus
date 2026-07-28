// ==UserScript==
// @name         微信读书 · 豆瓣搜索联动
// @version      1.0.0
// @description  在微信读书首页搜索时，同步显示豆瓣搜索结果
// @author       Ewen
// @match        https://weread.qq.com/
// @icon         https://weread.qq.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log('[豆瓣联动] 脚本已加载');

    var lastQuery = '';
    var doubanPanel = null;

    // 样式
    function injectStyle() {
        if (document.getElementById('wr-douban-style')) return;
        var s = document.createElement('style');
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

    function createPanel(query) {
        if (doubanPanel) doubanPanel.remove();
        doubanPanel = document.createElement('div');
        doubanPanel.id = 'wr-douban-panel';
        doubanPanel.innerHTML =
            '<div class="wr-douban-header">' +
                '<span>豆瓣: ' + query + '</span>' +
                '<button id="wr-douban-close">✕</button>' +
            '</div>' +
            '<div class="wr-douban-list"><div class="wr-douban-loading">搜索中...</div></div>';
        document.body.appendChild(doubanPanel);
        doubanPanel.querySelector('#wr-douban-close').addEventListener('click', function() {
            doubanPanel.remove();
            doubanPanel = null;
        });
        return doubanPanel;
    }

    function searchDouban(query, panel) {
        var listEl = panel.querySelector('.wr-douban-list');

        // 豆瓣图书搜索
        var url = 'https://www.douban.com/search?cat=1001&q=' + encodeURIComponent(query);

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 12000,
            onload: function(resp) {
                var html = resp.responseText;

                // 检查是否被反爬
                if (html.indexOf('检测到有异常请求') > -1 || html.indexOf('需要验证') > -1) {
                    listEl.innerHTML = '<div class="wr-douban-error">豆瓣反爬拦截，请稍后再试</div>';
                    console.log('[豆瓣联动] 被豆瓣反爬拦截');
                    return;
                }

                // 尝试多种解析方式
                var results = parseResults(html);

                // 调试：输出 HTML 片段
                console.log('[豆瓣联动] 响应长度:', html.length);
                console.log('[豆瓣联动] 解析到结果数:', results.length);

                if (results.length === 0) {
                    // 输出部分 HTML 用于调试
                    var snippet = html.substring(0, 3000);
                    console.log('[豆瓣联动] HTML 前3000字符:', snippet);
                    listEl.innerHTML = '<div class="wr-douban-error">未解析到结果，已输出 HTML 到控制台</div>';
                    return;
                }

                renderResults(listEl, results);
            },
            onerror: function(err) {
                listEl.innerHTML = '<div class="wr-douban-error">网络请求失败，可能被 CORS 或网络限制</div>';
                console.log('[豆瓣联动] 请求错误:', err);
            },
            ontimeout: function() {
                listEl.innerHTML = '<div class="wr-douban-error">请求豆瓣超时</div>';
            }
        });
    }

    function parseResults(html) {
        var results = [];

        // 用浏览器 DOM 解析，比正则可靠
        var temp = document.createElement('div');
        temp.style.display = 'none';
        temp.innerHTML = html;
        document.body.appendChild(temp);

        try {
            var items = temp.querySelectorAll('.result');
            items.forEach(function(item) {
                // 跳过广告
                if (item.querySelector('.result-ad')) return;

                var nbg = item.querySelector('a.nbg');
                if (!nbg) return;

                var ratingEl = item.querySelector('.rating_nums, [class*="rating"]');
                var castEl = item.querySelector('.subject-cast');
                var metaEl = item.querySelector('.rating-info .pl, .pl');

                // 封面图：优先 data-src（懒加载）、其次 src，尝试多种选择器
                var coverImg = item.querySelector('.pic img') || item.querySelector('a.nbg img') || item.querySelector('img');
                var coverUrl = '';
                if (coverImg) {
                    // 豆瓣常用懒加载属性
                    coverUrl = coverImg.getAttribute('data-src') || coverImg.getAttribute('data-original') || coverImg.src || '';
                    // 跳过占位图
                    if (/pixel|blank|placeholder|default|transparent|grey\.gif/i.test(coverUrl)) {
                        coverUrl = '';
                    }
                    // 相对 URL 转绝对
                    if (coverUrl && coverUrl.indexOf('//') === -1 && coverUrl.charAt(0) === '/') {
                        coverUrl = 'https:' + coverUrl;
                    }
                }

                var info = {
                    title: (nbg.getAttribute('title') || nbg.textContent || '').trim(),
                    url: nbg.href || '',
                    cover: coverUrl
                };

                // 评分
                if (ratingEl) {
                    var rt = ratingEl.textContent.trim();
                    if (/[\d.]+/.test(rt)) info.rating = rt.match(/[\d.]+/)[0];
                }

                // 作者/出版社/年份
                if (castEl) {
                    var parts = castEl.textContent.trim().split('/').map(function(s) { return s.trim(); });
                    if (parts.length >= 1) info.author = parts[0];
                    if (parts.length >= 2) info.publisher = parts[1];
                    if (parts.length >= 3) {
                        var y = parts[2].match(/\d{4}/);
                        if (y) info.year = y[0];
                    }
                }

                // 简介中的出版信息作为备选
                if (!info.publisher && metaEl) {
                    var metaText = metaEl.textContent.trim();
                    var yearM = metaText.match(/\d{4}/);
                    if (yearM) info.year = yearM[0];
                    var pubM = metaText.match(/[^\/\s]+出版社/);
                    if (pubM) info.publisher = pubM[0];
                }

                results.push(info);
            });
        } finally {
            temp.remove();
        }

        console.log('[豆瓣联动] 解析详情:', results.map(function(r) {
            return r.title + ' | ' + (r.rating || '?') + '分 | ' + (r.author || '?') + ' | ' + (r.publisher || '?');
        }));

        return results.slice(0, 10);
    }

    // 无封面时的趣味占位 — 渐变色底 + 书名首字
    var placeholderColors = [
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
        var html = '';
        results.forEach(function(b, i) {
            var coverHTML;
            var title = b.title || '?';
            var colorStyle = placeholderColors[i % placeholderColors.length];
            if (b.cover) {
                coverHTML = '<div class="wr-douban-cover-wrap">' +
                    '<img class="wr-douban-cover-img" src="' + b.cover +
                    '" referrerpolicy="no-referrer" loading="lazy"' +
                    ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" alt="">' +
                    '<div class="wr-douban-cover-fallback" style="display:none;' + colorStyle + '">' +
                    '<span>' + title + '</span></div>' +
                    '</div>';
            } else {
                coverHTML = '<div class="wr-douban-cover-wrap">' +
                    '<div class="wr-douban-cover-fallback" style="' + colorStyle + '">' +
                    '<span>' + title + '</span></div>' +
                    '</div>';
            }
            html += '<div class="wr-douban-item" data-url="' + b.url + '">' + coverHTML +
                '<div class="wr-douban-info">' +
                    '<div class="wr-douban-title">' + (i + 1) + '. ' + b.title + '</div>' +
                    '<div class="wr-douban-meta">' +
                        (b.author || '') +
                        (b.publisher ? ' | ' + b.publisher : '') +
                        (b.year ? ' | ' + b.year : '') +
                    '</div>' +
                    (b.rating ? '<div class="wr-douban-rating">★ ' + b.rating + '</div>' : '') +
                '</div>' +
            '</div>';
        });
        listEl.innerHTML = html;

        // 点击打开豆瓣
        listEl.querySelectorAll('.wr-douban-item').forEach(function(item) {
            item.addEventListener('click', function() {
                window.open(item.dataset.url, '_blank');
            });
        });
    }

    // 监听搜索框回车
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        var active = document.activeElement;
        if (!active || !active.classList.contains('wr_index_page_search_bar_input')) return;
        var query = active.value.trim();
        if (!query || query === lastQuery) return;
        lastQuery = query;

        console.log('[豆瓣联动] 搜索:', query);
        injectStyle();
        var panel = createPanel(query);
        searchDouban(query, panel);
    }, true);

    console.log('[豆瓣联动] 已就绪');
})();
