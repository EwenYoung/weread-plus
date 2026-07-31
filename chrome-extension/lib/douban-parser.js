// 豆瓣搜索结果 HTML 解析（纯逻辑，无 chrome.* / document 依赖）

// 从解析后的文档中提取搜索结果。
// doc 可注入（Node 测试传 fake），querySelectorAll 只需返回带 forEach 的数组。
export function parseDoc(doc) {
    const results = [];
    const items = doc.querySelectorAll('.result');

    items.forEach(function(item) {
        if (item.querySelector('.result-ad')) return;

        const nbg = item.querySelector('a.nbg');
        if (!nbg) return;

        const ratingEl = item.querySelector('.rating_nums, [class*="rating"]');
        const castEl = item.querySelector('.subject-cast');
        const metaEl = item.querySelector('.rating-info .pl, .pl');

        const coverImg = item.querySelector('.pic img') || item.querySelector('a.nbg img') || item.querySelector('img');
        let coverUrl = '';
        if (coverImg) {
            coverUrl = coverImg.getAttribute('data-src') || coverImg.getAttribute('data-original') || coverImg.getAttribute('src') || '';
            if (/pixel|blank|placeholder|default|transparent|grey\.gif/i.test(coverUrl)) {
                coverUrl = '';
            }
            if (coverUrl && coverUrl.indexOf('//') === -1 && coverUrl.charAt(0) === '/') {
                coverUrl = 'https:' + coverUrl;
            }
        }

        const info = {
            title: (nbg.getAttribute('title') || nbg.textContent || '').trim(),
            url: nbg.href || '',
            cover: coverUrl
        };

        if (ratingEl) {
            const rt = ratingEl.textContent.trim();
            if (/[\d.]+/.test(rt)) info.rating = rt.match(/[\d.]+/)[0];
        }

        if (castEl) {
            const parts = castEl.textContent.trim().split('/').map(function(s) { return s.trim(); });
            if (parts.length >= 1) info.author = parts[0];
            if (parts.length >= 2) info.publisher = parts[1];
            if (parts.length >= 3) {
                const y = parts[2].match(/\d{4}/);
                if (y) info.year = y[0];
            }
        }

        // metaEl 备选：.subject-cast 缺失时从 .pl 文本提取
        if (!info.publisher && metaEl) {
            const metaText = metaEl.textContent.trim();
            const yearM = metaText.match(/\d{4}/);
            if (yearM) info.year = yearM[0];
            const pubM = metaText.match(/[^\/\s]+出版社/);
            if (pubM) info.publisher = pubM[0];
        }

        results.push(info);
    });

    return results.slice(0, 10);
}

// 从 HTML 字符串解析（浏览器端入口）
export function parseResults(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return parseDoc(doc);
}
