import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {
    md5Hex,
    wereadE,
    sortedQuery,
    wereadSign,
    buildContentParams,
    checkedBody,
    decodePayload,
    decodeContentShards,
    parseReaderState,
    extractInitialState,
    createEbookExport,
    normalizeCatalog,
    selectExportableChapters,
    imageExtensionAndType,
    collectImageSources,
    finalizeChapterSource,
    extractBody,
    makeChapterXhtml,
    buildEpub,
    sanitizeFilename
} from '../chrome-extension/lib/epub-export.js';

// ---- 金标准向量 ----
// 由 finlater/weread.koplugin 参考实现（.scratch/epub-export/ref/fetch_weread_epub.py，
// 取证日期 2026-08-30）在本机直接运行生成；微信读书改版时这些向量会先红。

const GOLDEN_E = {
    '43208843': 'c9c321c07293508bc9c79df',
    '42': 'a1d32a6022aa1d0c6e83eb4',
    '0': 'cfc32da010cfcd208495488',
    '1756500000': '4bd32a307a7834d0g010930',
    '12345678901': 'bfd32730775bcd15g011abd',
    '1000000001': '404327f075f5e100g011f8e',
    'abc123': 'e9942030c6162633132334b4',
    '封面': '41242b1085c019762412b2f'
};

const GOLDEN_QUERY = 'b=c9c321c07293508bc9c79df&c=a1d32a6022aa1d0c6e83eb4&ct=1756500000'
    + '&pc=4bd32a307a7834d0g010930&prevChapter=false&ps=4bd32a307a7834d0g010930&r=9801&sc=1&st=0';
const GOLDEN_SIGN = 'e01b786e';

const GOLDEN_PARAMS = {
    b: 'c9c321c07293508bc9c79df',
    c: 'a1d32a6022aa1d0c6e83eb4',
    r: '9801',
    ct: '1756500000',
    ps: 'abc',
    pc: '4bd32a307a7834d0g010930',
    sc: 1,
    prevChapter: false,
    st: 0,
    s: '961407fa'
};

const GOLDEN_PARAMS_COLLISION = {
    b: 'c9c321c07293508bc9c79df',
    c: 'a1d32a6022aa1d0c6e83eb4',
    r: '9801',
    ct: '1756500001',
    ps: '4bd32a307a7834d0g010930',
    pc: '973328007a7834d0g011ec5',
    sc: 1,
    prevChapter: false,
    st: 0,
    s: '8ead6a96'
};

const DECODE_PARA = '<p>第一段：中文与 ASCII 混排 mixed 123。</p><p>第二段 <b>加粗</b> 与 <i>斜体</i>。</p>';
const GOLDEN_DECODED = DECODE_PARA.repeat(8) + '<p>\uFFFF</p>'.repeat(8);


