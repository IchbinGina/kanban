/**
 * 祈雅的案件看板（個人 Apps Script 網頁）
 * 資料來源：業務案件管理-202605起
 *   - 行政中心_案件管制表(2026)：主資料（與公司 App 共用，寫入規則比照 App）
 *   - 看板擴充：看板專屬欄位（顯示開關、看板欄位、下一步、待辦、筆記）
 *   - 活動確認單：每個案件一列
 * 電訪紀錄：klarabc091 雲端硬碟「祈雅-電訪紀錄」（CALL_SID）
 * 部署：執行身分「我」（klarabc091），存取權「任何擁有 Google 帳戶的使用者」
 * 保護：每次讀寫都要帶 PIN 碼；連續錯 5 次鎖 15 分鐘。
 * 第一次使用：在編輯器把 setupPin() 裡的 PIN 改成你要的數字 → 執行 setupPin → 再把 PIN 改回 '' 並儲存。
 */

// ── PIN 設定（只在編輯器手動執行一次） ─────────────────────
function setupPin() {
  const PIN = '';   // ← 在這裡填你要的 PIN（建議 6 位數以上），執行完請刪掉再儲存
  if (!PIN || String(PIN).length < 4) throw new Error('請先在 setupPin() 裡填入至少 4 位數的 PIN');
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ PIN_SALT: salt, PIN_HASH: hash_(salt + PIN) });
  CacheService.getScriptCache().remove('pin_fail');
  Logger.log('PIN 已設定完成。請把 setupPin() 裡的 PIN 改回空白並儲存。');
}
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function auth_(pin) {
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty('PIN_SALT'), h = props.getProperty('PIN_HASH');
  if (!salt || !h) throw new Error('AUTH:尚未設定 PIN，請先在編輯器執行 setupPin');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pin_fail') || 0);
  if (fails >= 5) throw new Error('AUTH:錯誤次數過多，請 15 分鐘後再試');
  if (hash_(salt + String(pin || '')) !== h) {
    cache.put('pin_fail', String(fails + 1), 900);
    throw new Error('AUTH:PIN 錯誤（剩 ' + (4 - fails) + ' 次）');
  }
  if (fails) cache.remove('pin_fail');
}
function checkPin(pin) { auth_(pin); return { ok: true }; }
const SID   = '1dYTlVVS2ZmSUb3_idFfNY5T2UFMb2bW5rL1HtUREXJ4';
const MAIN  = '行政中心_案件管制表(2026)';
const BOARD = '看板擴充';
const BRIEF = '活動確認單';
const ME    = '祈雅';
const TZ    = 'Asia/Taipei';
const DATA_ROW = 3;

// 主表欄位（0-based，與公司 App 的 F 對照表一致）
const F = {
  GRADE: 0, EXEC_MONTH: 2, HANDLER: 5, CONTACT_ST: 7, PLAN_DATE: 8, ACT_DATE: 9,
  PROGRESS: 10, QUOTE: 11, NOTES: 12, ID: 13, TIME: 14, COMPANY: 15, CONTACT: 16,
  TITLE: 17, DEPT: 18, PHONE: 19, EMAIL: 20, NEED: 21, ACT_DATE2: 23, ACT_TIME: 24,
  HEADCOUNT: 26, LOCATION: 27, FORMAT: 29, PURPOSE: 31, BUDGET: 32, REMARKS: 37,
  DEAL_AMT: 50, FAIL_REASON: 52, FAIL_DESC: 53, TRACK_DATE: 54, UPDATED: 57,
  PROP_ACT: 58, DEAL_ACT: 59, PROP_LOGS: 60, CO_TITLE: 61, TAX_ID: 62, ADDRESS: 63
};
const STATUS  = ['聯繫中待提案', '已提案待追蹤', '成交', '已提案未成交', '不提案/合併/失案'];
const CONTACT = ['待聯絡', '已聯絡', '聯絡中', '聯絡不上'];
const FAIL = ['同業競爭-顧問','同業競爭-代辦','同業競爭-預算','同業競爭-外語','同業競爭-產品',
  '不接案-預算太少/人數太少','不接案-無適合產品','不接案-無法配合日期','產品對焦失利','服務不周',
  '企業內部原因-換需求象限','企業內部原因-承辦人','企業內部原因-延期停辦','旅行社/公關行銷公司','失聯','其他'];

