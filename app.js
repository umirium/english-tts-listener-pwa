const textEl = document.getElementById('text');
const voiceSelectEl = document.getElementById('voiceSelect');
const rateRangeEl = document.getElementById('rateRange');
const rateValueEl = document.getElementById('rateValue');
const togglePlayBtn = document.getElementById('togglePlayBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const savedListEl = document.getElementById('savedList');
const emptyStateEl = document.getElementById('emptyState');
const editorWrapEl = document.getElementById('editorWrap');
const readingWrapEl = document.getElementById('readingWrap');
const sentenceListEl = document.getElementById('sentenceList');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
const bottomSettingsEl = document.getElementById('bottomSettings');
const repeatToggleBtn = document.getElementById('repeatToggleBtn');
const autoplayToggleBtn = document.getElementById('autoplayToggleBtn');

let currentRecordId = null;
let playbackState = 'idle';
let sentenceQueue = [];
let currentSentenceIndex = 0;
const STORAGE_REPEAT_SENTENCE_KEY = 'tts_listener_repeat_sentence';
const STORAGE_AUTOPLAY_KEY = 'tts_listener_autoplay';
let stopReason = null; // null | 'jump' | 'stop'
let pendingJumpIndex = null;
let pausedAtSentenceEnd = false;
let pausedSentenceNeedsReplay = false;
let manualPauseActive = false;

function ensureDefaultSettings() {
  if (localStorage.getItem(STORAGE_REPEAT_SENTENCE_KEY) === null) {
    localStorage.setItem(STORAGE_REPEAT_SENTENCE_KEY, '0');
  }
  if (localStorage.getItem(STORAGE_AUTOPLAY_KEY) === null) {
    localStorage.setItem(STORAGE_AUTOPLAY_KEY, '1');
  }
}


function splitSentences(text) {
  return text.replace(/\r\n/g, '\n').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}
function setStatus(mode, message = null) {
  if (message) statusText.textContent = message;
  else if (mode === 'playing') statusText.textContent = '再生中';
  else if (mode === 'paused') statusText.textContent = '一時停止中';
  else statusText.textContent = '待機中';
  if (mode === 'playing') statusDot.classList.add('running');
  else statusDot.classList.remove('running');
}
function showEditorMode() { editorWrapEl.style.display = 'block'; readingWrapEl.style.display = 'none'; }
function showReadingMode() { editorWrapEl.style.display = 'none'; readingWrapEl.style.display = 'block'; }
function renderSentenceList(activeIndex = -1) {
  sentenceListEl.innerHTML = '';
  sentenceQueue.forEach((sentence, index) => {
    const item = document.createElement('div');
    item.className = 'sentence-item' + (index === activeIndex ? ' active' : '');
    const idx = document.createElement('span');
    idx.className = 'sentence-index';
    idx.textContent = `Sentence ${index + 1}`;
    const text = document.createElement('div');
    text.textContent = sentence;
    item.appendChild(idx);
    item.appendChild(text);
    sentenceListEl.appendChild(item);
  });
  const active = sentenceListEl.querySelector('.sentence-item.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function updateControlLock() {
  const locked = playbackState === 'playing' || playbackState === 'paused';
  voiceSelectEl.disabled = locked;
  rateRangeEl.disabled = locked;
  prevBtn.disabled = !sentenceQueue.length || currentSentenceIndex <= 0;
  nextBtn.disabled = !sentenceQueue.length || currentSentenceIndex >= sentenceQueue.length - 1;
}
function updateToggleButton() {
  let label = '再生';
  if (playbackState === 'paused') label = '再開';
  else if (playbackState === 'playing') label = '一時停止';
  togglePlayBtn.textContent = label;
  updateControlLock();
}
function updateRepeatButton() {
  const enabled = localStorage.getItem(STORAGE_REPEAT_SENTENCE_KEY) === '1';
  repeatToggleBtn.classList.toggle('active', enabled);
  repeatToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  repeatToggleBtn.textContent = '🔁';
}
function isRepeatEnabled() {
  return localStorage.getItem(STORAGE_REPEAT_SENTENCE_KEY) === '1';
}
function updateAutoplayButton() {
  const enabled = localStorage.getItem(STORAGE_AUTOPLAY_KEY) !== '0';
  autoplayToggleBtn.classList.toggle('active', enabled);
  autoplayToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  autoplayToggleBtn.textContent = '⏭️';
}
function isAutoplayEnabled() {
  return localStorage.getItem(STORAGE_AUTOPLAY_KEY) !== '0';
}
function continueFromSentenceEndPause() {
  if (pausedSentenceNeedsReplay || isRepeatEnabled()) {
    playbackState = 'playing';
    pausedAtSentenceEnd = false;
    pausedSentenceNeedsReplay = false;
    renderSentenceList(currentSentenceIndex);
    showReadingMode();
    updateToggleButton();
    startCurrentSentencePlayback();
    return;
  }
  if (currentSentenceIndex + 1 >= sentenceQueue.length) {
    finishPlayback('再生完了');
    return;
  }
  currentSentenceIndex += 1;
  playbackState = 'playing';
  pausedAtSentenceEnd = false;
  pausedSentenceNeedsReplay = false;
  renderSentenceList(currentSentenceIndex);
  showReadingMode();
  updateToggleButton();
  startCurrentSentencePlayback();
}
function updateRateLabel() {
  const value = Number(rateRangeEl.value).toFixed(1);
  rateValueEl.textContent = `${value}x`;
  saveRate(value);
}
function createPreview(text, max = 120) {
  const normalized = normalizeText(text);
  return normalized.length > max ? normalized.slice(0, max) + '…' : normalized;
}
function formatDate(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${hh}:${mm}`;
}
function populateVoices() {
  const savedVoice = getSavedVoice();
  const voices = speechController.getEnglishVoices().length ? speechController.getEnglishVoices() : speechController.getVoices();
  voiceSelectEl.innerHTML = '';
  voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelectEl.appendChild(option);
  });
  if (!voiceSelectEl.options.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '利用可能な音声が見つかりません';
    voiceSelectEl.appendChild(option);
    voiceSelectEl.disabled = true;
    return;
  }
  voiceSelectEl.disabled = false;
  if (savedVoice && [...voiceSelectEl.options].some(o => o.value === savedVoice)) voiceSelectEl.value = savedVoice;
  else {
    const preferredVoices = ['Samantha', 'Daniel', 'Karen', 'Moira'];
    const found = preferredVoices.find(name => [...voiceSelectEl.options].some(o => o.value === name));
    if (found) voiceSelectEl.value = found;
    else voiceSelectEl.selectedIndex = 0;
    saveVoice(voiceSelectEl.value);
  }
}
function renderSavedList() {
  const records = getRecords();
  savedListEl.innerHTML = '';
  if (!records.length) {
    emptyStateEl.style.display = 'block';
    return;
  }
  emptyStateEl.style.display = 'none';
  records.forEach(record => {
    const item = document.createElement('div');
    item.className = 'saved-item';
    const top = document.createElement('div');
    top.className = 'saved-top';
    const preview = document.createElement('div');
    preview.className = 'saved-preview';
    preview.textContent = createPreview(record.text);
    const date = document.createElement('div');
    date.className = 'saved-date';
    date.textContent = formatDate(record.updatedAt || record.createdAt);
    top.appendChild(preview);
    top.appendChild(date);

    const meta = document.createElement('div');
    meta.className = 'saved-meta';
    const metaItems = [
      ['再生回数', String(record.playCount || 0)],
      ['前回速度', record.lastRate ? `${Number(record.lastRate).toFixed(1)}x` : '-'],
      ['前回音声', record.lastVoiceName || '-']
    ];
    for (const [k, v] of metaItems) {
      const box = document.createElement('div');
      box.className = 'meta-box';
      box.innerHTML = `<div class="mk">${k}</div><div class="mv">${v}</div>`;
      meta.appendChild(box);
    }

    const actions = document.createElement('div');
    actions.className = 'saved-actions';
    const loadBtn = document.createElement('button');
    loadBtn.textContent = '読み込む';
    loadBtn.addEventListener('click', () => {
      textEl.value = record.text;
      currentRecordId = record.id;
      saveCurrentText(record.text);
      sentenceQueue = splitSentences(record.text);
      showEditorMode();
      setStatus('idle', '保存済みテキストを読み込みました');
      updateToggleButton();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '削除';
    deleteBtn.className = 'danger';
    deleteBtn.addEventListener('click', () => {
      deleteRecordById(record.id);
      if (currentRecordId === record.id) currentRecordId = null;
      renderSavedList();
      setStatus('idle', 'テキストを削除しました');
    });
    actions.appendChild(loadBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(top);
    item.appendChild(meta);
    item.appendChild(actions);
    savedListEl.appendChild(item);
  });
}
function saveCurrentTextManually() {
  const rawText = textEl.value;
  if (!normalizeText(rawText)) {
    alert('先に英字テキストを貼り付けてください。');
    return;
  }
  const existing = findRecordByText(rawText);
  if (existing) {
    currentRecordId = existing.id;
    setStatus('idle', 'このテキストはすでに保存済みです');
    renderSavedList();
    return;
  }
  const record = createRecord(rawText, { lastRate: Number(rateRangeEl.value), lastVoiceName: voiceSelectEl.value });
  currentRecordId = record.id;
  renderSavedList();
  setStatus('idle', 'テキストを保存しました');
}
function ensureCurrentRecord() {
  const result = ensureRecordForText(textEl.value, { lastRate: Number(rateRangeEl.value), lastVoiceName: voiceSelectEl.value });
  if (!result || !result.record) return null;
  currentRecordId = result.record.id;
  return result;
}
function finishPlayback(message) {
  playbackState = 'idle';
  sentenceQueue = [];
  currentSentenceIndex = 0;
  stopReason = null;
  pendingJumpIndex = null;
  pausedAtSentenceEnd = false;
  pausedSentenceNeedsReplay = false;
  manualPauseActive = false;
  showEditorMode();
  setStatus('idle', message);
  updateToggleButton();
  updateRepeatButton();
}
function startCurrentSentencePlayback() {
  renderSentenceList(currentSentenceIndex);
  showReadingMode();
  updateToggleButton();
  speechController.speak({
    text: sentenceQueue[currentSentenceIndex],
    rate: Number(rateRangeEl.value),
    voiceName: voiceSelectEl.value,
    onStart: (voice) => {
      playbackState = 'playing';
      manualPauseActive = false;
      pausedAtSentenceEnd = false;
      pausedSentenceNeedsReplay = false;
      setStatus('playing', voice ? `${voice.name} で再生中` : '再生中');
      if (voice) saveVoice(voice.name);
      updateToggleButton();
    },
    onEnd: () => {
      if (stopReason === 'jump') return;
      if (stopReason === 'stop') return;
      if (playbackState === 'paused') return;
      if (playbackState !== 'playing') return;
      if (!isAutoplayEnabled()) {
        playbackState = 'paused';
        manualPauseActive = false;
        pausedAtSentenceEnd = true;
        pausedSentenceNeedsReplay = false;
        setStatus('paused', '文末で停止中');
        updateToggleButton();
        return;
      }
      if (isRepeatEnabled()) {
        startCurrentSentencePlayback();
        return;
      }
      if (currentSentenceIndex + 1 >= sentenceQueue.length) {
        finishPlayback('再生完了');
        return;
      }
      currentSentenceIndex += 1;
      startCurrentSentencePlayback();
    },
    onError: () => {
      if (stopReason === 'jump') {
        stopReason = null;
        const target = pendingJumpIndex;
        pendingJumpIndex = null;
        if (typeof target === 'number') {
          currentSentenceIndex = target;
          playbackState = 'playing';
          manualPauseActive = false;
          renderSentenceList(currentSentenceIndex);
          showReadingMode();
          updateToggleButton();
          setTimeout(() => startCurrentSentencePlayback(), 0);
        }
        return;
      }
      if (stopReason === 'stop') {
        stopReason = null;
        pendingJumpIndex = null;
        playbackState = 'idle';
        showEditorMode();
        updateToggleButton();
        return;
      }
      finishPlayback('再生エラー');
    }
  });
}
function jumpToSentence(nextIndex) {
  if (!sentenceQueue.length) return;
  nextIndex = Math.max(0, Math.min(sentenceQueue.length - 1, nextIndex));

  if (playbackState === 'paused') {
    currentSentenceIndex = nextIndex;
    renderSentenceList(currentSentenceIndex);
    showReadingMode();
    if (manualPauseActive) {
      pausedAtSentenceEnd = false;
      pausedSentenceNeedsReplay = true;
      setStatus('paused', '一時停止中');
    } else {
      pausedAtSentenceEnd = true;
      pausedSentenceNeedsReplay = true;
      setStatus('paused', '文末で停止中');
    }
    updateToggleButton();
    return;
  }

  pendingJumpIndex = nextIndex;
  stopReason = 'jump';
  playbackState = 'playing';
  speechController.stop();
}
function startPlayback() {
  const text = textEl.value.trim();
  if (!text) {
    alert('先に英字テキストを貼り付けてください。');
    return;
  }
  const ensured = ensureCurrentRecord();
  renderSavedList();
  sentenceQueue = splitSentences(text);
  if (!sentenceQueue.length) {
    alert('再生できる文がありません。');
    return;
  }
  playbackState = 'playing';
  stopReason = null;
  pendingJumpIndex = null;
  currentSentenceIndex = 0;
  renderSentenceList(currentSentenceIndex);
  showReadingMode();
  updateToggleButton();
  if (currentRecordId) {
    touchRecord(currentRecordId, { incrementPlayCount: 1, lastRate: Number(rateRangeEl.value), lastVoiceName: voiceSelectEl.value });
    renderSavedList();
  }
  startCurrentSentencePlayback();
  if (ensured && ensured.isNew) setStatus('playing', '新規テキストを保存して再生中');
}

textEl.addEventListener('input', () => {
  saveCurrentText(textEl.value);
  currentRecordId = null;
});
rateRangeEl.addEventListener('input', updateRateLabel);
voiceSelectEl.addEventListener('change', () => saveVoice(voiceSelectEl.value));
repeatToggleBtn.addEventListener('click', () => {
  const next = !isRepeatEnabled();
  localStorage.setItem(STORAGE_REPEAT_SENTENCE_KEY, next ? '1' : '0');
  updateRepeatButton();
});
autoplayToggleBtn.addEventListener('click', () => {
  const next = !isAutoplayEnabled();
  localStorage.setItem(STORAGE_AUTOPLAY_KEY, next ? '1' : '0');
  updateAutoplayButton();
});
saveBtn.addEventListener('click', saveCurrentTextManually);

togglePlayBtn.addEventListener('click', () => {
  if (playbackState === 'paused') {
    if (pausedAtSentenceEnd) {
      continueFromSentenceEndPause();
    } else if (manualPauseActive) {
      if (pausedSentenceNeedsReplay) {
        pendingJumpIndex = currentSentenceIndex;
        stopReason = 'jump';
        playbackState = 'playing';
        speechController.stop();
      } else {
        speechController.resume();
        playbackState = 'playing';
        setStatus('playing', '再生再開');
        updateToggleButton();
      }
    } else {
      speechController.resume();
      playbackState = 'playing';
      setStatus('playing', '再生再開');
      updateToggleButton();
    }
    return;
  }
  if (playbackState === 'playing') {
    speechController.pause();
    playbackState = 'paused';
    manualPauseActive = true;
    pausedAtSentenceEnd = false;
    pausedSentenceNeedsReplay = false;
    setStatus('paused', '一時停止中');
    updateToggleButton();
    return;
  }
  startPlayback();
});
stopBtn.addEventListener('click', () => {
  if (playbackState === 'idle') {
    setStatus('idle', '停止しました');
    updateToggleButton();
    return;
  }
  stopReason = 'stop';
  pendingJumpIndex = null;
  pausedAtSentenceEnd = false;
  pausedSentenceNeedsReplay = false;
  manualPauseActive = false;
  playbackState = 'idle';
  speechController.stop();
  sentenceQueue = [];
  currentSentenceIndex = 0;
  showEditorMode();
  setStatus('idle', '停止しました');
  updateToggleButton();
  updateRepeatButton();
});
prevBtn.addEventListener('click', () => {
  if (currentSentenceIndex > 0) jumpToSentence(currentSentenceIndex - 1);
});
nextBtn.addEventListener('click', () => {
  if (currentSentenceIndex < sentenceQueue.length - 1) jumpToSentence(currentSentenceIndex + 1);
});
toggleSettingsBtn.addEventListener('click', () => {
  const show = !bottomSettingsEl.classList.contains('show');
  bottomSettingsEl.classList.toggle('show', show);
  toggleSettingsBtn.classList.toggle('active', show);
  toggleSettingsBtn.textContent = '⚙️';
});

function loadSaved() {
  ensureDefaultSettings();
  textEl.value = getCurrentText();
  rateRangeEl.value = getSavedRate();
  updateRepeatButton();
  updateAutoplayButton();
  updateRateLabel();
  renderSavedList();
  playbackState = 'idle';
  sentenceQueue = [];
  currentSentenceIndex = 0;
  stopReason = null;
  pendingJumpIndex = null;
  pausedAtSentenceEnd = false;
  pausedSentenceNeedsReplay = false;
  manualPauseActive = false;
  showEditorMode();
  setStatus('idle');
  updateToggleButton();
}
loadSaved();
populateVoices();
speechController.waitForVoices(() => populateVoices());
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}