// 微信读书章节接口协议 + EPUB 打包 + 导出装配
// 协议依据 finlater/weread.koplugin 参考实现逆向所得（取证 2026-08-30，
// 本地副本 .scratch/epub-export/ref/，微信读书改版时先看签名/解码层测试是否变红）。
// 纯函数层顶层不触碰 chrome API 与 DOM；浏览器装配只经工厂注入的 doc/win/fetch。

// ======================== MD5（RFC 1321） ========================
// 接口校验与 b/c 编码必需，浏览器无内置 MD5，手写最小实现

const MD5_SHIFT = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];
const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);

function md5Digest(bytes) {
    const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const bitLength = bytes.length * 8;
    padded[padded.length - 8] = bitLength & 0xff;
    padded[padded.length - 7] = (bitLength >>> 8) & 0xff;
    padded[padded.length - 6] = (bitLength >>> 16) & 0xff;
    padded[padded.length - 5] = (bitLength >>> 24) & 0xff;

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const words = new Uint32Array(16);
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) {
            const at = offset + i * 4;
            words[i] = padded[at] | (padded[at + 1] << 8) | (padded[at + 2] << 16) | (padded[at + 3] << 24);
        }
        let a = a0, b = b0, c = c0, d = d0;
        for (let i = 0; i < 64; i++) {
            let f, g;
            if (i < 16) { f = (b & c) | (~b & d); g = i; }
            else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
            else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
            else { f = c ^ (b | ~d); g = (7 * i) % 16; }
            const sum = (a + f + MD5_K[i] + words[g]) | 0;
            const oldD = d;
            d = c;
            c = b;
            b = (b + ((sum << MD5_SHIFT[i]) | (sum >>> (32 - MD5_SHIFT[i])))) | 0;
            a = oldD;
        }
        a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
    }

    const digest = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((word, i) => {
        digest[i * 4] = word & 0xff;
        digest[i * 4 + 1] = (word >>> 8) & 0xff;
        digest[i * 4 + 2] = (word >>> 16) & 0xff;
        digest[i * 4 + 3] = (word >>> 24) & 0xff;
    });
    return digest;
}

const HEX = '0123456789abcdef';

export function md5Hex(input) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const digest = md5Digest(bytes);
    let hex = '';
    for (let i = 0; i < 16; i++) hex += HEX[digest[i] >> 4] + HEX[digest[i] & 15];
    return hex;
}

// ======================== b/c 编码 ========================
// bookId/chapterUid/ct → 编码串，与阅读页 URL hash 同源的正向函数

export function wereadE(value) {
    const s = String(value);
    const hash = md5Hex(s);
    let result = hash.slice(0, 3);

    let chunks;
    let typeFlag;
    if (/^[0-9]+$/.test(s)) {
        chunks = [];
        for (let i = 0; i < s.length; i += 9) chunks.push(Number(s.slice(i, i + 9)).toString(16));
        typeFlag = '3';
    } else {
        let joined = '';
        for (const ch of s) joined += ch.codePointAt(0).toString(16);
        chunks = [joined];
        typeFlag = '4';
    }

    result += typeFlag + '2' + hash.slice(-2);
    chunks.forEach((chunk, index) => {
        result += chunk.length.toString(16).padStart(2, '0') + chunk;
        if (index < chunks.length - 1) result += 'g';
    });
    if (result.length < 20) result += hash.slice(0, 20 - result.length);
    result += md5Hex(result).slice(0, 3);
    return result;
}

// ======================== 签名 ========================

function jsString(value) {
    if (value === true) return 'true';
    if (value === false) return 'false';
    if (value === null || value === undefined) return 'null';
    return String(value);
}

// 对齐 Python urllib.parse.quote(safe='')：encodeURIComponent 不转义 !'()*，此处补齐
function quoteParam(value) {
    return encodeURIComponent(jsString(value))
        .replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
}

export function sortedQuery(params) {
    return Object.keys(params).sort()
        .map((key) => key + '=' + quoteParam(params[key]))
        .join('&');
}

export function wereadSign(query) {
    let a = 0x15051505;
    let b = 0x15051505;
    const length = query.length;
    let i = length - 1;
    while (i > 0) {
        a = (a ^ (query.charCodeAt(i) << ((length - i) % 30))) & 0x7fffffff;
        b = (b ^ (query.charCodeAt(i - 1) << (i % 30))) & 0x7fffffff;
        i -= 2;
    }
    return (a + b).toString(16);
}

