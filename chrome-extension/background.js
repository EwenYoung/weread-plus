// 微信读书悦读助手 — Background Service Worker
// 代理跨域请求（Manifest V3 content script 无法跨域 fetch）：豆瓣搜索 + Z-Library 搜索 + 微信读书图片资源

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'DOUBAN_SEARCH') {
        searchDouban(request.query)
            .then(data => sendResponse({ ok: true, data }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true; // 异步响应
    }
    if (request.type === 'ZLIB_SEARCH') {
        searchZlib(request.query)
            .then(({ html, mirror }) => sendResponse({ ok: true, html, mirror }))
            .catch(err => sendResponse({ ok: false, error: err.message, mirror: zlibLastGood || ZLIB_MIRRORS[0] }));
        return true;
    }
    if (request.type === 'FETCH_ASSET') {
        fetchAssetBase64(request.url)
            .then(data => sendResponse({ ok: true, data }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
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

// Z-Library 镜像按序尝试，service worker 存活期内复用最近成功者。
// 请求带 credentials 让浏览器附上登录与人机验证通过的 cookie；
// 命中验证页/登录墙（响应里没有结果结构）视为该镜像不可用，换下一个。
const ZLIB_MIRRORS = [
    'https://zh.z-library.im',
    'https://zh.libb.la',
    'https://z-lib.sk',
    'https://z-lib.fm',
    'https://libb.la'
];
let zlibLastGood = '';

async function searchZlib(query) {
    const mirrors = zlibLastGood
        ? [zlibLastGood, ...ZLIB_MIRRORS.filter(m => m !== zlibLastGood)]
        : ZLIB_MIRRORS;

    let lastErr = new Error('ZLIB_BLOCKED');
    for (const mirror of mirrors) {
        try {
            const html = await fetchZlibSearch(mirror, query);
            zlibLastGood = mirror;
            return { html, mirror };
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}

async function fetchZlibSearch(mirror, query) {
    const url = mirror + '/s/' + encodeURIComponent(query) + '/';

    // 每镜像 8 秒超时，防止坏镜像拖死整轮轮询
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
        const resp = await fetch(url, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            },
            credentials: 'include',
            signal: controller.signal
        });

        // 人机验证墙常以 403/513 返回，归为拦截类，换镜像行为与用户提示才准确
        if (resp.status === 403 || resp.status === 513) throw new Error('ZLIB_BLOCKED');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const html = await resp.text();

        if (/DiamWall|Verifying your browser|cf-challenge|Just a moment/i.test(html)) {
            throw new Error('ZLIB_BLOCKED');
        }
        if (!/resItemBox|searchResultBox|z-bookcard|book-item/.test(html)) {
            throw new Error('ZLIB_BLOCKED');
        }

        return html;
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('TIMEOUT');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// 章节图片：仅允许微信读书域（含子域），避免扩展被当作任意地址的代理。
// sendMessage 走 JSON 序列化，二进制以 base64 往返
async function fetchAssetBase64(url) {
    if (!/^https:\/\/([a-z0-9-]+\.)*weread\.qq\.com\//.test(url)) {
        throw new Error('仅支持 weread.qq.com 资源');
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('图片资源 HTTP ' + resp.status);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}
