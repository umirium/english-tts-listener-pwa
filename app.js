const textEl = document.getElementById('text');
const voiceSelectEl = document.getElementById('voiceSelect');
const rateRangeEl = document.getElementById('rateRange');
const rateValueEl = document.getElementById('rateValue');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const savedListEl = document.getElementById('savedList');
const emptyStateEl = document.getElementById('emptyState');
let currentRecordId = null;

function setStatus(mode, message = null) {
  if (message) statusText.textContent = message;
  else if (mode === 'playing') statusText.textContent = '再生中';
  else if (mode === 'paused') statusText.textContent = '一時停止中';
  else statusText.textContent = '待機中';
  if (mode === 'playing') statusDot.classList.add('running'); else statusDot.classList.remove('running');
}
function updateRateLabel() { rateValueEl.textContent = `${Number(rateRangeEl.value).toFixed(1)}x`; saveRate(rateRangeEl.value); }
function createPreview(text, max = 120) { const normalized = normalizeText(text); return normalized.length > max ? normalized.slice(0, max) + '…' : normalized; }
function formatDate(timestamp) { const d = new Date(timestamp); return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function populateVoices() {
  const savedVoice = getSavedVoice();
  const voices = speechController.getEnglishVoices().length ? speechController.getEnglishVoices() : speechController.getVoices();
  voiceSelectEl.innerHTML = '';
  voices.forEach(voice => { const option = document.createElement('option'); option.value = voice.name; option.textContent = `${voice.name} (${voice.lang})`; voiceSelectEl.appendChild(option); });
  if (!voiceSelectEl.options.length) { const option = document.createElement('option'); option.value=''; option.textContent='利用可能な音声が見つかりません'; voiceSelectEl.appendChild(option); voiceSelectEl.disabled = true; return; }
  voiceSelectEl.disabled = false;
  if (savedVoice && [...voiceSelectEl.options].some(o => o.value === savedVoice)) voiceSelectEl.value = savedVoice; else { voiceSelectEl.selectedIndex = 0; saveVoice(voiceSelectEl.value); }
}
function renderSavedList() {
  const records = getRecords(); savedListEl.innerHTML = '';
  if (!records.length) { emptyStateEl.style.display = 'block'; return; }
  emptyStateEl.style.display = 'none';
  records.forEach(record => {
    const item = document.createElement('div'); item.className = 'saved-item';
    const top = document.createElement('div'); top.className = 'saved-top';
    const preview = document.createElement('div'); preview.className = 'saved-preview'; preview.textContent = createPreview(record.text);
    const date = document.createElement('div'); date.className = 'saved-date'; date.textContent = formatDate(record.updatedAt || record.createdAt);
    top.appendChild(preview); top.appendChild(date);
    const meta = document.createElement('div'); meta.className = 'saved-meta';
    const metaItems = [['再生回数', String(record.playCount || 0)], ['前回速度', record.lastRate ? `${Number(record.lastRate).toFixed(1)}x` : '-'], ['前回音声', record.lastVoiceName || '-']];
    for (const [k, v] of metaItems) { const box = document.createElement('div'); box.className = 'meta-box'; box.innerHTML = `<div class="mk">${k}</div><div class="mv">${v}</div>`; meta.appendChild(box); }
    const actions = document.createElement('div'); actions.className = 'saved-actions';
    const loadBtn = document.createElement('button'); loadBtn.textContent = '読み込む'; loadBtn.addEventListener('click', () => { textEl.value = record.text; currentRecordId = record.id; saveCurrentText(record.text); setStatus('idle', '保存済みテキストを読み込みました'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const deleteBtn = document.createElement('button'); deleteBtn.textContent = '削除'; deleteBtn.className = 'danger'; deleteBtn.addEventListener('click', () => { deleteRecordById(record.id); if (currentRecordId === record.id) currentRecordId = null; renderSavedList(); setStatus('idle', 'テキストを削除しました'); });
    actions.appendChild(loadBtn); actions.appendChild(deleteBtn);
    item.appendChild(top); item.appendChild(meta); item.appendChild(actions); savedListEl.appendChild(item);
  });
}
function saveCurrentTextManually() {
  const rawText = textEl.value; if (!normalizeText(rawText)) { alert('先に英字テキストを貼り付けてください。'); return; }
  const existing = findRecordByText(rawText); if (existing) { currentRecordId = existing.id; setStatus('idle', 'このテキストはすでに保存済みです'); renderSavedList(); return; }
  const record = createRecord(rawText, { lastRate: Number(rateRangeEl.value), lastVoiceName: voiceSelectEl.value });
  currentRecordId = record.id; renderSavedList(); setStatus('idle', 'テキストを保存しました');
}
function ensureCurrentRecord() { const result = ensureRecordForText(textEl.value, { lastRate: Number(rateRangeEl.value), lastVoiceName: voiceSelectEl.value }); if (!result || !result.record) return null; currentRecordId = result.record.id; return result; }
textEl.addEventListener('input', () => { saveCurrentText(textEl.value); currentRecordId = null; });
rateRangeEl.addEventListener('input', updateRateLabel);
voiceSelectEl.addEventListener('change', () => { saveVoice(voiceSelectEl.value); });
saveBtn.addEventListener('click', saveCurrentTextManually);
playBtn.addEventListener('click', () => {
  const text = textEl.value.trim(); if (!text) { alert('先に英字テキストを貼り付けてください。'); return; }
  const ensured = ensureCurrentRecord(); renderSavedList();
  speechController.speak({
    text, rate: Number(rateRangeEl.value), voiceName: voiceSelectEl.value,
    onStart: (voice) => { setStatus('playing', voice ? `${voice.name} で再生中` : '再生中'); if (voice) saveVoice(voice.name); if (currentRecordId) { touchRecord(currentRecordId, { incrementPlayCount: 1, lastRate: Number(rateRangeEl.value), lastVoiceName: voice ? voice.name : voiceSelectEl.value }); renderSavedList(); } },
    onEnd: () => { setStatus('idle', '再生完了'); },
    onError: () => { setStatus('idle', '再生エラー'); }
  });
  if (ensured && ensured.isNew) setStatus('playing', '新規テキストを保存して再生中');
});
pauseBtn.addEventListener('click', () => { speechController.pause(); setStatus('paused', '一時停止中'); });
resumeBtn.addEventListener('click', () => { speechController.resume(); setStatus('playing', '再生再開'); });
stopBtn.addEventListener('click', () => { speechController.stop(); setStatus('idle', '停止しました'); });
function loadSaved() { textEl.value = getCurrentText(); rateRangeEl.value = getSavedRate(); updateRateLabel(); renderSavedList(); setStatus('idle'); }
loadSaved(); speechController.waitForVoices(() => { populateVoices(); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});