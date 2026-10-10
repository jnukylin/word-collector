// ============================================================
// 拾词 · 生词本 —— 后台
// 右键菜单收录 / 自动查释义（有道 → dictionaryapi.dev）/ 角标维护
// ============================================================
import { addWord, updateWord, getWord, getAllWords, isEnglish, isBadTranslation, bumpBadge, refreshBadge } from '../lib/store.js';

const MENU_ID = 'save-word';
const FETCH_TIMEOUT = 8000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '收录到生词本：“%s”',
      contexts: ['selection'],
    });
  });
  scheduleDailyReset();
  refreshBadge();
  healBadTranslations();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDailyReset();
  refreshBadge();
});

// 跨天时重置"今日新增"角标
function scheduleDailyReset() {
  const next = new Date();
  next.setHours(24, 0, 5, 0);
  chrome.alarms.create('daily-reset', { when: next.getTime(), periodInMinutes: 24 * 60 });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'daily-reset') refreshBadge();
});

// ---------------- 收录主流程 ----------------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const selected = info.selectionText.trim();
  if (!selected) return;

  // 1) 向内容脚本要选区所在的原句上下文；拿不到（如内置 PDF 查看器）就只记词
  let ctx = null;
  if (tab && tab.id != null) {
    try {
      ctx = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION_CONTEXT' });
    } catch { /* 页面上没有内容脚本 */ }
  }

  const word = (ctx && ctx.word && ctx.word.trim()) || selected;

  // 2) 只收英文单词/短语
  if (!isEnglish(word)) {
    notifyTab(tab && tab.id, { type: 'WORD_SAVE_FAILED', word, message: `「${word.slice(0, 30)}」不是英文单词，未收录` });
    return;
  }

  // 3) 入库（重复收录则遇到次数 +1）
  let result;
  try {
    result = await addWord({
      word,
      context: (ctx && ctx.context) || '',
      url: (ctx && ctx.url) || (tab && tab.url) || '',
      title: (ctx && ctx.title) || (tab && tab.title) || '',
    });
  } catch {
    notifyTab(tab && tab.id, { type: 'WORD_SAVE_FAILED', word, message: `${word} 收录失败，请重试` });
    return;
  }

  await bumpBadge();
  notifyTab(tab && tab.id, {
    type: 'WORD_SAVED',
    word: result.entry.word,
    isNew: result.isNew,
    count: result.entry.count,
  });

  // 4) 异步补释义，不阻塞收录反馈
  lookupWord(result.entry.lower);
});

function notifyTab(tabId, msg) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

// 侧边栏/弹窗请求重查释义（仅在释义为空时生效）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'LOOKUP_WORD' && msg.lower) {
    lookupWord(msg.lower);
    sendResponse({ ok: true });
  }
  return false;
});

// ---------------- 查词 ----------------

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupWord(lower) {
  const existing = await getWord(lower);
  // 已有有效中文释义就不再查；旧版本存过 [object Object] 脏数据的要重查
  if (!existing || (existing.translation && !isBadTranslation(existing.translation))) return;

  const zh = await lookupYoudao(lower);
  if (zh) {
    await updateWord(lower, zh);
    return;
  }
  const en = await lookupFreeDict(lower);
  if (en) await updateWord(lower, en);
}

/** 修复历史脏数据：释义含 [object 的词重新查一遍（扩展安装/更新时执行） */
async function healBadTranslations() {
  const words = await getAllWords();
  for (const w of Object.values(words)) {
    if (isBadTranslation(w.translation)) lookupWord(w.lower);
  }
}

/** 有道词典公开接口：中文释义 + 音标 */
async function lookupYoudao(word) {
  const data = await fetchJSON(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`);
  if (!data || typeof data !== 'object') return null;
  try {
    let translation = '';
    let phonetic = '';
    const ecWord = data.ec && data.ec.word && data.ec.word[0];
    if (ecWord) {
      // 释义结构：trs[].tr[].l.i，i 可能是字符串或字符串数组
      const trs = (ecWord.trs || [])
        .map(t => (t.tr || [])
          .map(x => {
            const i = x && x.l && x.l.i;
            if (Array.isArray(i)) return i.join('');
            return i == null ? '' : String(i);
          })
          .join(''))
        .filter(Boolean);
      if (trs.length) translation = trs.slice(0, 3).join('；');
      const phone = ecWord.usphone || ecWord.ukphone || '';
      if (phone) phonetic = phone.startsWith('/') ? phone : `/${phone}/`;
    }
    if (!translation && data.fanyi && data.fanyi.tran) {
      translation = String(data.fanyi.tran);
    }
    if (!translation) return null;
    return { translation, phonetic };
  } catch {
    return null;
  }
}

/** dictionaryapi.dev 免费接口：英文释义兜底 */
async function lookupFreeDict(word) {
  const data = await fetchJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!Array.isArray(data) || !data.length) return null;
  try {
    const entry = data[0];
    const phonetics = (entry.phonetics || []).map(p => p.text).filter(Boolean);
    const defs = [];
    for (const m of entry.meanings || []) {
      for (const d of m.definitions || []) {
        if (d.definition) defs.push(`${m.partOfSpeech ? m.partOfSpeech + '. ' : ''}${d.definition}`);
        if (defs.length >= 3) break;
      }
      if (defs.length >= 3) break;
    }
    if (!defs.length && !phonetics.length) return null;
    return {
      definition: defs.join('；'),
      phonetic: phonetics[0] || '',
    };
  } catch {
    return null;
  }
}