// 组装分片请求参数；now（毫秒）与 random（[0,1)）注入保证可测
export function buildContentParams({ bookId, chapterUid, psvts, now, random, style = false, sc = 1 }) {
    let ctValue = Math.floor(now / 1000);
    let ct = String(ctValue);
    if (wereadE(ct) === psvts) {
        ctValue += 1;
        ct = String(ctValue);
    }
    const params = {
        b: wereadE(bookId),
        c: wereadE(chapterUid),
        r: String(Math.floor(random * 10000) ** 2),
        ct,
        ps: psvts,
        pc: wereadE(ct),
        sc,
        prevChapter: false,
        st: style ? 1 : 0
    };
    params.s = wereadSign(sortedQuery(params));
    return params;
}

// ======================== 响应校验与解码 ========================
// 分片响应 = 前 32 字符大写 MD5 前缀 + 置乱体；逆交换后 base64url 还原为 XHTML

export function checkedBody(responseText) {
    if (responseText.length <= 32) return '';
    const expected = responseText.slice(0, 32);
    const body = responseText.slice(32);
    const actual = md5Hex(body).toUpperCase();
    if (actual !== expected) {
        throw new Error('分片 MD5 校验失败: expected=' + expected + ', actual=' + actual);
    }
    return body;
}

export function swapPositions(encoded) {
    const length = encoded.length;
    if (length < 4) return [];
    if (length < 11) return [0, 2];

    const n = Math.min(4, Math.floor((length + 9) / 10));
    let tmp = '';
    for (let i = length - 1; i >= length - n; i--) {
        // 二进制位串按四进制解读（参考实现原样行为）
        tmp += parseInt(encoded.charCodeAt(i).toString(2), 4);
    }

    const positions = [];
    const m = length - n - 2;
    const step = String(m).length;
    let i = 0;
    while (positions.length < 10 && i + step < tmp.length) {
        positions.push(parseInt(tmp.slice(i, i + step), 10) % m);
        positions.push(parseInt(tmp.slice(i + 1, i + 1 + step), 10) % m);
        i += step;
    }
    return positions;
}

function reverseSwaps(encoded, positions) {
    const chars = encoded.split('');
    for (let i = positions.length - 1; i >= 0; i -= 2) {
        for (const k of [1, 0]) {
            const left = positions[i] + k;
            const right = positions[i - 1] + k;
            const swap = chars[left];
            chars[left] = chars[right];
            chars[right] = swap;
        }
    }
    return chars.join('');
}

function base64Decode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const clean = input.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
    const padding = '='.repeat((4 - (clean.length % 4)) % 4);
    const normalized = (clean + padding).replace(/=/g, 'A');
    const bytes = [];
    for (let i = 0; i < normalized.length; i += 4) {
        const packed = (alphabet.indexOf(normalized[i]) << 18)
            | (alphabet.indexOf(normalized[i + 1]) << 12)
            | (alphabet.indexOf(normalized[i + 2]) << 6)
            | alphabet.indexOf(normalized[i + 3]);
        bytes.push((packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff);
    }
    return new Uint8Array(bytes.slice(0, bytes.length - padding.length));
}

export function decodePayload(encodedPayload) {
    if (!encodedPayload) return '';
    const payload = encodedPayload.slice(1);
    const reordered = reverseSwaps(payload, swapPositions(payload));
    const bytes = base64Decode(reordered);
    return new TextDecoder('utf-8').decode(bytes);
}

export function decodeContentShards(e0, e1, e3) {
    return decodePayload(checkedBody(e0) + checkedBody(e1) + checkedBody(e3));
}

export function decodeStyleShard(e2) {
    return decodePayload(checkedBody(e2));
}

// ======================== 页面状态解析 ========================

// content script 隔离世界读不到页面 JS 全局（如 window.__INITIAL_STATE__），
// 与参考实现同款：GET 阅读页源码后正则提取 + JSON 解析
export function extractInitialState(readerHtml) {
    const match = readerHtml.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*\(function/);
    if (!match) throw new Error('阅读页源码中未找到 __INITIAL_STATE__，页面可能已改版');
    let state;
    try {
        state = JSON.parse(match[1]);
    } catch (err) {
        throw new Error('__INITIAL_STATE__ 解析失败：' + err.message);
    }
    return state;
}

