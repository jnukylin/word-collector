// ============================================================
// 拾词 · 生词本 —— 侧边栏
// 词表：搜索 / 筛选 / 发音 / 编辑释义 / 标记掌握 / 删除 / 导出导入
// 抽认卡：翻面回想 → 认识/不认识，错词本轮末尾重现
// ============================================================
import {
  getAllSorted, getStats, deleteWord, updateWord, importJSON,
  buildCSV, buildJSONBackup, downloadFile, fmtDate, displayTranslation,
} from '../lib/store.js';

const state = { filter: 'all', sort: 'recent', query: '' };
let session = null; // 当前抽认卡会话

/* ---------------- 通用 ---------------- */

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

function dateStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/* ---------------- Tab 切换 ---------------- */

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('view-list').classList.toggle('active', name === 'list');
  document.getElementById('view-cards').classList.toggle('active', name === 'cards');
  if (name === 'cards') startSession();
}

/* ---------------- 词表 ---------------- */

const els = {
  search: document.getElementById('search'),
  sort: document.getElementById('sort'),
  filters: document.getElementById('filters'),
  statsline: document.getElementById('statsline'),
  list: document.getElementById('word-list'),
};

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  renderList();
});
els.sort.addEventListener('change', () => {
  state.sort = els.sort.value;
  renderList();
});
els.filters.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    state.filter = chip.dataset.filter;
    els.filters.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
    renderList();
  });
});

async function renderList() {
  const [list, stats] = await Promise.all([getAllSorted(state.sort), getStats()]);
  const q = state.query.trim().toLowerCase();
  const items = list.filter(w => {
    if (state.filter === 'mastered' && w.status !== 'mastered') return false;
    if (state.filter === 'notmastered' && w.status === 'mastered') return false;
    if (q && !`${w.word}\n${w.translation}\n${w.definition}`.toLowerCase().includes(q)) return false;
    return true;
  });

  els.statsline.textContent =
    `共 ${stats.total} 词 · 学习中 ${stats.newCount + stats.learning} · 已掌握 ${stats.mastered}`;

  els.list.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = list.length
      ? '没有符合筛选条件的词。'
      : '词表还是空的。阅读英文网页时选中单词，右键「收录到生词本」。';
    els.list.appendChild(li);
    return;
  }
  for (const w of items) els.list.appendChild(buildItem(w));
}

function buildItem(w) {
  const li = document.createElement('li');
  li.className = 'item' + (w.status === 'mastered' ? ' mastered' : '');

  const main = document.createElement('div');
  main.className = 'item-main';

  // 第一行：单词 + 音标 + 遇到次数 + 状态
  const line1 = document.createElement('div');
  line1.className = 'line1';
  const wordEl = document.createElement('span');
  wordEl.className = 'word';
  wordEl.textContent = w.word;
  line1.appendChild(wordEl);
  if (w.phonetic) {
    const phone = document.createElement('span');
    phone.className = 'phonetic';
    phone.textContent = w.phonetic;
    line1.appendChild(phone);
  }
  if ((w.count || 1) > 1) {
    const times = document.createElement('span');
    times.className = 'times';
    times.title = '遇到的次数';
    times.textContent = `×${w.count}`;
    line1.appendChild(times);
  }
  if (w.status === 'mastered') {
    const chip = document.createElement('span');
    chip.className = 'chip-done';
    chip.textContent = '已掌握';
    line1.appendChild(chip);
  }

  // 第二行：释义
  const line2 = document.createElement('div');
  line2.className = 'line2';
  line2.textContent = displayTranslation(w) || w.definition || '（释义待查询：点 ⟳ 重试，或点 ✎ 手动填写）';

  main.append(line1, line2);

  // 原句上下文（折叠）
  if (w.context || w.url) {
    const det = document.createElement('details');
    det.className = 'ctx';
    const sum = document.createElement('summary');
    sum.textContent = '原句与来源';
    det.appendChild(sum);

    const body = document.createElement('div');
    body.className = 'ctx-body';
    if (w.context) {
      const quote = document.createElement('div');
      quote.className = 'ctx-quote';
      quote.textContent = w.context;
      body.appendChild(quote);
    }
    const meta = document.createElement('div');
    meta.className = 'ctx-meta';
    if (w.url) {
      const src = document.createElement('a');
      src.className = 'ctx-src';
      src.href = w.url;
      src.target = '_blank';
      src.rel = 'noopener';
      try { src.textContent = new URL(w.url).hostname; } catch { src.textContent = w.url; }
      meta.appendChild(src);
    }
    const date = document.createElement('span');
    date.textContent = fmtDate(w.addedAt);
    meta.appendChild(date);
    body.appendChild(meta);

    det.appendChild(body);
    main.appendChild(det);
  }

  // 右侧操作列
  const ops = document.createElement('div');
  ops.className = 'item-ops';
  const mkBtn = (text, title, cls = '') => {
    const b = document.createElement('button');
    b.className = ('op ' + cls).trim();
    b.textContent = text;
    b.title = title;
    return b;
  };

  const bSpeak = mkBtn('🔊', '发音');
  bSpeak.onclick = () => speak(w.word);
  ops.appendChild(bSpeak);

  if (!displayTranslation(w) && !w.definition) {
    const bRetry = mkBtn('⟳', '重新查询释义');
    bRetry.onclick = () => chrome.runtime.sendMessage({ type: 'LOOKUP_WORD', lower: w.lower });
    ops.appendChild(bRetry);
  }

  const bEdit = mkBtn('✎', '手动编辑释义');
  bEdit.onclick = async () => {
    const val = prompt(`「${w.word}」的释义：`, w.translation || w.definition || '');
    if (val == null) return;
    await updateWord(w.lower, { translation: val.trim() });
    renderList();
  };
  ops.appendChild(bEdit);

  const mastered = w.status === 'mastered';
  const bMaster = mkBtn(mastered ? '↩' : '✓', mastered ? '恢复复习' : '标记为已掌握', mastered ? '' : 'ok');
  bMaster.onclick = async () => {
    await updateWord(w.lower, { status: mastered ? 'learning' : 'mastered' });
    renderList();
  };
  ops.appendChild(bMaster);

  const bDel = mkBtn('🗑', '删除', 'danger');
  bDel.onclick = async () => {
    if (!confirm(`确定删除「${w.word}」吗？删除后不可恢复。`)) return;
    await deleteWord(w.lower);
    renderList();
  };
  ops.appendChild(bDel);

  li.append(main, ops);
  return li;
}

