// 微信读书悦读助手 — Background Service Worker
// 代理豆瓣搜索请求（Manifest V3 content script 无法跨域 fetch）

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'DOUBAN_SEARCH') {
        searchDouban(request.query)
            .then(data => sendResponse({ ok: true, data }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true; // 异步响应
    }
});

async function searchDouban(query) {
    const url = 'https://www.douban.com/search?cat=1001&q=' + encodeURIComponent(query);

    // 12秒超时，防止豆瓣挂起永久阻塞
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            },
            signal: controller.signal
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const html = await resp.text();

        if (html.includes('检测到有异常请求') || html.includes('需要验证')) {
            throw new Error('DOUBAN_BLOCKED');
        }

        return html;
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('TIMEOUT');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}
