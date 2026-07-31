// 自动阅读模块：逐页滚动 + 翻页 + 空格键控制
// 运行时状态（滚动标志/定时器）封闭在模块内部

export function createAutoReader({ store, doc, win, isDoubleColumnMode, onToggle }) {
    let autoScrollFlag = false;
    let scrollIntervalId = null;
    let scrollTimeoutId = null;
    let stopTimer = null;
    let spaceKeyHandler = null;

    function notifyToggle() {
        if (onToggle) onToggle();
    }

    // 查找"下一页"按钮
    function findNextPageButton() {
        const selectors = ['[class*="readerFooter_button"]', '[class*="readerHeaderButton"]', '.readerFooter_button', '.readerHeaderButton'];
        for (let sel of selectors) {
            let btns = doc.querySelectorAll(sel);
            for (let btn of btns) {
                let text = (btn.textContent || '') + (btn.getAttribute('title') || '') + (btn.getAttribute('aria-label') || '');
                if (/下一|next|→|❯|▶|arrow/i.test(text)) return btn;
            }
        }
        return null;
    }

    function tryTurnPage() {
        let nextBtn = findNextPageButton();
        if (nextBtn) { nextBtn.click(); return true; }
        let readerEl = doc.querySelector('.readerContent, .app_content, #routerView');
        let target = readerEl || doc.body;
        ['keydown','keyup'].forEach(type => target.dispatchEvent(new KeyboardEvent(type, { key: 'ArrowRight', keyCode: 39, code: 'ArrowRight', bubbles: true, cancelable: true })));
        if (!('ontouchstart' in win) || win.innerWidth > 768) {
            let contentEl = doc.querySelector('.readerContent, .app_content, .readerChapterContent');
            if (contentEl) {
                let rect = contentEl.getBoundingClientRect();
                contentEl.dispatchEvent(new MouseEvent('click', { clientX: rect.right - 50, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
            }
        }
        return true;
    }

    // 逐页滚动：按步长滚动，到底后翻页
    function startAutoScrollInterval(step) {
        if (scrollIntervalId) clearInterval(scrollIntervalId);
        if (scrollTimeoutId) clearTimeout(scrollTimeoutId);
        scrollIntervalId = setInterval(() => {
            if (!autoScrollFlag) return;
            let scrollTop = win.scrollY;
            let docHeight = doc.documentElement.scrollHeight;
            let winHeight = win.innerHeight;
            if (scrollTop + winHeight + 10 >= docHeight) {
                tryTurnPage();
                clearInterval(scrollIntervalId);
                scrollIntervalId = null;
                scrollTimeoutId = setTimeout(() => {
                    scrollTimeoutId = null;
                    if (!autoScrollFlag) return;
                    let newDocHeight = doc.documentElement.scrollHeight;
                    if (newDocHeight > docHeight || win.scrollY < 100) startAutoScrollInterval(step);
                    else { stop(); console.log('[悦读助手] 已到达末尾'); }
                }, 2000);
            } else {
                win.scrollBy({ top: step, behavior: 'instant' });
            }
        }, store.get('scrollInterval'));
    }

    function start() {
        if (autoScrollFlag) return;
        // 双栏模式下禁用自动阅读
        if (isDoubleColumnMode()) return;
        // 自动模式关闭时不允许自动阅读
        if (store.get('autoMode') === 1) return;
        autoScrollFlag = true;
        startAutoScrollInterval(store.get('scrollStep'));
        let autoStopMinutes = store.get('autoStopMinutes');
        if (autoStopMinutes > 0 && stopTimer === null) {
            stopTimer = setTimeout(() => stop(), autoStopMinutes * 60 * 1000);
        }
    }

    function stop() {
        if (!autoScrollFlag) return;
        autoScrollFlag = false;
        if (scrollIntervalId) { clearInterval(scrollIntervalId); scrollIntervalId = null; }
        if (scrollTimeoutId) { clearTimeout(scrollTimeoutId); scrollTimeoutId = null; }
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    }

    function toggle() {
        if (autoScrollFlag) stop();
        else start();
        notifyToggle();
    }

    function isRunning() {
        return autoScrollFlag;
    }

    // 空格键开始/暂停（自动模式关闭时忽略）
    function initSpaceKey() {
        if (spaceKeyHandler) return;
        spaceKeyHandler = function(e) {
            if (e.keyCode !== 32 && e.key !== ' ' && e.code !== 'Space') return;
            // 自动模式关闭时忽略空格键
            if (store.get('autoMode') === 1) return;
            let tag = (doc.activeElement && doc.activeElement.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (doc.activeElement && doc.activeElement.isContentEditable) return;
            e.preventDefault(); e.stopPropagation();
            toggle();
        };
        doc.addEventListener('keydown', spaceKeyHandler, true);
    }

    return { start, stop, toggle, isRunning, initSpaceKey };
}