/* ---------------- 导出 / 导入 ---------------- */

document.getElementById('btn-export-csv').addEventListener('click', async () => {
  const list = await getAllSorted('alpha');
  if (!list.length) { alert('词表为空，没有可导出的内容。'); return; }
  downloadFile(buildCSV(list), `拾词生词本_${dateStamp()}.csv`, 'text/csv');
});

document.getElementById('btn-export-json').addEventListener('click', async () => {
  const list = await getAllSorted('recent');
  if (!list.length) { alert('词表为空，没有可导出的内容。'); return; }
  downloadFile(buildJSONBackup(list), `拾词生词本备份_${dateStamp()}.json`, 'application/json');
});

const fileInput = document.getElementById('file-json');
document.getElementById('btn-import-json').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const text = String(reader.result || '');
      const preview = JSON.parse(text);
      const incoming = Array.isArray(preview) ? preview : preview.words;
      if (!Array.isArray(incoming)) throw new Error('文件里找不到 words 数组');
      if (!confirm(`备份中共 ${incoming.length} 个词：同名词会被备份覆盖，其余保留。确认导入？`)) return;
      const res = await importJSON(text);
      alert(`导入完成：新增 ${res.added} 词，覆盖 ${res.updated} 词。`);
      renderList();
    } catch (e) {
      alert('导入失败：' + (e.message || '不是有效的拾词备份文件。'));
    }
  };
  reader.readAsText(file, 'utf-8');
});

/* ---------------- 抽认卡 ---------------- */

const card = {
  root: document.getElementById('card'),
  empty: document.getElementById('card-empty'),
  count: document.getElementById('card-count'),
  word: document.getElementById('card-word'),
  phonetic: document.getElementById('card-phonetic'),
  speak: document.getElementById('card-speak'),
  answer: document.getElementById('card-answer'),
  tran: document.getElementById('card-tran'),
  def: document.getElementById('card-def'),
  context: document.getElementById('card-context'),
  source: document.getElementById('card-source'),
  actions: document.getElementById('card-actions'),
  summary: document.getElementById('card-summary'),
};

function startSession() {
  session = null;
  card.summary.classList.add('hidden');
  card.root.classList.add('hidden');
  card.empty.classList.add('hidden');

  getAllSorted('recent').then(list => {
    // 队列：错得多的优先 → 最久没复习的优先 → 先收录的优先
    const queue = list
      .filter(w => w.status !== 'mastered')
      .sort((a, b) =>
        (b.unknown || 0) - (a.unknown || 0) ||
        (a.lastReviewAt || 0) - (b.lastReviewAt || 0) ||
        (a.addedAt || 0) - (b.addedAt || 0))
      .map(w => w.lower);

    if (!queue.length) {
      card.empty.classList.remove('hidden');
      return;
    }
    session = {
      queue,
      idx: 0,
      total: queue.length,
      known: 0,
      unknown: 0,
      requeued: new Set(),   // 每个词本轮最多重现一次，避免死循环
      data: new Map(list.map(w => [w.lower, w])),
    };
    showCard();
  });
}

