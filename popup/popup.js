// ============================================================
// 拾词 · 生词本 —— 弹窗：统计 + 最近收录 + 打开侧边栏
// ============================================================
import { getAllSorted, getStats, displayTranslation } from '../lib/store.js';

function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.95;
  const voices = synth.getVoices();
  const voice = voices.find(v => /^en[-_]/i.test(v.lang) && /natural|online/i.test(v.name))
    || voices.find(v => /^en[-_]/i.test(v.lang));
  if (voice) u.voice = voice;
  synth.cancel();
  synth.speak(u);
}

async function render() {
  const stats = await getStats();
  document.getElementById('stat-today').textContent = `今日新增 ${stats.todayNew}`;
  document.getElementById('stat-total').textContent = `共 ${stats.total} 词 · 已掌握 ${stats.mastered}`;

  const list = (await getAllSorted('recent')).slice(0, 5);
  const ul = document.getElementById('recent');
  ul.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '还没有收录生词。阅读英文网页时选中单词，右键「收录到生词本」。';
    ul.appendChild(li);
    return;
  }
  for (const w of list) {
    const li = document.createElement('li');

    const left = document.createElement('div');
    left.className = 'w';
    const word = document.createElement('div');
    word.className = 'word';
    word.textContent = w.word;
    const tran = document.createElement('div');
    tran.className = 'tran';
    tran.textContent = displayTranslation(w) || w.definition || '释义查询中…';
    left.append(word, tran);

    const btn = document.createElement('button');
    btn.className = 'speak';
    btn.title = '发音';
    btn.textContent = '🔊';
    btn.onclick = () => speak(w.word);

    li.append(left, btn);
    ul.appendChild(li);
  }
}

document.getElementById('btn-review').addEventListener('click', async () => {
  const win = await chrome.windows.getCurrent();
  try {
    await chrome.sidePanel.open({ windowId: win.id });
  } catch { /* 旧版 Edge 不支持时静默 */ }
  window.close();
});

// 查词结果异步写回时自动刷新
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.words) render();
});

render();
