// 页面诊断工具：输出 DOM 结构诊断信息到控制台（手动调试用，window.__wrDiag）

export function initDebug(doc, win) {
    function diagnosePage() {
        console.log('========== [悦读助手] 页面结构诊断 ==========');
        console.log('视口:', win.innerWidth + 'x' + win.innerHeight);

        let targets = [
            'readerContent', 'app_content', 'wr_various_font_provider_wrapper',
            'readerChapterContent', 'renderTargetContainer', 'renderTargetContent'
        ];
        console.log('--- 容器完整诊断 ---');
        targets.forEach(function(cls) {
            let el = doc.querySelector('.' + cls) || doc.querySelector('[class*="' + cls + '"]');
            if (!el) { console.log('  ' + cls + ': 未找到'); return; }
            let cs = getComputedStyle(el);
            let rect = el.getBoundingClientRect();
            console.log('  ' + cls + ':',
                Math.round(rect.width) + 'px',
                '| max-w:', cs.maxWidth,
                '| w:', cs.width,
                '| margin:', cs.marginLeft + '/' + cs.marginRight,
                '| padding:', cs.paddingLeft + '/' + cs.paddingRight,
                '| display:', cs.display,
                '| box-sizing:', cs.boxSizing,
                '| inline:', (el.getAttribute('style') || '').substring(0, 250));
        });

        // readerChapterContent 实际父元素
        console.log('--- readerChapterContent 实际父元素 ---');
        let chapter = doc.querySelector('.readerChapterContent');
        if (chapter) {
            let parent = chapter.parentElement;
            console.log('  父元素:', parent.tagName, parent.className, parent.id);
            let pcs = getComputedStyle(parent);
            console.log('  父 display:', pcs.display, 'width:', parent.getBoundingClientRect().width);
            let children = parent.children;
            console.log('  父有 ' + children.length + ' 个子元素:');
            for (let i = 0; i < children.length; i++) {
                let c = children[i];
                let cr = c.getBoundingClientRect();
                console.log('    [' + i + '] <' + c.tagName + '> class="' + (c.className || '') + '"',
                    Math.round(cr.width) + 'px');
            }
        }

        // 前3个可见文字段落
        console.log('--- 前3个可见文字段落 ---');
        let paras = doc.querySelectorAll('.readerChapterContent p, .renderTargetContent p');
        let shown = 0;
        paras.forEach(function(p) {
            if (shown >= 3) return;
            let rect = p.getBoundingClientRect();
            if (rect.width < 100 || rect.height < 10) return;
            shown++;
            let cs = getComputedStyle(p);
            console.log('  <p>',
                Math.round(rect.width) + 'x' + Math.round(rect.height),
                '| max-w:', cs.maxWidth,
                '| w:', cs.width,
                '| margin:', cs.marginLeft + '/' + cs.marginRight,
                '| inline:', (p.getAttribute('style') || '').substring(0, 200));
        });

        console.log('========== 诊断完成 ==========');
    }

    win.__wrDiag = diagnosePage;
}