const GOLDEN_SHARDS = [
    'A21735CEF482C7C8BFE32DE72A6E90CFZPHA-56ys5LiA5q6177ya5Lit5paH5LiOIEFTQ0lJIOa3t-aOkiBtaXhlZCAxMjPjgII8L3A-PHlz56ys5LqM5q61IDxiPuWKoOeylzwvYj4g5LiOIDxpPuaWnOS9kzwvaT7jgII8L3A_PHA-56ys5LiA5q6177ya5Lit5paH5LiOIEFTQ0lJIOa3t-aOkiBtaXhlZCAxMjPjgII8L3A-PHA-56ys5LqM5q61IDxiPuWKoOeylzwvYj4g5LiOIDxpPuaWnOS9kzwvaT7jgII8L3A-PHA-56ys5LiA5q6177ya5Lit5paH5LiOIEFTQ0lJIOa3t-aOkiBtaXhlZCAxMjPjgII8L3A-PHA-56ys5LqM5q61IDxiPuWKoOeylzwvYj4g5LiOIDxpPuaWnOS9kzwva',
    '38526522324D96A9EE0030763CB91A94T7jgII8L3A-PHA-56ys5LiA5q6177ya5Lit5p7-5LiOIEFTQ0lJIOa3t-aOkiBtaXhlZCAxMjPjgII8L3A-PHA-56ys5LqM5q61IDxiPuWKoOeyA-wvYj4g5LiOIDxpPuaWnOS9kzwvaT7jgII8L3A-PHA-56ys5LiA5q6177ya5Lit5paH5LiOIEFTQ0lJIOa3t-aOkiBtaXhlZCAxMjPjgII8L3A-PHA-56ys5LqM5q61IDxiPuWKoOeylzwvYj4g5LiOIDxpPuaWnOS9kzwvaT7jgII8L3A-PHA-56ys5LiA5q6177ya5Lit5paH5LiOIEFTQ0lJIOa3t-aOkiBtaXhlZCAxMjPjgII8L3A-PHA-56ys5LqM5q61IDxiPuWKoOeylzwvYj4g5LiOIDxpPua',
    '762972A1179F63BFE1DAFE8533D80427WnOS9kzwvaT7jgII8L3A-PHA-56ys5LiA5q6177ya5Lit5paH5LiOIEFTQ0lJIOa3t-aOkiBtaXhlZCAxMjPjgII8L3A-PHA-56ys5LqM5q61IDxiPuWKoOeylzwvYj4g5LiOIDxpPuaWnOS9kzwvaT7jgII8L3A-PHA-56ys5LiA5q6177ya5Lit5paH5LiOIEFTQ0lJIOa3t-aOkiBtaXhlZCAxMjPjgII8L3A-PHA-56ys5LqM5q61IDxiPuWKoOeylzwvYj4g5LiOIDxpPuaWnOS9kzwvaT7jgII8L3A-PHA-7aH_PC9wPjxwPu-_vzwvcD48cD7vv788L3A-PHA-77--PC9wPjxwPu-_vzwvcD48cD7vv788L3A-PHA-77-_PC9wPjxwPu-_vzwvcD4='
];

// 载荷统一从分片字面量派生（分片自带 MD5 前缀，可自校验转录正确性），
// 避免再手抄一份整串长字面量引入转录错误
const GOLDEN_PAYLOAD = GOLDEN_SHARDS.map((shard) => shard.slice(32)).join('');

// ---- MD5 ----

test('md5Hex 已知向量与 Node crypto 对齐', () => {
    assert.equal(md5Hex(''), 'd41d8cd98f00b204e9800998ecf8427e');
    assert.equal(md5Hex('abc'), '900150983cd24fb0d6963f7d28e17f72');
    for (const sample of ['中文测试', 'x'.repeat(500) + '中文' + 'y'.repeat(130)]) {
        const expected = crypto.createHash('md5').update(sample, 'utf8').digest('hex');
        assert.equal(md5Hex(sample), expected);
    }
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const expected = crypto.createHash('md5').update(bytes).digest('hex');
    assert.equal(md5Hex(bytes), expected);
});

// ---- b/c 编码 ----

test('wereadE 金标准向量（数字/多分块/非数字/中文）', () => {
    for (const [input, expected] of Object.entries(GOLDEN_E)) {
        assert.equal(wereadE(input), expected, input);
    }
});

// ---- 签名 ----

test('sortedQuery 按 key 排序拼接', () => {
    const params = {
        st: 0, r: '9801', sc: 1, prevChapter: false,
        ps: '4bd32a307a7834d0g010930', pc: '4bd32a307a7834d0g010930',
        ct: '1756500000', c: 'a1d32a6022aa1d0c6e83eb4', b: 'c9c321c07293508bc9c79df'
    };
    assert.equal(sortedQuery(params), GOLDEN_QUERY);
});

test('wereadSign 金标准向量', () => {
    assert.equal(wereadSign(GOLDEN_QUERY), GOLDEN_SIGN);
});

// ---- 分片请求参数 ----

test('buildContentParams 金标准向量（注入 now/random）', () => {
    const params = buildContentParams({
        bookId: '43208843', chapterUid: 42, psvts: 'abc',
        now: 1756500000000, random: 0.0099
    });
    assert.deepEqual(params, GOLDEN_PARAMS);
});

test('buildContentParams psvts 与 ct 编码撞车时 ct+1', () => {
    const params = buildContentParams({
        bookId: '43208843', chapterUid: 42,
        psvts: wereadE('1756500000'),
        now: 1756500000000, random: 0.0099
    });
    assert.deepEqual(params, GOLDEN_PARAMS_COLLISION);
});