const BOARD_COLS = ['CRM編號','公司名稱(參考)','看板顯示','看板欄位','下一步','待辦清單JSON','看板筆記','待回信','行事曆活動ID','更新時間'];
const BRIEF_SECTIONS = [
  ['活動內容', ['專案案號','活動日期','活動時間','集合時間','集合地點','活動人數','分組數','活動對象','活動地點','關卡','雨備內容','器材','車輛','餐食','問卷','名牌']],
  ['定稿流程', ['場佈抵達時間','場佈位置','報到方式','開場流程','致詞','大合照','頒獎','名牌貼紙','男女比','公司稱謂']],
  ['責任分工', ['分組名單(客戶提供)','桌子數量','椅子數量','桌椅擺放方式']],
  ['約定事項', ['分組方式','活動聯繫人','帶入主題','活動slogan','講師注意事項','客戶提醒']],
  ['人力配置', ['講師','業務','行政','關主/引導員','教練','人力需求人數','人力性質','工作內容/須知','人力交通','工作津貼/費用']],
  ['專案進度', ['報價單歸檔','保險名單','餐食代辦','場地代辦','設備廠商']],
  ['發票資訊', ['發票抬頭','統編','品項名稱','發票日期','未稅金額','稅金金額','含稅金額','收件資訊']],
  ['住宿', ['住宿飯店','住宿地址','住宿費用支付','訂房人資料','停車場','入住退房時間','是否有早餐']]
];
// 電訪紀錄（klarabc091 雲端硬碟「祈雅-電訪紀錄」，第一個工作表）
const CALL_SID = '1RElpf3qF0O4vk1czdF0TPiF9UHHcYABQryaH63S_or8';
const CALL_FIELDS = ['窗口','聯絡方式','對焦日期','活動日期','時段','人數','地點區域','場地','預算','活動偏好','核心目的與痛點','備註'];
const CALL_REQ = CALL_FIELDS.filter(f => f !== '備註');
function callSh_() { return SpreadsheetApp.openById(CALL_SID).getSheets()[0]; }

const CAL = { tentative: 'funoutdoor001@gmail.com', confirmed: 'funoutdoor.go@gmail.com' };

// ── 網頁進入點 ─────────────────────────────────────────────
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('案件看板')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