function showCard() {
  const lower = session.queue[session.idx];
  const w = session.data.get(lower);

  card.root.classList.remove('hidden');
  card.empty.classList.add('hidden');
  card.summary.classList.add('hidden');
  card.count.textContent = `${session.idx + 1} / ${session.queue.length}`;
  card.word.textContent = w.word;
  card.phonetic.textContent = w.phonetic || '';
  card.answer.classList.add('hidden');

  card.speak.onclick = () => speak(w.word);

  card.actions.innerHTML = '';
  const bFlip = document.createElement('button');
  bFlip.className = 'btn primary wide';
  bFlip.textContent = '显示答案';
  bFlip.onclick = flipCard;
  card.actions.appendChild(bFlip);
}

async function flipCard() {
  const lower = session.queue[session.idx];
  const w = session.data.get(lower);

  card.tran.textContent = displayTranslation(w) || w.definition || '（暂无中文释义，可在词表里点 ✎ 补充）';
  card.def.textContent = w.definition || '';
  card.context.textContent = w.context ? `“${w.context}”` : '';
  if (w.url) {
    try { card.source.textContent = '来源：' + new URL(w.url).hostname; }
    catch { card.source.textContent = '来源：' + w.url; }
  } else {
    card.source.textContent = '';
  }
  card.answer.classList.remove('hidden');

  // 记录复习时间；首次复习的词从 new 变 learning
  const patched = await updateWord(lower, {
    lastReviewAt: Date.now(),
    status: w.status === 'new' ? 'learning' : w.status,
  });
  if (patched) session.data.set(lower, patched);

  card.actions.innerHTML = '';
  const bNo = document.createElement('button');
  bNo.className = 'btn warn';
  bNo.textContent = '😕 不认识';
  bNo.onclick = () => answer(false);
  const bYes = document.createElement('button');
  bYes.className = 'btn ok';
  bYes.textContent = '认识 🙂';
  bYes.onclick = () => answer(true);
  card.actions.append(bNo, bYes);
}

async function answer(knowIt) {
  const lower = session.queue[session.idx];
  const w = session.data.get(lower);
  const patch = knowIt
    ? { known: (w.known || 0) + 1 }
    : { unknown: (w.unknown || 0) + 1 };
  const patched = await updateWord(lower, patch);
  if (patched) session.data.set(lower, patched);

  if (knowIt) session.known++;
  else {
    session.unknown++;
    if (!session.requeued.has(lower)) {
      session.requeued.add(lower);
      session.queue.push(lower); // 不认识的词本轮末尾再过一遍
    }
  }

  session.idx++;
  if (session.idx >= session.queue.length) showSummary();
  else showCard();
}

function showSummary() {
  card.root.classList.add('hidden');
  card.empty.classList.add('hidden');
  card.summary.classList.remove('hidden');
  card.summary.innerHTML = '';

  const h = document.createElement('div');
  h.className = 'sum-title';
  h.textContent = '本轮复习完成 🎉';
  const p = document.createElement('div');
  p.className = 'sum-line';
  p.textContent = `复习 ${session.total} 词 · 认识 ${session.known} · 不认识 ${session.unknown}`;

  const row = document.createElement('div');
  row.className = 'sum-actions';
  const again = document.createElement('button');
  again.className = 'btn primary';
  again.textContent = '再来一轮';
  again.onclick = startSession;
  const toList = document.createElement('button');
  toList.className = 'btn';
  toList.textContent = '回到词表';
  toList.onclick = () => switchTab('list');
  row.append(again, toList);

  card.summary.append(h, p, row);
}

// 键盘快捷键：空格翻面，1 = 不认识，2 = 认识
document.addEventListener('keydown', e => {
  const cardsActive = document.getElementById('view-cards').classList.contains('active');
  if (!cardsActive || !session || session.idx >= session.queue.length) return;
  const flipped = !card.answer.classList.contains('hidden');
  if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    flipCard();
  } else if (flipped && e.key === '1') {
    answer(false);
  } else if (flipped && e.key === '2') {
    answer(true);
  }
});

/* ---------------- 初始化 ---------------- */

// 查词结果异步写回时：刷新词表，并把结果同步进当前抽认卡会话
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.words) return;
  renderList();
  if (session) {
    const words = changes.words.newValue || {};
    for (const lower of session.queue) {
      if (words[lower]) session.data.set(lower, words[lower]);
    }
  }
});

renderList();