test('buildContentParams CSS 分片 st=1', () => {
    const params = buildContentParams({
        bookId: '43208843', chapterUid: 42, psvts: 'abc',
        now: 1756500000000, random: 0.0099, style: true
    });
    assert.equal(params.st, 1);
});

// ---- 响应校验与解码 ----

test('checkedBody 通过校验返回体、校验失败抛错、短响应为空', () => {
    const body = 'hello-shard-body';
    const prefix = md5Hex(body).toUpperCase();
    assert.equal(checkedBody(prefix + body), body);

    const badPrefix = prefix.slice(0, 31) + (prefix.endsWith('0') ? '1' : '0');
    assert.throws(() => checkedBody(badPrefix + body), /MD5 校验失败/);

    assert.equal(checkedBody('short'), '');
    assert.equal(checkedBody('x'.repeat(32)), '');
});

test('decodePayload 金标准向量（含 urlsafe 字符与 UTF-8 中文）', () => {
    assert.equal(decodePayload(GOLDEN_PAYLOAD), GOLDEN_DECODED);
});

test('decodeContentShards 三分片拼接后解码', () => {
    assert.equal(decodeContentShards(GOLDEN_SHARDS[0], GOLDEN_SHARDS[1], GOLDEN_SHARDS[2]), GOLDEN_DECODED);
});

test('空分片（仅前缀）合法，解码为空串', () => {
    const empty = md5Hex('').toUpperCase();
    assert.equal(decodeContentShards(empty, empty, empty), '');
});

// ---- 页面状态解析 ----

test('parseReaderState 提取 bookId/title/author/psvts', () => {
    const state = parseReaderState({
        reader: { bookInfo: { bookId: '43208843', title: '持续交付 2.0', author: '乔梁' }, psvts: 'ps-token' }
    });
    assert.deepEqual(state, { bookId: '43208843', title: '持续交付 2.0', author: '乔梁', psvts: 'ps-token' });
});

test('parseReaderState 缺 bookId 抛错、title 回退 bookId', () => {
    assert.throws(() => parseReaderState({ reader: {} }), /bookId/);
    assert.throws(() => parseReaderState(null), /bookId/);
    const state = parseReaderState({ reader: { bookInfo: { bookId: '42' }, psvts: '' } });
    assert.equal(state.title, '42');
});

// ---- 目录归一化与章节筛选 ----

test('normalizeCatalog 支持 data/books/裸列表三种包装', () => {
    const chapters = [{ chapterUid: 1, title: '第一章', wordCount: 100 }];
    assert.deepEqual(normalizeCatalog({ data: [{ bookId: '42', updated: chapters }] }, '42'), chapters);
    assert.deepEqual(normalizeCatalog({ books: [{ book: { bookId: '42' }, chapterInfos: chapters }] }, '42'), chapters);
    assert.deepEqual(normalizeCatalog([{ bookId: 'other' }, { bookId: '42', updated: chapters }], '42'), chapters);
});

test('normalizeCatalog 过滤无 chapterUid 条目、找不到书抛错', () => {
    const chapters = [{ chapterUid: 1 }, { title: '坏条目' }, null];
    const result = normalizeCatalog({ data: [{ bookId: '42', updated: chapters }] }, '42');
    assert.deepEqual(result, [{ chapterUid: 1 }]);
    assert.throws(() => normalizeCatalog({ data: [{ bookId: 'other' }] }, '42'), /目录/);
});

test('selectExportableChapters 过滤零字数与封面', () => {
    const chapters = [
        { chapterUid: 1, title: '封面', wordCount: 500 },
        { chapterUid: 2, title: '第一章', wordCount: 100 },
        { chapterUid: 3, title: '第二章', wordCount: 0 },
        { chapterUid: 4, title: '第三章' }
    ];
    const result = selectExportableChapters(chapters);
    assert.deepEqual(result.map((c) => c.chapterUid), [2]);
});

// ---- 正文处理 ----

// ---- 图片资产 ----

