import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWidescreenCss, buildBgCss, buildImmersiveCss } from '../chrome-extension/lib/theming.js';

const LIGHT = { name: '暖白', rgb: '#FAF5EE', type: 'light' };
const DARK = { name: '暗夜黑', rgb: '#1a1a2e', type: 'dark' };

// WIDE_RULES 的选择器清单（与 theming.js 内部规则表保持一致，防漂移）
const WIDE_SELECTORS = [
    '.readerContent', '.readerTopBar', '.readerTopBar_inner', '.readerControls',
    '.readerCatalog', '.readerNotePanel', '.readerAIChatPanel', '.readerChapterContent',
    '.app_content', '.wr_various_font_provider_wrapper',
    '.readerChapterContent_container', '.renderTargetContainer', '.renderTargetContent'
];

test('buildWidescreenCss：包含去重后的全部选择器', () => {
    const css = buildWidescreenCss();
    for (const sel of WIDE_SELECTORS) {
        assert.ok(css.includes(sel), '缺少选择器 ' + sel);
    }
});

test('buildBgCss：双栏分支不含文字颜色（Canvas 无法覆盖）', () => {
    const css = buildBgCss(DARK, true);
    assert.ok(css.includes('background-color: #1a1a2e !important'));
    assert.ok(!css.includes('readerChapterContent p'));
    assert.ok(!css.includes('.preRenderContainer'));
});

test('buildBgCss：双栏分支含 UI 文字颜色与背景', () => {
    const css = buildBgCss(DARK, true);
    assert.ok(css.includes('color: #d4d4d4 !important'));
    assert.ok(css.includes('background-image: none !important'));
});

test('buildBgCss：滚动分支含正文文字颜色', () => {
    const css = buildBgCss(DARK, false);
    assert.ok(css.includes('.readerChapterContent, .readerChapterContent .renderTargetContent, .readerChapterContent p'));
    assert.ok(css.includes('.preRenderContainer'));
    assert.ok(css.includes('.readerCatalog, .readerCatalog *, .readerNotePanel'));
});

test('buildBgCss：浅色主题文字色为深色', () => {
    const css = buildBgCss(LIGHT, false);
    assert.ok(css.includes('color: #333333 !important'));
    assert.ok(css.includes('color: #555555 !important'));
});

test('buildBgCss：深色主题文字色为浅色', () => {
    const css = buildBgCss(DARK, false);
    assert.ok(css.includes('color: #d4d4d4 !important'));
    assert.ok(css.includes('color: #a0a0a0 !important'));
});

test('buildImmersiveCss：隐藏顶栏/底栏/控制栏', () => {
    const css = buildImmersiveCss();
    assert.ok(css.includes('opacity: 0 !important'));
    assert.ok(css.includes('.readerTopBar:hover'));
    assert.ok(css.includes('body::-webkit-scrollbar'));
});
