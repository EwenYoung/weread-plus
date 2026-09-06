import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDoc } from '../chrome-extension/lib/zlib-parser.js';

const MIRROR = 'https://zh.z-library.im';

// ---- fake DOM 元素 ----

// 带属性的元素（href/封面用 getAttribute 按名取）
function attrEl(attrs, text = '') {
    return { textContent: text, getAttribute: (name) => attrs[name] ?? null };
}

// 新版 z-bookcard：元数据在属性上，标题/作者在插槽里
function cardEl({ href = '', title = '', author = '', publisher = '', year = '', language = '', extension = '', filesize = '', coverAttrs = null } = {}) {
    return {
        getAttribute: (name) => ({ href, publisher, year, language, extension, filesize }[name] ?? null),
        querySelector(sel) {
            if (sel === '[slot="title"]') return title ? { textContent: title } : null;
            if (sel === '[slot="author"]') return author ? { textContent: author } : null;
            if (sel === 'img') return coverAttrs ? attrEl(coverAttrs) : null;
            return null;
        }
    };
}

// 旧版 resItemBox 条目
function bookEl({
    href = '',
    title = '',
    authors = [],
    publisher = '',
    year = '',
    language = '',
    ext = '',
    rating = '',
    coverAttrs = null
} = {}) {
    return {
        querySelector(sel) {
            if (sel === 'a[href*="/book/"]') return href ? attrEl({ href }, title) : null;
            if (sel === '[itemprop="name"]') return title ? { textContent: title } : null;
            if (sel === 'a[title="Publisher"]') return publisher ? { textContent: publisher } : null;
            if (sel === '[class*="property_year"] [class*="property_value"]') return year ? { textContent: year } : null;
            if (sel === '[class*="property_language"] [class*="property_value"]') return language ? { textContent: language } : null;
            if (sel === '[class*="property__file"] [class*="property_value"]') return ext ? { textContent: ext } : null;
            if (sel === '[class*="book-rating-interest-score"]') return rating ? { textContent: rating } : null;
            if (sel === 'img') return coverAttrs ? attrEl(coverAttrs) : null;
            return null;
        },
        querySelectorAll(sel) {
            if (sel === 'a[itemprop="author"]') return authors.map((name) => ({ textContent: name }));
            return [];
        }
    };
}

// fake 文档：#searchResultBox 容器（hasContainer=false 时解析器回退到 doc 本身）
function docOf({ cards = [], legacy = [], hasContainer = true } = {}) {
    const scope = {
        querySelectorAll(sel) {
            if (sel === 'z-bookcard') return cards;
            if (sel === '.resItemBox, .resItemBoxBooks, .book-item') return legacy;
            return [];
        }
    };
    return {
        querySelector(sel) {
            if (sel === '#searchResultBox') return hasContainer ? scope : null;
            return null;
        },
        querySelectorAll: scope.querySelectorAll
    };
}

// ---- 新版 z-bookcard 结构 ----

test('新版卡片：标题/作者/出版/年/语言/格式大小/封面/相对 href 拼镜像域名', () => {
    const doc = docOf({
        cards: [cardEl({
            href: '/book/12345/abc.html',
            title: '红高粱',
            author: '莫言',
            publisher: '上海文艺出版社',
            year: '2012',
            language: 'chinese',
            extension: 'PDF',
            filesize: '2.4 MB',
            coverAttrs: { 'data-src': 'https://img.zlibcro.com/1.jpg' }
        })]
    });
    const results = parseDoc(doc, MIRROR);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
        title: '红高粱',
        url: MIRROR + '/book/12345/abc.html',
        cover: 'https://img.zlibcro.com/1.jpg',
        author: '莫言',
        publisher: '上海文艺出版社',
        year: '2012',
        language: 'chinese',
        ext: 'PDF, 2.4 MB'
    });
});

test('新版卡片存在时优先按新版解析，旧版条目忽略（防嵌套重复）', () => {
    const doc = docOf({
        cards: [cardEl({ href: '/book/1/a.html', title: '新书' })],
        legacy: [bookEl({ href: '/book/2/b.html', title: '旧书' })]
    });
    const results = parseDoc(doc, MIRROR);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, '新书');
});

test('无 href 的卡片（书单聚合等）跳过', () => {
    const doc = docOf({ cards: [cardEl({ title: '无链接' }), cardEl({ href: '/book/1/a.html', title: '有链接' })] });
    const results = parseDoc(doc, MIRROR);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, '有链接');
});

test('标题插槽为空时回退用链接路径作标题', () => {
    const doc = docOf({ cards: [cardEl({ href: '/book/1/a.html' })] });
    assert.equal(parseDoc(doc, MIRROR)[0].title, '/book/1/a.html');
});

test('新版卡片可选字段缺省', () => {
    const doc = docOf({ cards: [cardEl({ href: '/book/1/a.html', title: '书' })] });
    assert.deepEqual(parseDoc(doc, MIRROR)[0], {
        title: '书',
        url: MIRROR + '/book/1/a.html',
        cover: ''
    });
});

// ---- 两代共用：封面与链接 ----