test('imageExtensionAndType 按魔数识别图片类型', () => {
    assert.deepEqual(
        imageExtensionAndType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1])),
        { ext: '.png', mediaType: 'image/png' }
    );
    assert.deepEqual(imageExtensionAndType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])), { ext: '.jpg', mediaType: 'image/jpeg' });
    assert.deepEqual(imageExtensionAndType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])), { ext: '.gif', mediaType: 'image/gif' });
    assert.deepEqual(imageExtensionAndType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), { ext: '.gif', mediaType: 'image/gif' });
    assert.deepEqual(
        imageExtensionAndType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
        { ext: '.webp', mediaType: 'image/webp' }
    );
    assert.equal(imageExtensionAndType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
    assert.equal(imageExtensionAndType(new Uint8Array([0xff, 0xd8])), null, '截断数据不误判');
});

test('finalizeChapterSource：命中改写内部路径、未命中降级占位', () => {
    const srcMap = { 'https://res.weread.qq.com/wrepub/epub_1.jpg?a=1': '../images/epub_1.jpg' };
    const source = '<div class="bodyPic"><img src="https://res.weread.qq.com/wrepub/epub_1.jpg?a=1"/></div>'
        + '<p><img src="https://x/missing.png" alt="示意图"/></p>'
        + '<p><img src="https://x/gone.png"/></p>';
    const out = finalizeChapterSource(source, srcMap);
    assert.ok(out.includes('src="../images/epub_1.jpg"'), '命中 tar 成员改写为内部路径');
    assert.ok(out.includes('[插图：示意图]'), '未命中留 alt 占位');
    assert.ok(out.includes('[图]'), '无 alt 留 [图] 占位');
    assert.ok(!out.includes('res.weread.qq.com') && !out.includes('missing.png') && !out.includes('gone.png'),
        '不留指向远程的 src');
    assert.equal(finalizeChapterSource('<p>无图</p>', srcMap), '<p>无图</p>');
    // 空资产（tar 下载失败）时全部降级，不抛错
    assert.ok(finalizeChapterSource('<img src="https://x/a.jpg"/>', {}).includes('[图]'));
});

test('collectImageSources 与 finalize 不误伤 data-src 懒加载属性', () => {
    const source = '<img data-src="https://a/lazy.jpg" src="https://a/real.jpg"/>';
    assert.deepEqual(collectImageSources(source), ['https://a/real.jpg']);
    const out = finalizeChapterSource(source, { 'https://a/real.jpg': '../images/r.jpg' });
    assert.ok(out.includes('src="../images/r.jpg"'), '真 src 被改写');
    assert.ok(out.includes('data-src="https://a/lazy.jpg"'), '懒加载属性原样保留');
});

test('finalizeChapterSource：src 精确命中改写、未命中降级占位', () => {
    const src = 'https://res.weread.qq.com/wrepub/epub_1.jpg?a=1';
    const srcMap = { [src]: '../images/ch0001_img001.jpg' };
    const source = '<div class="bodyPic"><img src="' + src + '"/></div>'
        + '<p><img src="https://x/missing.png" alt="示意图"/></p>'
        + '<p><img src="https://x/gone.png"/></p>';
    const out = finalizeChapterSource(source, srcMap);
    assert.ok(out.includes('src="../images/ch0001_img001.jpg"'), '完整 src 命中改写');
    assert.ok(out.includes('[插图：示意图]'), '未命中留 alt 占位');
    assert.ok(out.includes('[图]'), '无 alt 留 [图] 占位');
    assert.ok(!out.includes('res.weread.qq.com') && !out.includes('missing.png') && !out.includes('gone.png'),
        '不留指向远程的 src');
    assert.equal(finalizeChapterSource('<p>无图</p>', {}), '<p>无图</p>');
    assert.ok(finalizeChapterSource('<img src="https://x/a.jpg"/>', {}).includes('[图]'));
});

test('collectImageSources 去重保序收集 img src', () => {
    const source = '<div><img src="https://a/1.jpg"/></div>'
        + '<p><img src="https://a/1.jpg"/></p>'
        + '<p><img src="https://a/2.png?x=1"/></p>'
        + '<p><img class="c"/></p>';
    assert.deepEqual(collectImageSources(source), ['https://a/1.jpg', 'https://a/2.png?x=1']);
});