// ── 工具 ──────────────────────────────────────────────────
function ss_() { return SpreadsheetApp.openById(SID); }
function sh_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('找不到工作表：' + name);
  return s;
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function cell_(v, withTime) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, withTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}
function rowOf_(sheet, col0, id, firstRow) {
  const last = sheet.getLastRow();
  if (last < firstRow) return -1;
  const vals = sheet.getRange(firstRow, col0 + 1, last - firstRow + 1, 1).getValues();
  const hits = [];
  vals.forEach((r, i) => { if (String(r[0]).trim() === id) hits.push(firstRow + i); });
  if (hits.length > 1) throw new Error(id + ' 在「' + sheet.getName() + '」出現 ' + hits.length + ' 次，請先人工確認');
  return hits.length ? hits[0] : -1;
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function headerMap_(sheet) {
  const h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const m = {}; h.forEach((name, i) => { if (name) m[String(name)] = i + 1; });
  return m;
}

// ── 讀取 ──────────────────────────────────────────────────
function getData(pin) {
  auth_(pin);
  const main = sh_(MAIN).getDataRange().getValues();
  const boardSh = sh_(BOARD), briefSh = sh_(BRIEF);
  const boardVals = boardSh.getDataRange().getValues();
  const briefVals = briefSh.getDataRange().getValues();
  const briefHead = briefVals[0] || [];

  const board = {};
  for (let i = 1; i < boardVals.length; i++) {
    const r = boardVals[i]; const id = String(r[0]).trim(); if (!id) continue;
    let ck = []; try { ck = JSON.parse(r[5] || '[]'); } catch (e) {}
    board[id] = { visible: String(r[2] || '自動'), column: String(r[3] || ''), next: String(r[4] || ''),
                  checklist: ck, note: String(r[6] || ''), mail: String(r[7] || ''), calId: String(r[8] || '') };
  }
  const brief = {};
  for (let i = 1; i < briefVals.length; i++) {
    const r = briefVals[i]; const id = String(r[0]).trim(); if (!id) continue;
    const o = { values: {}, status: {}, progress: String(r[2] || '') };
    briefHead.forEach((h, j) => { if (j >= 3 && h && h !== '欄位狀態JSON' && h !== '更新時間') o.values[h] = cell_(r[j]); });
    const sj = briefHead.indexOf('欄位狀態JSON');
    if (sj >= 0) { try { o.status = JSON.parse(r[sj] || '{}'); } catch (e) {} }
    brief[id] = o;
  }

  const call = {};
  try {
    const cv = callSh_().getDataRange().getValues(); const ch = cv[0] || [];
    for (let i = 1; i < cv.length; i++) {
      const r = cv[i]; const id = String(r[0]).trim(); if (!id) continue;
      const o = { values: {}, answers: {}, updated: '' };
      ch.forEach((h, j) => {
        if (CALL_FIELDS.indexOf(h) >= 0) o.values[h] = cell_(r[j]);
        else if (h === '對焦問題JSON') { try { o.answers = JSON.parse(r[j] || '{}'); } catch (e) {} }
        else if (h === '更新時間') o.updated = cell_(r[j], true);
      });
      call[id] = o;
    }
  } catch (e) { /* 電訪紀錄讀不到時不影響看板 */ }

  const cases = [], missing = [], seen = {};
  for (let i = DATA_ROW - 1; i < main.length; i++) {
    const r = main[i]; const id = String(r[F.ID]).trim();
    if (!/^(CRM|ESG)-/.test(id)) continue;   // ESG- 案件也收
    if (seen[id]) continue;                     // 編號重複（如 ESG-8）只取第一筆
    seen[id] = true;
    const mine = String(r[F.HANDLER]).trim() === ME;
    if (!mine && !board[id]) continue;
    if (mine && !board[id]) missing.push([id, cell_(r[F.COMPANY]), '自動', '', '', '[]', '', '', '', now_()]);
    cases.push({
      id: id, mine: mine,
      grade: cell_(r[F.GRADE]), execMonth: cell_(r[F.EXEC_MONTH]), handler: cell_(r[F.HANDLER]),
      contactSt: cell_(r[F.CONTACT_ST]), progress: cell_(r[F.PROGRESS]), quote: cell_(r[F.QUOTE]),
      notes: cell_(r[F.NOTES]), time: cell_(r[F.TIME], true), company: cell_(r[F.COMPANY]),
      contact: cell_(r[F.CONTACT]), title: cell_(r[F.TITLE]), phone: cell_(r[F.PHONE]), email: cell_(r[F.EMAIL]),
      need: cell_(r[F.NEED]), planDate: cell_(r[F.ACT_DATE2]), actTime: cell_(r[F.ACT_TIME]),
      headcount: cell_(r[F.HEADCOUNT]), location: cell_(r[F.LOCATION]), format: cell_(r[F.FORMAT]),
      purpose: cell_(r[F.PURPOSE]), budget: cell_(r[F.BUDGET]), remarks: cell_(r[F.REMARKS]),
      deal: cell_(r[F.DEAL_AMT]), failReason: cell_(r[F.FAIL_REASON]), failDesc: cell_(r[F.FAIL_DESC]),
      track: cell_(r[F.TRACK_DATE]), updated: cell_(r[F.UPDATED], true), propAct: cell_(r[F.PROP_ACT]),
      dealAct: cell_(r[F.DEAL_ACT]), actDate: cell_(r[F.ACT_DATE]), logs: logs_(r[F.PROP_LOGS]), coTitle: cell_(r[F.CO_TITLE]), taxId: cell_(r[F.TAX_ID]), address: cell_(r[F.ADDRESS]),
      board: board[id] || { visible: '自動', column: '', next: '', checklist: [], note: '', mail: '', calId: '' },
      brief: brief[id] || null,
      call: call[id] || null
    });
  }
  if (missing.length) {
    withLock_(() => boardSh.getRange(boardSh.getLastRow() + 1, 1, missing.length, BOARD_COLS.length).setValues(missing));
  }
  return { cases: cases, sections: BRIEF_SECTIONS, status: STATUS, contact: CONTACT, fail: FAIL, me: ME, now: now_() };
}

// ── 寫入：主表（規則比照公司 App） ───────────────────────────
function mainRow_(sheet, id) {
  const row = rowOf_(sheet, F.ID, id, DATA_ROW);
  if (row < 0) throw new Error('案件不存在：' + id);
  return row;
}

/** 改現況。p: {status, failReason, failDesc, deal, execMonth, dealAct} */
function setStatus(pin, id, p) {
  auth_(pin);
  return withLock_(() => {
    const sh = sh_(MAIN); const row = mainRow_(sh, id);
    const cur = sh.getRange(row, 1, 1, 66).getValues()[0];
    const st = String(p.status || '');
    if (STATUS.indexOf(st) < 0) throw new Error('現況不合法：' + st);
    const errs = [];
    if (st === '成交') {
      if (!p.deal && !cur[F.DEAL_AMT]) errs.push('成交金額');
      if (!p.execMonth && !cur[F.EXEC_MONTH]) errs.push('執行月');
      if (!p.dealAct && !cur[F.DEAL_ACT]) errs.push('成交活動');
    }
    if (st === '不提案/合併/失案' && !p.failReason && !cur[F.FAIL_REASON]) errs.push('不成交原因');
    if (p.failReason && FAIL.indexOf(p.failReason) < 0) throw new Error('不成交原因不合法：' + p.failReason);
    if (errs.length) throw new Error('請填寫：' + errs.join('、'));
    if (p.deal && cur[F.DEAL_AMT] && String(p.deal) !== String(cur[F.DEAL_AMT])) throw new Error('成交金額已有值，業務不能覆寫，請主管修改');

    const set = (col, v) => sh.getRange(row, col + 1).setValue(v);
    set(F.PROGRESS, st);
    if (p.deal && !cur[F.DEAL_AMT]) set(F.DEAL_AMT, p.deal);
    if (p.execMonth) set(F.EXEC_MONTH, p.execMonth);
    if (p.dealAct) set(F.DEAL_ACT, p.dealAct);
    if (p.failReason) set(F.FAIL_REASON, p.failReason);
    if (p.failDesc) set(F.FAIL_DESC, p.failDesc);
    set(F.UPDATED, now_());
    return { ok: true };
  });
}

/** 改聯繫狀況／需追蹤日期／新增備註。p: {contactSt, track, newNote} */
function saveCase(pin, id, p) {
  auth_(pin);
  return withLock_(() => {
    const sh = sh_(MAIN); const row = mainRow_(sh, id);
    if (p.contactSt !== undefined && p.contactSt !== '') {
      if (CONTACT.indexOf(p.contactSt) < 0) throw new Error('聯繫狀況不合法：' + p.contactSt);
      sh.getRange(row, F.CONTACT_ST + 1).setValue(p.contactSt);
    }
    if (p.track !== undefined) sh.getRange(row, F.TRACK_DATE + 1).setValue(p.track);
    let notes = null;
    if (p.newNote && String(p.newNote).trim()) {
      const c = sh.getRange(row, F.NOTES + 1); const old = String(c.getValue() || '');
      const line = '[' + Utilities.formatDate(new Date(), TZ, 'MM/dd') + '] ' + String(p.newNote).trim();
      notes = old ? old + '\n' + line : line;
      c.setValue(notes);
    }
    sh.getRange(row, F.UPDATED + 1).setValue(now_());
    return { ok: true, notes: notes };
  });
}

function logs_(v) {
  if (!v) return [];
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

/** 新增提案紀錄（格式比照公司 App）。p: {date:'yyyy-MM-dd', content, pax, quote, direction}
 *  實際提案日＝日期最早的那一筆（第一次提案），提案活動＝日期最新的那一筆。 */
function addProposal(pin, id, p) {
  auth_(pin);
  return withLock_(() => {
    const sh = sh_(MAIN); const row = mainRow_(sh, id);
    const d = String(p.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('提案日期格式要像 2026-10-27');
    const content = String(p.content || '').trim();
    if (!content) throw new Error('請填提案內容');
    const c = sh.getRange(row, F.PROP_LOGS + 1);
    const raw = String(c.getValue() || '');
    let logs = [];
    if (raw) { try { logs = JSON.parse(raw); } catch (e) { throw new Error('提案紀錄格式無法解析，請人工確認'); } }
    if (!Array.isArray(logs)) throw new Error('提案紀錄格式無法解析，請人工確認');
    const dup = logs.some(l => l.date === d && String(l.content || '') === content);
    if (!dup) {
      logs.push({ date: d, content: content, pax: String(p.pax || ''), quote: String(p.quote || ''), tax: '', direction: String(p.direction || '') });
      c.setValue(JSON.stringify(logs));
    }
    const dated = logs.filter(l => /^\d{4}-\d{2}-\d{2}$/.test(l.date || '')).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const first = dated[0], latest = dated[dated.length - 1];
    if (first) {
      // 寫日期文字讓試算表依自己的時區轉換，避免日期往前跑一天
      sh.getRange(row, F.ACT_DATE + 1).setValue(first.date);
      sh.getRange(row, F.PROP_ACT + 1).setValue(latest.content || '');
    }
    sh.getRange(row, F.UPDATED + 1).setValue(now_());
    return { ok: true, dup: dup, logs: logs, actDate: first ? first.date : '' };
  });
}

/** 改活動日期（以文字寫入，避免被轉成日期格式） */
function setPlanDate(pin, id, v) {
  auth_(pin);
  return withLock_(() => {
    const sh = sh_(MAIN); const row = mainRow_(sh, id);
    const c = sh.getRange(row, F.ACT_DATE2 + 1);
    c.setNumberFormat('@').setValue(String(v || '').trim());
    sh.getRange(row, F.UPDATED + 1).setValue(now_());
    return { ok: true };
  });
}

// ── 寫入：看板擴充 ─────────────────────────────────────────
/** p: {visible, column, next, checklist, note, company} */
function saveBoard(pin, id, p) {
  auth_(pin);
  return withLock_(() => {
    const sh = sh_(BOARD);
    let row = rowOf_(sh, 0, id, 2);
    if (row < 0) { row = sh.getLastRow() + 1; sh.getRange(row, 1, 1, 3).setValues([[id, p.company || '', '自動']]); }
    const put = (col, v) => { if (v !== undefined) sh.getRange(row, col).setValue(v); };
    put(3, p.visible); put(4, p.column); put(5, p.next);
    if (p.checklist !== undefined) put(6, JSON.stringify(p.checklist));
    put(7, p.note);
    put(10, now_());
    return { ok: true };
  });
}

// ── 寫入：活動確認單 ───────────────────────────────────────
/** values: {欄位名: 值}, status: {欄位名: ok|todo|na} */
function saveBrief(pin, id, company, values, status) {
  auth_(pin);
  return withLock_(() => {
    const sh = sh_(BRIEF); const hm = headerMap_(sh);
    let row = rowOf_(sh, 0, id, 2);
    if (row < 0) { row = sh.getLastRow() + 1; sh.getRange(row, 1, 1, 2).setValues([[id, company || '']]); }
    const width = sh.getLastColumn();
    const cur = sh.getRange(row, 1, 1, width).getValues()[0];
    Object.keys(values || {}).forEach(k => { if (hm[k]) cur[hm[k] - 1] = values[k]; });
    const all = [].concat.apply([], BRIEF_SECTIONS.map(s => s[1]));
    let done = 0;
    all.forEach(k => {
      const st = (status || {})[k];
      const v = hm[k] ? String(cur[hm[k] - 1] || '').trim() : '';
      if (st === 'ok' || st === 'na' || (st !== 'todo' && v)) done++;
    });
    cur[hm['確認進度'] - 1] = done + '/' + all.length;
    cur[hm['欄位狀態JSON'] - 1] = JSON.stringify(status || {});
    cur[hm['更新時間'] - 1] = now_();
    // 以純文字寫入，避免日期／號碼被試算表自動轉格式
    sh.getRange(row, 1, 1, width).setNumberFormat('@').setValues([cur.map(v => v === null ? '' : String(v))]);
    return { ok: true, progress: done + '/' + all.length };
  });
}


// ── 寫入：電訪紀錄（獨立試算表，不碰公司案件表） ──────────────
/** values: {欄位名: 值}, answers: {題號: {ck:bool, note:''}} */
function saveCall(pin, id, company, values, answers) {
  auth_(pin);
  return withLock_(() => {
    const sh = callSh_(); const hm = headerMap_(sh);
    let row = rowOf_(sh, 0, id, 2);
    if (row < 0) row = sh.getLastRow() + 1;
    const width = sh.getLastColumn();
    const cur = row <= sh.getLastRow() ? sh.getRange(row, 1, 1, width).getValues()[0] : new Array(width).fill('');
    cur[0] = id; if (hm['公司名稱']) cur[hm['公司名稱'] - 1] = company || '';
    CALL_FIELDS.forEach(k => { if (hm[k] && values && values[k] !== undefined) cur[hm[k] - 1] = String(values[k] || '').trim(); });
    const done = CALL_REQ.filter(k => hm[k] && String(cur[hm[k] - 1] || '').trim()).length;
    cur[hm['對焦問題JSON'] - 1] = JSON.stringify(answers || {});
    cur[hm['必填完成'] - 1] = done + '/' + CALL_REQ.length;
    cur[hm['更新時間'] - 1] = now_();
    sh.getRange(row, 1, 1, width).setNumberFormat('@').setValues([cur.map(v => v === null ? '' : String(v))]);
    return { ok: true, done: done, total: CALL_REQ.length, updated: cur[hm['更新時間'] - 1] };
  });
}

// ── 行事曆同步（第 3 階段） ─────────────────────────────────
function cal_(key) {
  const c = CalendarApp.getCalendarById(CAL[key]);
  if (!c) throw new Error('klarabc091 看不到行事曆 ' + CAL[key] + '，請行事曆擁有者分享「變更活動」權限給 klarabc091');
  return c;
}
function normCo_(s) {
  return String(s || '').replace(/股份有限公司|有限公司|公司|台灣|臺灣|\s/g, '').toLowerCase();
}
function evInfo_(key, ev) {
  return { cal: key, calId: CAL[key], id: ev.getId(), title: ev.getTitle(),
    start: Utilities.formatDate(ev.getStartTime(), TZ, 'yyyy-MM-dd HH:mm'),
    end: Utilities.formatDate(ev.getEndTime(), TZ, 'HH:mm'), description: ev.getDescription() || '',
    location: ev.getLocation() || '' };
}
function findLinked_(link) {
  if (!link) return null;
  const i = link.indexOf(':'); if (i < 0) return null;
  const key = link.slice(0, i), evId = link.slice(i + 1);
  if (!CAL[key]) return null;
  const ev = cal_(key).getEventById(evId);
  return ev ? { key: key, ev: ev } : null;
}
function times_(p) {
  const d = String(p.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('請先在確認單填「活動日期」（格式 2026-10-25）');
  const mk = (hm) => { const a = String(hm).split(':'); return new Date(d + 'T' + ('0' + a[0]).slice(-2) + ':' + ('0' + (a[1] || '0')).slice(-2) + ':00+08:00'); };
  const r = { start: mk(p.start || '09:00'), end: mk(p.end || '17:00') };
  if (r.end <= r.start) r.end = new Date(r.start.getTime() + 3 * 3600e3);
  return r;
}

/** 預覽：找出已連結或同日同公司的行程。p: {date, company, link} */
function calPreview(pin, id, p) {
  auth_(pin);
  const linked = findLinked_(p.link);
  if (linked) return { linked: evInfo_(linked.key, linked.ev), candidates: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ''))) throw new Error('請先在確認單填「活動日期」（格式 2026-10-25）');
  const day0 = new Date(p.date + 'T00:00:00+08:00'), day1 = new Date(day0.getTime() + 864e5);
  const want = normCo_(p.company), out = [];
  Object.keys(CAL).forEach(key => {
    cal_(key).getEvents(day0, day1).forEach(ev => {
      const t = normCo_(ev.getTitle());
      if (want && (t.indexOf(want) >= 0 || (want.length >= 2 && t.indexOf(want.slice(0, 2)) >= 0))) out.push(evInfo_(key, ev));
    });
  });
  return { linked: null, candidates: out };
}

/**
 * 寫入行事曆。p: {date,start,end,title,location,description,confirmed,company,
 *   target: 'new' | '<cal>:<eventId>', keepDesc: bool}
 */
function calSync(pin, id, p) {
  auth_(pin);
  return withLock_(() => {
    const t = times_(p);
    const wantKey = p.confirmed ? 'confirmed' : 'tentative';
    const prefix = p.confirmed ? '【確定】' : '【暫定】';
    const title = prefix + String(p.title || '').replace(/^【(暫定|確定)】/, '');
    let ev = null, key = null, note = '';
    if (p.target && p.target !== 'new') { const f = findLinked_(p.target); if (f) { ev = f.ev; key = f.key; } }

    if (ev && key !== wantKey) {
      // 暫定 → 確定：在確定行事曆建新行程，舊的暫定行程標註不刪除
      const desc = p.keepDesc ? ev.getDescription() : p.description;
      const old = ev;
      ev = cal_(wantKey).createEvent(title, t.start, t.end, { description: desc || '', location: p.location || '' });
      try { old.setTitle('【已轉確定】' + old.getTitle().replace(/^【(暫定|確定|已轉確定)】/, '')); } catch (e) {}
      key = wantKey; note = '已在確定行事曆建立新行程，暫定行事曆的舊行程標題改為【已轉確定】（未刪除）';
    } else if (ev) {
      ev.setTitle(title); ev.setTime(t.start, t.end);
      if (p.location) ev.setLocation(p.location);
      if (!p.keepDesc) ev.setDescription(p.description || '');
      note = p.keepDesc ? '已更新標題／時間，保留行事曆原本的說明' : '已更新行程與說明';
    } else {
      ev = cal_(wantKey).createEvent(title, t.start, t.end, { description: p.description || '', location: p.location || '' });
      key = wantKey; note = '已建立新行程';
    }
    try { ev.setColor(p.confirmed ? '6' : '8'); } catch (e) {}
    const link = key + ':' + ev.getId();
    const sh = sh_(BOARD); let row = rowOf_(sh, 0, id, 2);
    if (row < 0) { row = sh.getLastRow() + 1; sh.getRange(row, 1, 1, 3).setValues([[id, p.company || '', '自動']]); }
    sh.getRange(row, 9).setValue(link); sh.getRange(row, 10).setValue(now_());
    return { ok: true, link: link, note: note, calendar: CAL[key] };
  });
}
