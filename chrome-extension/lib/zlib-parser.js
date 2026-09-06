// Z-Library 搜索结果 HTML 解析（纯逻辑，无 chrome.* / document 依赖）
// 兼容两代结果页结构：
//   新版（Web Component）：#searchResultBox 下 <z-bookcard href="/book/..." publisher year
//     language extension>，标题/作者在 [slot="title"] / [slot="author"] 插槽
//   旧版（微数据）：.resItemBox/.resItemBoxBooks/.book-item + [itemprop="name"] 等
// 结构参照 SearXNG zlibrary 引擎（旧版）与 z-library 联动用户脚本（新版，2026-02 更新）

// href 相对路径按镜像域名补全；绝对链接原样返回
function resolveUrl(href, baseUrl) {
    if (!href) return '';
    if (!baseUrl || /^https?:\/\//i.test(href) || href.indexOf('//') === 0) return href;
    return baseUrl + (href.charAt(0) === '/' ? '' : '/') + href;
}

// 封面：data-src 优先，剔除 data: 占位与空图；相对路径按镜像域名补全
function coverUrl(img, baseUrl) {
    if (!img) return '';
    const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
    if (!src || /^data:/i.test(src)) return '';
    if (/pixel|blank|placeholder|default|transparent|grey\.gif/i.test(src)) return '';
    return resolveUrl(src, baseUrl);
}

// 新版：z-bookcard 属性即元数据，标题/作者在插槽里；无 href 的卡片（书单聚合等）跳过
function parseCard(card, baseUrl) {
    const href = card.getAttribute('href') || '';
    if (!href) return null;

    const info = { title: '', url: resolveUrl(href, baseUrl), cover: coverUrl(card.querySelector('img'), baseUrl) };

    const titleEl = card.querySelector('[slot="title"]');
    if (titleEl) info.title = titleEl.textContent.trim();
    if (!info.title) info.title = href;

    const authorEl = card.querySelector('[slot="author"]');
    if (authorEl && authorEl.textContent.trim()) info.author = authorEl.textContent.trim();

    const publisher = (card.getAttribute('publisher') || '').trim();
    if (publisher) info.publisher = publisher;

    const year = (card.getAttribute('year') || '').trim();
    if (year) info.year = year;

    const language = (card.getAttribute('language') || '').trim();
    if (language) info.language = language;

    const ext = (card.getAttribute('extension') || '').trim();
    const size = (card.getAttribute('filesize') || '').trim();
    const file = [ext, size].filter(Boolean).join(', ');
    if (file) info.ext = file;

    return info;
}

// 旧版：resItemBox 微数据结构
function parseLegacyItem(item, baseUrl) {
    const link = item.querySelector('a[href*="/book/"]');
    if (!link) return null;

    const titleEl = item.querySelector('[itemprop="name"]');
    const yearEl = item.querySelector('[class*="property_year"] [class*="property_value"]');
    const langEl = item.querySelector('[class*="property_language"] [class*="property_value"]');
    const fileEl = item.querySelector('[class*="property__file"] [class*="property_value"]');
    const ratingEl = item.querySelector('[class*="book-rating-interest-score"]');
    const publisherEl = item.querySelector('a[title="Publisher"]');
    const authorEls = item.querySelectorAll('a[itemprop="author"]');

    const info = {
        title: ((titleEl && titleEl.textContent) || link.textContent || '').trim(),
        url: resolveUrl(link.getAttribute('href'), baseUrl),
        cover: coverUrl(item.querySelector('img'), baseUrl)
    };

    const authors = [];
    authorEls.forEach(function(a) {
        const name = (a.textContent || '').trim();
        if (name) authors.push(name);
    });
    if (authors.length > 0) info.author = authors.join(' / ');

    if (publisherEl) {
        const pub = publisherEl.textContent.trim();
        if (pub) info.publisher = pub;
    }

    if (yearEl) {
        const y = yearEl.textContent.match(/\d{4}/);
        if (y) info.year = y[0];
    }

    if (langEl) {
        const lang = langEl.textContent.trim();
        if (lang) info.language = lang;
    }

    if (fileEl) {
        const ext = fileEl.textContent.trim();
        if (ext) info.ext = ext;
    }

    if (ratingEl) {
        const rt = ratingEl.textContent.match(/[\d.]+/);
        if (rt && parseFloat(rt[0]) > 0) info.rating = rt[0];
    }

    return info;
}

// 从解析后的文档中提取搜索结果。
// doc 可注入（Node 测试传 fake），querySelectorAll 只需返回带 forEach 的数组。
// baseUrl 为响应镜像的域名，用于补全 /book/ 相对链接。
export function parseDoc(doc, baseUrl = '') {
    const scope = (doc.querySelector && doc.querySelector('#searchResultBox')) || doc;
    const results = [];

    // 新版结构优先：存在 z-bookcard 时整页按新版解析，避免新旧嵌套重复计数
    const cards = scope.querySelectorAll('z-bookcard');
    if (cards.length > 0) {
        cards.forEach(function(card) {
            const info = parseCard(card, baseUrl);
            if (info) results.push(info);
        });
        return results.slice(0, 10);
    }

    const items = scope.querySelectorAll('.resItemBox, .resItemBoxBooks, .book-item');
    items.forEach(function(item) {
        const info = parseLegacyItem(item, baseUrl);
        if (info) results.push(info);
    });

    return results.slice(0, 10);
}

// 从 HTML 字符串解析（浏览器端入口）
export function parseResults(html, baseUrl = '') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return parseDoc(doc, baseUrl);
}
