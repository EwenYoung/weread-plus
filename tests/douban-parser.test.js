import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDoc } from '../chrome-extension/lib/douban-parser.js';

// ---- fake DOM 元素 ----
function textEl(text) {
    return { textContent: text };
}

// cover 元素：getAttribute 按名返回
function coverEl(attrs) {
    return { getAttribute: (name) => attrs[name] ?? null };
}

// nbg 元素：getAttribute('title') + textContent + href
function nbgEl({ title = '', href = '' } = {}) {
    return { getAttribute: (n) => (n === 'title' ? title : null), textContent: title, href };
}

function itemEl({ nbg, cast, rating, meta, cover, ad = false }) {
    return {
        querySelector(sel) {
            if (sel === '.result-ad') return ad ? {} : null;
            if (sel === 'a.nbg') return nbg ?? null;
            if (sel === '.rating_nums, [class*="rating"]') return rating ?? null;
            if (sel === '.subject-cast') return cast ?? null;
            if (sel === '.rating-info .pl, .pl') return meta ?? null;
            if (sel === '.pic img' || sel === 'a.nbg img' || sel === 'img') return cover ?? null;
            return null;
        }
    };
}

function docOf(items) {
    return { querySelectorAll: () => items };
}

// ---- 用例 ----

test('解析正常条目：标题/评分/作者/出版社/年份', () => {
    const doc = docOf([
        itemEl({
            nbg: nbgEl({ title: '三体', href: 'https://book.douban.com/subject/2567698/' }),
            cover: coverEl({ 'data-src': 'https://img.doubanio.com/1.jpg' }),
            rating: textEl('9.5分'),
            cast: textEl('刘慈欣 / 重庆出版社 / 2008')
        })
    ]);
    const results = parseDoc(doc);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
        title: '三体',
        url: 'https://book.douban.com/subject/2567698/',
        cover: 'https://img.doubanio.com/1.jpg',
        rating: '9.5',
        author: '刘慈欣',
        publisher: '重庆出版社',
        year: '2008'
    });
});

test('过滤 .result-ad 广告条目', () => {
    const doc = docOf([
        itemEl({ nbg: nbgEl({ title: '广告' }), ad: true }),
        itemEl({ nbg: nbgEl({ title: '正常书' }) })
    ]);
    const results = parseDoc(doc);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, '正常书');
});

test('无 a.nbg 的条目跳过', () => {
    const doc = docOf([itemEl({})]);
    assert.deepEqual(parseDoc(doc), []);
});

test('封面 URL：单斜杠开头补 https:', () => {
    const doc = docOf([
        itemEl({ nbg: nbgEl({}), cover: coverEl({ src: '/img.doubanio.com/x.jpg' }) })
    ]);
    assert.equal(parseDoc(doc)[0].cover, 'https:/img.doubanio.com/x.jpg');
});

test('封面 URL：协议相对路径（// 开头）保持原样', () => {
    const doc = docOf([
        itemEl({ nbg: nbgEl({}), cover: coverEl({ src: '//img.doubanio.com/x.jpg' }) })
    ]);
    assert.equal(parseDoc(doc)[0].cover, '//img.doubanio.com/x.jpg');
});

test('封面 URL：占位图剔除', () => {
    for (const bad of ['pixel.gif', 'blank.jpg', 'grey.gif', 'placeholder.png', 'default.jpg']) {
        const doc = docOf([itemEl({ nbg: nbgEl({}), cover: coverEl({ src: 'https://x.com/' + bad }) })]);
        assert.equal(parseDoc(doc)[0].cover, '', bad);
    }
});

test('封面优先级：data-src > src', () => {
    const doc = docOf([
        itemEl({ nbg: nbgEl({}), cover: coverEl({ 'data-src': 'https://a.com/1.jpg', src: 'https://b.com/2.jpg' }) })
    ]);
    assert.equal(parseDoc(doc)[0].cover, 'https://a.com/1.jpg');
});

test('.subject-cast 缺失时从 .pl 提取出版社/年份', () => {
    const doc = docOf([
        itemEl({ nbg: nbgEl({ title: '球状闪电' }), meta: textEl(' 出版时间: 2005 / 人民文学出版社 出版') })
    ]);
    const r = parseDoc(doc)[0];
    assert.equal(r.year, '2005');
    assert.equal(r.publisher, '人民文学出版社');
    assert.equal(r.author, undefined);
});

test('无评分/作者时字段缺省', () => {
    const doc = docOf([itemEl({ nbg: nbgEl({ title: '无名书' }) })]);
    assert.deepEqual(parseDoc(doc)[0], { title: '无名书', url: '', cover: '' });
});

test('结果截断到 10 条', () => {
    const items = [];
    for (let i = 0; i < 12; i++) items.push(itemEl({ nbg: nbgEl({ title: '书' + i }) }));
    assert.equal(parseDoc(docOf(items)).length, 10);
});

test('空文档返回空数组', () => {
    assert.deepEqual(parseDoc(docOf([])), []);
});
