// ============================================================
// 拾词 · 生词本 —— 共享数据层
// 被 service-worker / popup / sidepanel 以 ES module 方式引用
// 数据全部保存在 chrome.storage.local，不上传任何服务器
// ============================================================

const WORDS_KEY = 'words';
const META_KEY = 'meta';

/** 归一化：去首尾标点、转小写，作为词条主键 */
export function normalizeWord(text) {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9'-]+|[^a-z0-9'-]+$/g, '');
}

/** 是否像英文单词/短语（纯字母，可含连字符、撇号、词间空格） */
export function isEnglish(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 60) return false;
  return /^[A-Za-z][A-Za-z'\u2019-]*(\s+[A-Za-z][A-Za-z'\u2019-]*)*$/.test(t);
}

/** 释义是否为无效脏数据（旧版解析 bug 存过 [object Object]） */
export function isBadTranslation(t) {
  return !t || String(t).includes('[object');
}

/** 取用于展示的中文释义；脏数据视为无释义 */
export function displayTranslation(word) {
  const t = (word && word.translation) || '';
  return isBadTranslation(t) ? '' : t;
}

export async function getAllWords() {
  const data = await chrome.storage.local.get(WORDS_KEY);
  return data[WORDS_KEY] || {};
}

export async function getWord(lower) {
  const words = await getAllWords();
  return words[lower] || null;
}

/**
 * 收录一个词。已存在则遇到次数 +1，上下文更新为最近一次遇到的内容。
 * @returns {Promise<{entry: object, isNew: boolean}>}
 */
export async function addWord({ word, context = '', url = '', title = '' }) {
  const lower = normalizeWord(word);
  if (!lower) throw new Error('empty word');
  const words = await getAllWords();
  let entry = words[lower];
  let isNew = false;
  if (entry) {
    entry.count = (entry.count || 1) + 1;
    if (context) entry.context = context;
    if (url) entry.url = url;
    if (title) entry.title = title;
  } else {
    isNew = true;
    entry = {
      word: String(word).trim(),
      lower,
      translation: '',   // 中文释义（查词结果，可手动编辑）
      phonetic: '',      // 音标
      definition: '',    // 英文释义（兜底）
      context: context || '',
      url: url || '',
      title: title || '',
      count: 1,
      addedAt: Date.now(),
      status: 'new',     // new | learning | mastered
      known: 0,
      unknown: 0,
      lastReviewAt: null,
    };
  }
  words[lower] = entry;
  await chrome.storage.local.set({ [WORDS_KEY]: words });
  return { entry, isNew };
}

export async function updateWord(lower, patch) {
  const words = await getAllWords();
  if (!words[lower]) return null;
  Object.assign(words[lower], patch, { lower });
  await chrome.storage.local.set({ [WORDS_KEY]: words });
  return words[lower];
}

export async function deleteWord(lower) {
  const words = await getAllWords();
  if (!(lower in words)) return false;
  delete words[lower];
  await chrome.storage.local.set({ [WORDS_KEY]: words });
  return true;
}

/** 返回数组；order: 'recent' 按收录时间倒序 | 'alpha' 按字母序 */
export async function getAllSorted(order = 'recent') {
  const arr = Object.values(await getAllWords());
  if (order === 'alpha') arr.sort((a, b) => a.lower.localeCompare(b.lower));
  else arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return arr;
}

export async function getStats() {
  const arr = Object.values(await getAllWords());
  const today = new Date().toDateString();
  return {
    total: arr.length,
    mastered: arr.filter(w => w.status === 'mastered').length,
    learning: arr.filter(w => w.status === 'learning').length,
    newCount: arr.filter(w => w.status === 'new').length,
    todayNew: arr.filter(w => new Date(w.addedAt).toDateString() === today).length,
  };
}

// ---------------- 角标（今日新增数，每日零点重置） ----------------

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function getMeta() {
  const data = await chrome.storage.local.get(META_KEY);
  return data[META_KEY] || {};
}

/** 收录成功后自增角标（仅 service worker 调用） */
export async function bumpBadge() {
  const meta = await getMeta();
  const today = todayStr();
  const count = meta.date === today ? (meta.count || 0) + 1 : 1;
  await chrome.storage.local.set({ [META_KEY]: { date: today, count } });
  await setBadge(count);
}

/** 校准角标（跨天后清零；仅 service worker 调用） */
export async function refreshBadge() {
  const meta = await getMeta();
  const today = todayStr();
  if (meta.date !== today) {
    await chrome.storage.local.set({ [META_KEY]: { date: today, count: 0 } });
    await setBadge(0);
    return;
  }
  await setBadge(meta.count || 0);
}

async function setBadge(count) {
  await chrome.action.setBadgeBackgroundColor({ color: '#C9A227' });
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

// ---------------- 导出 / 导入 ----------------

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function buildCSV(list) {
  const header = ['单词', '音标', '释义', '英文释义', '原句上下文', '来源', '收录时间', '遇到次数', '状态'];
  const statusText = { mastered: '已掌握', learning: '学习中', new: '新词' };
  const rows = list.map(w => [
    w.word,
    w.phonetic || '',
    w.translation || '',
    w.definition || '',
    w.context || '',
    w.url || w.title || '',
    w.addedAt ? new Date(w.addedAt).toLocaleString('zh-CN') : '',
    w.count || 1,
    statusText[w.status] || w.status || '',
  ]);
  // \uFEFF BOM 保证 Excel 直接打开不乱码
  return '\uFEFF' + [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
}

export function buildJSONBackup(list) {
  return JSON.stringify({
    app: 'word-collector',
    version: 1,
    exportedAt: new Date().toISOString(),
    words: list,
  }, null, 2);
}

/** 合并导入：同名词以备份为准覆盖，其余保留 */
export async function importJSON(text) {
  const data = JSON.parse(text);
  const incoming = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(incoming)) throw new Error('文件里找不到 words 数组');
  const words = await getAllWords();
  let added = 0;
  let updated = 0;
  for (const w of incoming) {
    const lower = normalizeWord(w.word || w.lower);
    if (!lower) continue;
    if (words[lower]) updated++;
    else added++;
    words[lower] = { ...w, word: w.word || lower, lower };
  }
  await chrome.storage.local.set({ [WORDS_KEY]: words });
  return { added, updated };
}

// ---------------- 页面工具（仅 popup / sidepanel 可用） ----------------

export function downloadFile(content, filename, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
