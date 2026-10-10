// ============================================================
// 拾词 · 生词本 —— 内容脚本
// 职责：1) 后台要选区上下文时返回"选中文本 + 所在句子"
//       2) 收录成功/失败后在页面内浮出 toast
// 样式全部内联，避免被页面 CSS 干扰，因此无需注入 css 文件
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'GET_SELECTION_CONTEXT') {
    sendResponse(getSelectionContext());
  } else if (msg && msg.type === 'WORD_SAVED') {
    showToast(
      msg.isNew ? `✓ ${msg.word} 已收录` : `✓ ${msg.word} 第 ${msg.count} 次遇到`,
      'ok'
    );
  } else if (msg && msg.type === 'WORD_SAVE_FAILED') {
    showToast(`✕ ${msg.message || '收录失败'}`, 'err');
  }
});

/** 读取当前选区：选中文本 + 所在句子的上下文（记忆钩子） */
function getSelectionContext() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
  const word = sel.toString().trim().slice(0, 60);

  let context = '';
  try {
    const startNode = sel.getRangeAt(0).startContainer;
    const base = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
    const el = base && base.closest(
      'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, dd, dt, figcaption, div, section, article'
    );
    const full = (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
    if (full) {
      if (full.length <= 260) {
        context = full;
      } else {
        const i = full.indexOf(word);
        if (i >= 0) {
          const start = Math.max(0, i - 90);
          const end = Math.min(full.length, i + word.length + 150);
          context = (start > 0 ? '…' : '') + full.slice(start, end) + (end < full.length ? '…' : '');
        } else {
          context = full.slice(0, 260) + '…';
        }
      }
    }
  } catch { /* 上下文提取失败不影响收录 */ }

  return {
    word,
    context,
    url: location.href,
    title: (document.title || '').slice(0, 120),
  };
}

/** 页内浮动提示 */
let toastEl = null;
let toastTimer = null;

function showToast(text, kind) {
  if (toastEl) toastEl.remove();
  clearTimeout(toastTimer);

  toastEl = document.createElement('div');
  toastEl.textContent = text;
  Object.assign(toastEl.style, {
    position: 'fixed',
    top: '18px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    maxWidth: '80vw',
    padding: '9px 18px',
    borderRadius: '10px',
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#fff',
    background: kind === 'err' ? '#b3261e' : '#1f3a5f',
    boxShadow: '0 4px 16px rgba(0,0,0,.25)',
    fontFamily: '"Microsoft YaHei", "Segoe UI", system-ui, sans-serif',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    opacity: '1',
    transition: 'opacity .3s',
  });
  (document.body || document.documentElement).appendChild(toastEl);

  toastTimer = setTimeout(() => {
    if (!toastEl) return;
    toastEl.style.opacity = '0';
    setTimeout(() => {
      if (toastEl) toastEl.remove();
      toastEl = null;
    }, 320);
  }, 2200);
}