test('extractBody 捕获 body、无 body 时转义兜底', () => {
    assert.equal(extractBody('<html><body><p>x</p></body></html>'), '<p>x</p>');
    assert.equal(extractBody('plain\ntext<next>'), '<p>plain<br/>text&lt;next&gt;</p>');
});

test('makeChapterXhtml 输出标题/样式链接/正文', () => {
    const xhtml = makeChapterXhtml('第一<章>', '<html><body><p>正文</p></body></html>');
    assert.ok(xhtml.includes('<title>第一&lt;章&gt;</title>'));
    assert.ok(xhtml.includes('<h1>第一&lt;章&gt;</h1>'));
    assert.ok(xhtml.includes('href="../styles/weread.css"'));
    assert.ok(xhtml.includes('<p>正文</p>'));
});

// ---- EPUB 打包 ----

function readZipEntries(archive) {
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    let eocd = -1;
    for (let i = archive.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    assert.notEqual(eocd, -1, 'EOCD 未找到');
    assert.equal(view.getUint32(eocd, true), 0x06054b50, 'EOCD 签名');
    assert.equal(view.getUint16(eocd + 4, true), 0, 'disk 号为 0');
    const count = view.getUint16(eocd + 10, true);
    let at = view.getUint32(eocd + 16, true);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
        assert.equal(view.getUint32(at, true), 0x02014b50, 'central 签名');
        const method = view.getUint16(at + 10, true);
        const compSize = view.getUint32(at + 20, true);
        const uncompSize = view.getUint32(at + 24, true);
        const nameLen = view.getUint16(at + 28, true);
        const extraLen = view.getUint16(at + 30, true);
        const commentLen = view.getUint16(at + 32, true);
        const localOffset = view.getUint32(at + 42, true);
        const name = new TextDecoder().decode(archive.slice(at + 46, at + 46 + nameLen));

        const l = localOffset;
        assert.equal(view.getUint32(l, true), 0x04034b50, 'local 签名: ' + name);
        const lNameLen = view.getUint16(l + 26, true);
        const lExtraLen = view.getUint16(l + 28, true);
        const dataStart = l + 30 + lNameLen + lExtraLen;
        const raw = archive.slice(dataStart, dataStart + compSize);
        const data = method === 0 ? raw : new Uint8Array(zlib.inflateRawSync(raw));
        assert.equal(data.length, uncompSize, '解压尺寸: ' + name);
        entries.set(name, { method, text: () => new TextDecoder().decode(data) });
        at += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

test('buildEpub 产出可被标准 zip 语义读取的 EPUB', async () => {
    const archive = await buildEpub({
        title: '测试书',
        author: '测试作者',
        chapters: [
            { title: '第一章', source: '<html><body><p>正文甲</p></body></html>' },
            { title: '第二<章>', source: '<html><body><p>正文乙</p><p>[插图：图A]</p></body></html>' }
        ],
        css: 'p{margin:0}',
        now: 1756500000000
    });

    const entries = readZipEntries(archive);
    assert.deepEqual(
        [...entries.keys()],
        [
            'mimetype',
            'META-INF/container.xml',
            'OEBPS/content.opf',
            'OEBPS/toc.ncx',
            'OEBPS/nav.xhtml',
            'OEBPS/styles/weread.css',
            'OEBPS/text/chapter_0001.xhtml',
            'OEBPS/text/chapter_0002.xhtml'
        ]
    );

    assert.equal(entries.get('mimetype').method, 0, 'mimetype 必须不压缩');
    assert.equal(entries.get('mimetype').text(), 'application/epub+zip');

    const chapter1 = entries.get('OEBPS/text/chapter_0001.xhtml').text();
    assert.ok(chapter1.includes('<title>第一章</title>'));
    assert.ok(chapter1.includes('<p>正文甲</p>'));

    const chapter2 = entries.get('OEBPS/text/chapter_0002.xhtml').text();
    assert.ok(chapter2.includes('[插图：图A]'), '占位文本保留');
    assert.ok(!chapter2.includes('<img'));
    assert.ok(chapter2.includes('<title>第二&lt;章&gt;</title>'));

    const opf = entries.get('OEBPS/content.opf').text();
    assert.ok(opf.includes('<dc:title>测试书</dc:title>'));
    assert.ok(opf.includes('<dc:creator>测试作者</dc:creator>'));
    assert.ok(opf.includes('<dc:language>zh-CN</dc:language>'));
    assert.ok(opf.includes('dcterms:modified'));
    assert.ok(opf.includes('href="text/chapter_0002.xhtml"'));

    const nav = entries.get('OEBPS/nav.xhtml').text();
    assert.ok(nav.includes('href="text/chapter_0001.xhtml">第一章</a>'));

    const ncx = entries.get('OEBPS/toc.ncx').text();
    assert.ok(ncx.includes('<text>第一章</text>'));

    assert.equal(entries.get('OEBPS/styles/weread.css').text(), 'p{margin:0}');
});

test('buildEpub css 缺省时给兜底样式', async () => {
    const archive = await buildEpub({
        title: '书', author: '', chapters: [{ title: '章', source: '<p>x</p>' }], css: '', now: 0
    });
    const entries = readZipEntries(archive);
    assert.ok(entries.get('OEBPS/styles/weread.css').text().includes('line-height'));
});

test('buildEpub 图片资产 STORED 入包并登记 manifest', async () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
    const archive = await buildEpub({
        title: '书',
        author: '',
        now: 0,
        chapters: [{
            title: '章',
            source: '<html><body><p>x</p><div class="bodyPic"><img src="../images/pic.jpg"/></div></body></html>',
            assets: [{ key: 'pic.jpg', filename: 'pic.jpg', href: 'images/pic.jpg', mediaType: 'image/jpeg', data: jpg }]
        }],
        css: ''
    });
    const entries = readZipEntries(archive);
    assert.ok([...entries.keys()].includes('OEBPS/images/pic.jpg'), '图片条目存在');
    assert.equal(entries.get('OEBPS/images/pic.jpg').method, 0, '图片不二次压缩');
    assert.ok(
        entries.get('OEBPS/content.opf').text().includes('href="images/pic.jpg" media-type="image/jpeg"'),
        'manifest 登记资产'
    );
    assert.ok(entries.get('OEBPS/text/chapter_0001.xhtml').text().includes('src="../images/pic.jpg"'));
});

test('extractInitialState 从阅读页 HTML 提取状态 JSON', () => {
    const html = '<!DOCTYPE html><script>window.__INITIAL_STATE__  ='
        + ' {"reader":{"bookInfo":{"bookId":"43208843"},"psvts":"ps","meta":[1,2]}};(function(){})();</script>';
    const state = extractInitialState(html);
    assert.equal(state.reader.bookInfo.bookId, '43208843');
    assert.equal(state.reader.psvts, 'ps');
});

test('extractInitialState 缺失或损坏时抛可读错误', () => {
    assert.throws(() => extractInitialState('<html><body>改版了</body></html>'), /__INITIAL_STATE__/);
    assert.throws(
        () => extractInitialState('<script>window.__INITIAL_STATE__ = {broken};(function(){});</script>'),
        /解析失败/
    );
});

// 隔离世界修复回归：toggle 后第一步必须是 GET 页面源码，bookId 取自源码而非页面 JS 全局
test('createEbookExport 从页面源码提取状态并发起目录请求', async () => {
    const readerHtml = '<script>window.__INITIAL_STATE__ ='
        + ' {"reader":{"bookInfo":{"bookId":"43208843","title":"测试书"},"psvts":"ps-token"}};(function(){});</script>';
    const catalog = JSON.stringify({
        data: [{ bookId: '43208843', updated: [{ chapterUid: 1, title: '第一章', wordCount: 100 }] }]
    });
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
        const u = String(url);
        calls.push({ url: u, method: init.method || 'GET', body: init.body });
        if (init.method === 'POST' && u.includes('chapterInfos')) {
            return { ok: true, text: async () => catalog };
        }
        if (init.method === 'POST') return { ok: true, text: async () => '{}' };
        return { ok: true, text: async () => readerHtml };
    };
    try {
        const win = { location: { href: 'https://weread.qq.com/web/reader/abc', pathname: '/web/reader/abc' } };
        const ex = createEbookExport({
            doc: {},
            win,
            chapterDelayMs: () => 0,
            shardDelayMs: () => 0,
            emptyRetryDelaysMs: [1, 1]
        });
        assert.equal(ex.viewState().disabled, false, '阅读页 URL 即上下文，按钮可用');
        ex.toggle();
        await new Promise((resolve) => setTimeout(resolve, 30));

        assert.deepEqual(calls[0], {
            url: 'https://weread.qq.com/web/reader/abc',
            method: 'GET',
            body: undefined
        }, '第一步拉取页面源码');
        assert.equal(JSON.parse(calls[1].body).bookIds[0], '43208843', 'bookId 取自源码提取');
        assert.ok(ex.viewState().title.includes('e_0'), '按预期停在空分片错误: ' + ex.viewState().title);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createEbookExport 空分片自动续期重试，耗尽后中止并给出可行动文案', async () => {
    const readerHtml = '<script>window.__INITIAL_STATE__ ='
        + ' {"reader":{"bookInfo":{"bookId":"43208843","title":"测试书"},"psvts":"ps-token"}};(function(){});</script>';
    const catalog = JSON.stringify({
        data: [{ bookId: '43208843', updated: [{ chapterUid: 1, title: '第一章', wordCount: 100 }] }]
    });
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
        const u = String(url);
        if (init.method === 'POST' && u.includes('renewal')) {
            calls.push('renewal');
            return { ok: true, text: async () => '{"succ":1}' };
        }
        if (init.method === 'POST' && u.includes('e_0')) {
            calls.push('e_0');
            return { ok: true, text: async () => '{}' };
        }
        if (init.method === 'POST' && u.includes('chapterInfos')) {
            calls.push('catalog');
            return { ok: true, text: async () => catalog };
        }
        calls.push('other');
        return { ok: true, text: async () => readerHtml };
    };
    try {
        const ex = createEbookExport({
            doc: {},
            win: { location: { href: 'https://weread.qq.com/web/reader/abc', pathname: '/web/reader/abc' } },
            chapterDelayMs: () => 0,
            shardDelayMs: () => 0,
            imageDelayMs: () => 0,
            emptyRetryDelaysMs: [1, 1]
        });
        ex.toggle();
        await new Promise((resolve) => setTimeout(resolve, 60));

        assert.equal(calls.filter((c) => c === 'e_0').length, 3, 'e_0 共尝试 3 次');
        assert.equal(calls.filter((c) => c === 'renewal').length, 2, '每次重试前先续期');
        assert.ok(ex.viewState().title.includes('可能是登录态过期或触发风控'), '最终文案可行动: ' + ex.viewState().title);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createEbookExport chapterInfos 返回非 JSON 时给出可读错误', async () => {
    const readerHtml = '<script>window.__INITIAL_STATE__ ='
        + ' {"reader":{"bookInfo":{"bookId":"43208843","title":"测试书"},"psvts":"ps"}};(function(){});</script>';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
        if (init.method === 'POST' && String(url).includes('chapterInfos')) {
            return { ok: true, text: async () => '<html>被网关拦截</html>' };
        }
        return { ok: true, text: async () => readerHtml };
    };
    try {
        const ex = createEbookExport({
            doc: {},
            win: { location: { href: 'https://weread.qq.com/web/reader/abc', pathname: '/web/reader/abc' } },
            chapterDelayMs: () => 0,
            shardDelayMs: () => 0,
            emptyRetryDelaysMs: [1, 1]
        });
        ex.toggle();
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.ok(ex.viewState().title.includes('chapterInfos 响应解析失败'), '文案: ' + ex.viewState().title);
        assert.ok(ex.viewState().title.includes('被网关拦截'), '带响应片段');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

// ---- 文件名 ----

test('sanitizeFilename 过滤非法字符', () => {
    assert.equal(sanitizeFilename('a/b:c*d?"<>|'), 'abcd');
    assert.equal(sanitizeFilename('  持续交付 2.0 '), '持续交付 2.0');
    assert.equal(sanitizeFilename('???'), 'weread-export');
});