export function parseReaderState(initialState) {
    const reader = (initialState && initialState.reader) || {};
    const bookInfo = reader.bookInfo || {};
    const bookId = String(bookInfo.bookId || '');
    if (!bookId) throw new Error('未找到书籍信息（reader.bookInfo.bookId），请确认在阅读页中');
    return {
        bookId,
        title: bookInfo.title || bookId,
        author: bookInfo.author || '',
        psvts: reader.psvts || ''
    };
}

// ======================== 目录归一化与章节筛选 ========================

export function normalizeCatalog(payload, bookId) {
    let candidates;
    if (Array.isArray(payload)) {
        candidates = payload;
    } else if (payload && typeof payload === 'object') {
        if (Array.isArray(payload.data)) candidates = payload.data;
        else if (Array.isArray(payload.books)) candidates = payload.books;
        else candidates = [payload];
    } else {
        throw new Error('chapterInfos 响应结构异常');
    }

    for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;
        const itemBookId = String((item.bookId || (item.book && item.book.bookId)) || '');
        if (itemBookId === String(bookId)) {
            const chapters = item.updated || item.chapterInfos || item.chapters || [];
            return chapters.filter((ch) => ch && typeof ch === 'object' && ch.chapterUid);
        }
    }
    throw new Error('未找到 bookId=' + bookId + ' 的目录');
}

export function selectExportableChapters(chapters) {
    return chapters.filter((ch) => Number(ch.wordCount || 0) > 0 && String(ch.title || '') !== '封面');
}

// ======================== 正文处理 ========================

// ======================== 图片资产 ========================
// 章节图片（含代码清单图）放在微信读书的章节 tar 里：下载 → 解包 → 按成员名
// 重写正文 img 的 src 为 EPUB 内部路径；拿不到图的 img 降级为 alt 占位，不再无声消失。

function bytesStartWith(data, magic) {
    if (data.length < magic.length) return false;
    for (let i = 0; i < magic.length; i++) {
        if (data[i] !== magic[i]) return false;
    }
    return true;
}