test('封面 data-src 优先于 src', () => {
    const doc = docOf({ cards: [cardEl({ href: '/book/1/a.html', coverAttrs: { 'data-src': 'https://a.com/1.jpg', src: 'https://b.com/2.jpg' } })] });
    assert.equal(parseDoc(doc, MIRROR)[0].cover, 'https://a.com/1.jpg');
});

test('封面：data: 占位与空值剔除', () => {
    for (const bad of [{ src: 'data:image/gif;base64,xxx' }, {}]) {
        const doc = docOf({ cards: [cardEl({ href: '/book/1/a.html', coverAttrs: bad })] });
        assert.equal(parseDoc(doc, MIRROR)[0].cover, '', JSON.stringify(bad));
    }
});

test('封面相对路径按镜像域名补全，协议相对路径原样保留', () => {
    const doc = docOf({
        cards: [
            cardEl({ href: '/book/1/a.html', coverAttrs: { src: '/covers/1.jpg' } }),
            cardEl({ href: '/book/2/b.html', coverAttrs: { src: '//img.zlibcro.com/2.jpg' } })
        ]
    });
    const results = parseDoc(doc, MIRROR);
    assert.equal(results[0].cover, MIRROR + '/covers/1.jpg');
    assert.equal(results[1].cover, '//img.zlibcro.com/2.jpg');
});

test('书籍链接为绝对地址时保持原样', () => {
    const doc = docOf({ cards: [cardEl({ href: 'https://z-lib.sk/book/9/x.html', title: '书' })] });
    assert.equal(parseDoc(doc, MIRROR)[0].url, 'https://z-lib.sk/book/9/x.html');
});

test('无 baseUrl 时相对链接原样返回', () => {
    const doc = docOf({ cards: [cardEl({ href: '/book/1/a.html', title: '书' })] });
    assert.equal(parseDoc(doc)[0].url, '/book/1/a.html');
});

// ---- 旧版 resItemBox 结构 ----

test('旧版条目：标题/作者/出版社/年份/语言/格式/评分/相对链接拼镜像域名', () => {
    const doc = docOf({
        legacy: [bookEl({
            href: '/book/12345/abc.html',
            title: '三体',
            authors: ['刘慈欣'],
            publisher: '重庆出版社',
            year: 'Published: 2008 / 重庆出版社',
            language: 'chinese',
            ext: 'PDF',
            rating: '1234',
            coverAttrs: { 'data-src': 'https://img.zlibcro.com/1.jpg' }
        })]
    });
    const results = parseDoc(doc, MIRROR);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
        title: '三体',
        url: MIRROR + '/book/12345/abc.html',
        cover: 'https://img.zlibcro.com/1.jpg',
        author: '刘慈欣',
        publisher: '重庆出版社',
        year: '2008',
        language: 'chinese',
        ext: 'PDF',
        rating: '1234'
    });
});

test('#searchResultBox 容器缺失时回退到整个文档查找', () => {
    const doc = docOf({ legacy: [bookEl({ href: '/book/1/a.html', title: '书' })], hasContainer: false });
    const results = parseDoc(doc, MIRROR);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, '书');
});

test('旧版：无 /book/ 链接的条目跳过', () => {
    const doc = docOf({ legacy: [bookEl({ title: '无链接' })] });
    assert.deepEqual(parseDoc(doc, MIRROR), []);
});

test('旧版：多作者用 " / " 连接', () => {
    const doc = docOf({ legacy: [bookEl({ href: '/book/1/a.html', title: '书', authors: ['刘慈欣', 'Cixin Liu'] })] });
    assert.equal(parseDoc(doc, MIRROR)[0].author, '刘慈欣 / Cixin Liu');
});

test('旧版：评分为 0 或无数字时缺省', () => {
    const doc = docOf({
        legacy: [
            bookEl({ href: '/book/1/a.html', title: '甲', rating: '0' }),
            bookEl({ href: '/book/2/b.html', title: '乙' })
        ]
    });
    const results = parseDoc(doc, MIRROR);
    assert.equal(results[0].rating, undefined);
    assert.equal(results[1].rating, undefined);
});

test('旧版：标题缺 itemprop 时回退链接文本', () => {
    // [itemprop="name"] 缺失（querySelector 恒 null），标题回退到链接文本
    const item = bookEl({ href: '/book/1/a.html' });
    const patched = {
        ...item,
        querySelector(sel) {
            return sel === 'a[href*="/book/"]' ? attrEl({ href: '/book/1/a.html' }, '回退标题') : null;
        }
    };
    const doc = docOf({ legacy: [patched] });
    assert.equal(parseDoc(doc, MIRROR)[0].title, '回退标题');
});

// ---- 通用 ----

test('结果截断到 10 条', () => {
    const cards = [];
    for (let i = 0; i < 12; i++) cards.push(cardEl({ href: '/book/' + i + '/x.html', title: '书' + i }));
    assert.equal(parseDoc(docOf({ cards }), MIRROR).length, 10);
});

test('空文档返回空数组', () => {
    assert.deepEqual(parseDoc(docOf({}), MIRROR), []);
});