export function imageExtensionAndType(data) {
    if (bytesStartWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: '.png', mediaType: 'image/png' };
    if (bytesStartWith(data, [0xff, 0xd8, 0xff])) return { ext: '.jpg', mediaType: 'image/jpeg' };
    if (bytesStartWith(data, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])) return { ext: '.gif', mediaType: 'image/gif' };
    if (bytesStartWith(data, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return { ext: '.gif', mediaType: 'image/gif' };
    if (bytesStartWith(data, [0x52, 0x49, 0x46, 0x46])
        && bytesStartWith(data.subarray(8), [0x57, 0x45, 0x42, 0x50])) return { ext: '.webp', mediaType: 'image/webp' };
    return null;
}

function decodeTarString(header, at, length) {
    let end = at;
    const limit = at + length;
    while (end < limit && header[end] !== 0) end++;
    return new TextDecoder('utf-8').decode(header.subarray(at, end));
}

// 收集正文中 img 的 src（去重、保序）。src 即该图在微信读书 CDN 上的唯一地址，
// 是图片内容唯一可靠的身份标识——tar 成员名与文档顺序都不可作映射依据
export function collectImageSources(source) {
    const out = [];
    const seen = new Set();
    source.replace(/<img\b[^>]*>/gi, (tag) => {
        const m = tag.match(/(?<![\w-])src=(["'])([\s\S]*?)\1/i);
        if (m) {
            const src = decodeXmlEntities(m[2]);
            if (!seen.has(src)) {
                seen.add(src);
                out.push(src);
            }
        }
        return tag;
    });
    return out;
}

function decodeXmlEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'");
}

// 一趟处理全部 img：src 在 srcMap（完整 src → 内部路径）中的改写为内部路径；
// 未命中的（下载失败/非图片响应）降级为占位文本（有 alt 用 alt，没有用 [图]）
export function finalizeChapterSource(source, srcMap) {
    return source.replace(/<img\b[^>]*>/gi, (tag) => {
        const srcMatch = tag.match(/(?<![\w-])src=(["'])([\s\S]*?)\1/i);
        if (srcMatch) {
            const src = decodeXmlEntities(srcMatch[2]);
            const href = srcMap[src];
            if (href) return tag.replace(srcMatch[0], 'src=' + srcMatch[1] + href + srcMatch[1]);
        }
        const alt = tag.match(/\balt=(["'])(.*?)\1/i);
        return alt && alt[2] ? '[插图：' + alt[2] + ']' : '[图]';
    });
}

export function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

export function extractBody(source) {
    const match = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (match) return match[1];
    const escaped = escapeXml(source).replace(/\n/g, '<br/>');
    return '<p>' + escaped + '</p>';
}

export function makeChapterXhtml(title, source, cssHref = '../styles/weread.css') {
    const body = extractBody(source);
    return '<?xml version="1.0" encoding="utf-8"?>\n'
        + '<!DOCTYPE html>\n'
        + '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">\n'
        + '<head>\n'
        + '  <meta charset="utf-8"/>\n'
        + '  <title>' + escapeXml(title) + '</title>\n'
        + '  <link rel="stylesheet" type="text/css" href="' + escapeXml(cssHref) + '"/>\n'
        + '</head>\n'
        + '<body>\n'
        + '  <h1>' + escapeXml(title) + '</h1>\n'
        + '  ' + body + '\n'
        + '</body>\n'
        + '</html>\n';
}

// ======================== EPUB 打包 ========================

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
    const stream = new CompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buffer = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(buffer);
}

function writeUint16LE(target, value, at) {
    target[at] = value & 0xff;
    target[at + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(target, value, at) {
    target[at] = value & 0xff;
    target[at + 1] = (value >>> 8) & 0xff;
    target[at + 2] = (value >>> 16) & 0xff;
    target[at + 3] = (value >>> 24) & 0xff;
}

// 最小 zip 容器：STORED / DEFLATE，UTF-8 文件名标志位
export async function buildZip(entries, { now }) {
    const encoder = new TextEncoder();
    const date = new Date(now);
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

    const chunks = [];
    const centrals = [];
    let offset = 0;
    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const checksum = crc32(entry.data);
        let method = 0;
        let fileData = entry.data;
        if (entry.compress !== false && entry.data.length > 0) {
            method = 8;
            fileData = await deflateRaw(entry.data);
        }

        const local = new Uint8Array(30 + nameBytes.length + fileData.length);
        writeUint32LE(local, 0x04034b50, 0);
        writeUint16LE(local, 20, 4);
        writeUint16LE(local, 0x0800, 6);
        writeUint16LE(local, method, 8);
        writeUint16LE(local, dosTime, 10);
        writeUint16LE(local, dosDate, 12);
        writeUint32LE(local, checksum, 14);
        writeUint32LE(local, fileData.length, 18);
        writeUint32LE(local, entry.data.length, 22);
        writeUint16LE(local, nameBytes.length, 26);
        local.set(nameBytes, 30);
        local.set(fileData, 30 + nameBytes.length);
        chunks.push(local);

        const central = new Uint8Array(46 + nameBytes.length);
        writeUint32LE(central, 0x02014b50, 0);
        writeUint16LE(central, 20, 4);
        writeUint16LE(central, 20, 6);
        writeUint16LE(central, 0x0800, 8);
        writeUint16LE(central, method, 10);
        writeUint16LE(central, dosTime, 12);
        writeUint16LE(central, dosDate, 14);
        writeUint32LE(central, checksum, 16);
        writeUint32LE(central, fileData.length, 20);
        writeUint32LE(central, entry.data.length, 24);
        writeUint16LE(central, nameBytes.length, 28);
        writeUint32LE(central, offset, 42);
        central.set(nameBytes, 46);
        centrals.push(central);

        offset += local.length;
    }

    const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
    const eocd = new Uint8Array(22);
    writeUint32LE(eocd, 0x06054b50, 0);
    writeUint16LE(eocd, centrals.length, 8);
    writeUint16LE(eocd, centrals.length, 10);
    writeUint32LE(eocd, centralSize, 12);
    writeUint32LE(eocd, offset, 16);

    const total = offset + centralSize + 22;
    const archive = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks.concat(centrals, [eocd])) {
        archive.set(chunk, at);
        at += chunk.length;
    }
    return archive;
}

function uuid4() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function chapterFileName(index) {
    return 'text/chapter_' + String(index).padStart(4, '0') + '.xhtml';
}

// chapters: [{ title, source, assets? }]；source 为接口解码出的 XHTML（img 已由装配层
// 经 finalizeChapterSource 重写为内部路径或占位），assets 为本章图片字节
export async function buildEpub({ title, author, chapters, css, now }) {
    const encoder = new TextEncoder();
    const text = (value) => encoder.encode(value);
    const bookUuid = 'urn:uuid:' + uuid4();
    const modified = new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

    const navItems = chapters.map((ch, i) =>
        '      <li><a href="' + chapterFileName(i + 1) + '">' + escapeXml(ch.title) + '</a></li>'
    ).join('\n');
    const nav = '<?xml version="1.0" encoding="utf-8"?>\n'
        + '<!DOCTYPE html>\n'
        + '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">\n'
        + '<head><meta charset="utf-8"/><title>Table of Contents</title></head>\n'
        + '<body>\n  <nav epub:type="toc" id="toc">\n    <h1>目录</h1>\n    <ol>\n'
        + navItems + '\n    </ol>\n  </nav>\n</body>\n</html>\n';

    const manifestChapters = chapters.map((ch, i) =>
        '    <item id="chapter_' + String(i + 1).padStart(4, '0') + '" href="' + chapterFileName(i + 1)
        + '" media-type="application/xhtml+xml"/>'
    ).join('\n');

    const allAssets = [];
    const seenHrefs = new Set();
    chapters.forEach((ch) => (ch.assets || []).forEach((asset) => {
        if (!seenHrefs.has(asset.href)) {
            seenHrefs.add(asset.href);
            allAssets.push(asset);
        }
    }));
    const manifestAssets = allAssets.map((asset, i) =>
        '    <item id="asset_' + String(i + 1).padStart(4, '0') + '" href="' + escapeXml(asset.href)
        + '" media-type="' + escapeXml(asset.mediaType) + '"/>'
    ).join('\n');
    const spineChapters = chapters.map((ch, i) =>
        '    <itemref idref="chapter_' + String(i + 1).padStart(4, '0') + '"/>'
    ).join('\n');
    const opf = '<?xml version="1.0" encoding="utf-8"?>\n'
        + '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">\n'
        + '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        + '    <dc:identifier id="bookid">' + escapeXml(bookUuid) + '</dc:identifier>\n'
        + '    <dc:title>' + escapeXml(title) + '</dc:title>\n'
        + '    <dc:creator>' + escapeXml(author) + '</dc:creator>\n'
        + '    <dc:language>zh-CN</dc:language>\n'
        + '    <meta property="dcterms:modified">' + modified + '</meta>\n'
        + '  </metadata>\n'
        + '  <manifest>\n'
        + '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n'
        + '    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n'
        + '    <item id="style" href="styles/weread.css" media-type="text/css"/>\n'
        + manifestChapters + '\n'
        + (allAssets.length ? manifestAssets + '\n' : '')
        + '  </manifest>\n'
        + '  <spine toc="toc">\n' + spineChapters + '\n  </spine>\n'
        + '</package>\n';

    const ncxPoints = chapters.map((ch, i) =>
        '    <navPoint id="navPoint-' + (i + 1) + '" playOrder="' + (i + 1) + '">\n'
        + '      <navLabel><text>' + escapeXml(ch.title) + '</text></navLabel>\n'
        + '      <content src="' + chapterFileName(i + 1) + '"/>\n'
        + '    </navPoint>'
    ).join('\n');

    const ncx = '<?xml version="1.0" encoding="utf-8"?>\n'
        + '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
        + '  <head>\n'
        + '    <meta name="dtb:uid" content="' + escapeXml(bookUuid) + '"/>\n'
        + '    <meta name="dtb:depth" content="1"/>\n'
        + '    <meta name="dtb:totalPageCount" content="0"/>\n'
        + '    <meta name="dtb:maxPageNumber" content="0"/>\n'
        + '  </head>\n'
        + '  <docTitle><text>' + escapeXml(title) + '</text></docTitle>\n'
        + '  <navMap>\n' + ncxPoints + '\n  </navMap>\n'
        + '</ncx>\n';

    const container = '<?xml version="1.0" encoding="utf-8"?>\n'
        + '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
        + '  <rootfiles>\n'
        + '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n'
        + '  </rootfiles>\n'
        + '</container>\n';

    const entries = [
        { name: 'mimetype', data: text('application/epub+zip'), compress: false },
        { name: 'META-INF/container.xml', data: text(container) },
        { name: 'OEBPS/content.opf', data: text(opf) },
        { name: 'OEBPS/toc.ncx', data: text(ncx) },
        { name: 'OEBPS/nav.xhtml', data: text(nav) },
        { name: 'OEBPS/styles/weread.css', data: text(css || 'body { line-height: 1.6; }\n') }
    ];
    allAssets.forEach((asset) => {
        // 图片本身已压缩，zip 内 STORED
        entries.push({ name: 'OEBPS/' + asset.href, data: asset.data, compress: false });
    });
    chapters.forEach((ch, i) => {
        entries.push({
            name: 'OEBPS/' + chapterFileName(i + 1),
            data: text(makeChapterXhtml(ch.title, ch.source))
        });
    });
    const archive = await buildZip(entries, { now });
    return archive;
}

export function sanitizeFilename(name) {
    return String(name).replace(/[\\/:*?"<>|]/g, '').trim() || 'weread-export';
}

// ======================== 浏览器装配 ========================

class ExportCancelled extends Error {
    constructor() {
        super('已取消导出');
        this.name = 'ExportCancelled';
    }
}

const defaultChapterDelayMs = () => 2000 + Math.floor(Math.random() * 2000);
const defaultShardDelayMs = () => 200 + Math.floor(Math.random() * 200);
const defaultImageDelayMs = () => 300 + Math.floor(Math.random() * 200);
const defaultImageConcurrency = 4;

export function createEbookExport({
    doc,
    win,
    onStateChange = () => {},
    chapterDelayMs = defaultChapterDelayMs,
    shardDelayMs = defaultShardDelayMs,
    imageDelayMs = defaultImageDelayMs,
    imageConcurrency = defaultImageConcurrency,
    emptyRetryDelaysMs = [3000, 8000],
    fetchAsset = () => Promise.reject(new Error('未提供图片下载通道'))
}) {
    const state = { phase: 'idle', done: 0, total: 0, message: '' };
    let cancelRequested = false;
    let activeToken = null;

    function notify() {
        onStateChange();
    }

    function hasBookContext() {
        try {
            // location 归 DOM，隔离世界可见；页面 JS 全局不可见
            return /^\/web\/reader\//.test(win.location.pathname);
        } catch {
            return false;
        }
    }

    function viewState() {
        if (state.phase === 'running') {
            return { disabled: false, label: '取消 ' + state.done + '/' + state.total, title: '导出中，再次点击取消' };
        }
        return {
            disabled: !hasBookContext(),
            label: '导出本书',
            title: state.message || '把当前书导出为 EPUB 文件（个人备份）'
        };
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function postText(path, body) {
        const resp = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error('接口 HTTP ' + resp.status + '：' + path);
        return resp.text();
    }

    // 官方续期端点：succ 时响应会更新 wr_skey cookie，后续同源请求自动携带新值
    async function renewSession() {
        try {
            const text = await postText('/web/login/renewal', { rq: '%2Fweb%2Fbook%2Fread', ql: false });
            return JSON.parse(text).succ === 1;
        } catch {
            return false;
        }
    }

    // 单次分片请求。协议文档：{} = 参数、登录态、购买权、sc/st 之一有问题；
    // errcode -2012 = 登录超时。两类错误都交给 postShard 的续期重试
    async function postShardOnce(path, params) {
        const text = await postText(path, params);
        if (text.indexOf('"errcode"') !== -1) {
            let code = '';
            try { code = String(JSON.parse(text).errcode || ''); } catch { /* 用原始响应提示 */ }
            const err = new Error(code === '-2012'
                ? '登录已失效（-2012）'
                : '接口返回错误' + (code ? ' ' + code : '') + '：' + text.slice(0, 120));
            err.kind = code === '-2012' ? 'auth' : 'fatal';
            throw err;
        }
        if (text === '{}') {
            const err = new Error('返回空内容');
            err.kind = 'empty';
            throw err;
        }
        return text;
    }

    // 空响应/登录失效不立即放弃：退避 + 续期后重试（购买权在本会话内不会变化，
    // 空响应多半是会话过期或限流窗口）；其他错误码立即抛出
    async function postShard(path, params) {
        let lastError = null;
        for (let attempt = 0; attempt <= emptyRetryDelaysMs.length; attempt++) {
            if (attempt > 0) {
                await sleep(emptyRetryDelaysMs[attempt - 1]);
                throwIfCancelled(); // 取消落在退避里时，不再向续期端点发请求
                await renewSession();
            }
            try {
                return await postShardOnce(path, params);
            } catch (err) {
                if (err.kind !== 'empty' && err.kind !== 'auth') throw err;
                lastError = err;
            }
        }
        if (lastError.kind === 'auth') {
            throw new Error(path + ' ' + lastError.message + '，续期重试仍失败，请刷新页面重新登录');
        }
        throw new Error(path + ' ' + lastError.message + '（已重试 ' + emptyRetryDelaysMs.length
            + ' 次），可能是登录态过期或触发风控：建议刷新页面重新登录、休息几分钟后重试');
    }

    function throwIfCancelled() {
        if (cancelRequested) throw new ExportCancelled();
    }

    async function fetchChapterSource(book, chapter) {
        const shards = {};
        const e0 = await postShard('/web/book/chapter/e_0', buildContentParams({
            bookId: book.bookId, chapterUid: chapter.chapterUid, psvts: book.psvts,
            now: Date.now(), random: Math.random()
        }));
        if (e0.startsWith('{') && e0.indexOf('"bookId"') !== -1) {
            throw new Error('该书为 TXT 型内容（网文），暂不支持导出');
        }
        shards.e0 = e0;
        throwIfCancelled();
        await sleep(shardDelayMs());
        shards.e1 = await postShard('/web/book/chapter/e_1', buildContentParams({
            bookId: book.bookId, chapterUid: chapter.chapterUid, psvts: book.psvts,
            now: Date.now(), random: Math.random()
        }));
        throwIfCancelled();
        await sleep(shardDelayMs());
        shards.e3 = await postShard('/web/book/chapter/e_3', buildContentParams({
            bookId: book.bookId, chapterUid: chapter.chapterUid, psvts: book.psvts,
            now: Date.now(), random: Math.random()
        }));
        return decodeContentShards(shards.e0, shards.e1, shards.e3);
    }

    // 图片按 src 逐张下载（src 即图片在 CDN 上的唯一地址）。单张失败降级占位。
    // 章内并发池：文件名按收集序号生成（与完成顺序无关），整体聚合速率 =
    // imageConcurrency / (imageDelayMs + 单次往返)。取消经令牌生效：worker 在
    // 下一轮自行退出，不受 run finally 复位 cancelRequested 的影响
    async function fetchChapterImages(source, chapterIndex, token) {
        const srcs = collectImageSources(source);
        const srcMap = {};
        const assets = [];
        let cursor = 0;
        const worker = async () => {
            while (true) {
                if (token.stopped) throw new ExportCancelled();
                const k = cursor;
                if (k >= srcs.length) return;
                cursor += 1;
                const src = srcs[k];
                try {
                    const bytes = await fetchAsset(src);
                    const kind = imageExtensionAndType(bytes);
                    if (!kind) throw new Error('非图片响应');
                    const href = 'images/ch' + String(chapterIndex + 1).padStart(4, '0')
                        + '_img' + String(k + 1).padStart(3, '0') + kind.ext;
                    srcMap[src] = '../' + href;
                    assets.push({ href, mediaType: kind.mediaType, data: bytes });
                } catch (err) {
                    if (err.name === 'ExportCancelled' || token.stopped) throw err;
                    // 单张失败留空 → finalize 降级为占位文本
                }
                if (cursor < srcs.length) await sleep(imageDelayMs());
            }
        };
        await Promise.all(Array.from({ length: Math.min(imageConcurrency, srcs.length) }, () => worker()));
        return { srcMap, assets };
    }

    async function fetchBookCss(book, chapter) {
        try {
            const e2 = await postShardOnce('/web/book/chapter/e_2', buildContentParams({
                bookId: book.bookId, chapterUid: chapter.chapterUid, psvts: book.psvts,
                now: Date.now(), random: Math.random(), style: true
            }));
            return decodeStyleShard(e2);
        } catch {
            return ''; // 本章 CSS 拉不到时留空（不走重试，避免逐章重试风暴），后续章节继续尝试
        }
    }

    function saveBlob(bytes, filename) {
        const blob = new Blob([bytes], { type: 'application/epub+zip' });
        const url = URL.createObjectURL(blob);
        const anchor = doc.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        doc.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    async function fetchReaderState() {
        const resp = await fetch(win.location.href);
        if (!resp.ok) throw new Error('获取阅读页失败：HTTP ' + resp.status);
        return parseReaderState(extractInitialState(await resp.text()));
    }

    // psvts 有效期有限（参考实现每章刷新一次；《Rust权威指南》实测长导出中途
    // 全部返空、renewal 无效——psvts 绑定页面会话而非 cookie）。每章前取一份新鲜的
    async function refreshPsvts(book) {
        try {
            const fresh = await fetchReaderState();
            if (fresh.bookId === book.bookId && fresh.psvts) book.psvts = fresh.psvts;
        } catch {
            // 刷新失败沿用旧值，由分片重试兜底
        }
    }

    // 每次导出一个独立取消令牌：run 的 finally 会复位 cancelRequested，
    // 但仍在 sleep/往返中的图片 worker 靠令牌退出——令牌不复位，随 run 一起作废
    async function run() {
        const token = { stopped: false };
        activeToken = token;
        state.phase = 'running';
        state.done = 0;
        state.total = 0;
        state.message = '';
        cancelRequested = false;
        let failedChapter = null;
        notify();

        try {
            const book = await fetchReaderState();
            if (!book.psvts) throw new Error('页面缺少 psvts，请刷新阅读页后重试');
            const catalogText = await postText('/web/book/chapterInfos', { bookIds: [book.bookId] });
            let catalog;
            try {
                catalog = JSON.parse(catalogText);
            } catch {
                throw new Error('chapterInfos 响应解析失败：' + catalogText.slice(0, 120));
            }
            const chapters = selectExportableChapters(normalizeCatalog(catalog, book.bookId));
            if (!chapters.length) throw new Error('没有可导出的章节');
            state.total = chapters.length;
            notify();

            let css = '';
            let imageCount = 0;
            const fetched = [];
            const pendingImages = [];
            for (let i = 0; i < chapters.length; i++) {
                throwIfCancelled();
                failedChapter = chapters[i];
                if (i > 0) {
                    await refreshPsvts(book);
                    throwIfCancelled();
                }
                const chapter = chapters[i];
                const source = await fetchChapterSource(book, chapter);
                // 图片池立即开跑但不等待——与后续章节的内容抓取重叠（图片走 CDN，内容走 API）
                const pool = fetchChapterImages(source, i, token);
                pool.catch(() => {}); // 取消/失败早于收拢时，池拒绝也需有人接住
                pendingImages.push({
                    chapterTitle: String(chapter.title || chapter.chapterUid),
                    source,
                    images: pool
                });
                if (!css) css = await fetchBookCss(book, chapter);
                state.done = i + 1;
                notify();
                if (i < chapters.length - 1) {
                    await sleep(chapterDelayMs());
                }
            }

            // 收拢各章图片池，回填 src → 内部路径
            for (const pending of pendingImages) {
                throwIfCancelled();
                const { srcMap, assets } = await pending.images;
                imageCount += assets.length;
                fetched.push({
                    title: pending.chapterTitle,
                    source: finalizeChapterSource(pending.source, srcMap),
                    assets
                });
            }

            throwIfCancelled(); // 打包+保存耗时数秒，此间取消则不产出文件
            const archive = await buildEpub({
                title: book.title,
                author: book.author,
                chapters: fetched,
                css,
                now: Date.now()
            });
            saveBlob(archive, sanitizeFilename(book.title) + '.epub');
            state.message = '已导出 ' + fetched.length + ' 章 / ' + imageCount + ' 图';
        } catch (err) {
            const where = failedChapter && failedChapter.title ? '《' + failedChapter.title + '》' : '';
            state.message = err.name === 'ExportCancelled'
                ? '已取消导出'
                : '导出失败：' + where + err.message;
        } finally {
            state.phase = 'idle';
            cancelRequested = false;
            notify();
        }
    }

    function toggle() {
        if (state.phase === 'running') {
            cancelRequested = true;
            if (activeToken) activeToken.stopped = true;
            return;
        }
        run();
    }

    return { toggle, viewState };
}
