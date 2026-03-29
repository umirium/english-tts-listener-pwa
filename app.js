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
const settingsOverlayEl = document.getElementById('settingsOverlay');
const randomToggleBtn = document.getElementById('randomToggleBtn');
const repeatToggleBtn = document.getElementById('repeatToggleBtn');
const autoplayToggleBtn = document.getElementById('autoplayToggleBtn');
const playbackUnitToggleBtn = document.getElementById('playbackUnitToggleBtn');

let currentRecordId = null;
let playbackState = 'idle';
let sentenceQueue = [];
let currentSentenceIndex = 0;
const STORAGE_RANDOM_KEY = 'tts_listener_random';
const STORAGE_REPEAT_MODE_KEY = 'tts_listener_repeat_mode';
const STORAGE_AUTOPLAY_KEY = 'tts_listener_autoplay';
const STORAGE_PLAYBACK_UNIT_KEY = 'tts_listener_playback_unit';
let stopReason = null; // null | 'jump' | 'stop'
let pendingJumpIndex = null;
let pausedAtSentenceEnd = false;
let pausedSentenceNeedsReplay = false;
let manualPauseActive = false;
let randomPool = [];
let selectedSentenceIndex = -1;
let pausedSettingsChanged = false;
let pausedUtteranceCleared = false;
let playHistory = [];
let historyIndex = -1;
let speechGeneration = 0;

function ensureDefaultSettings() {
  if (localStorage.getItem(STORAGE_RANDOM_KEY) === null) {
    localStorage.setItem(STORAGE_RANDOM_KEY, '0');
  }
  if (localStorage.getItem(STORAGE_REPEAT_MODE_KEY) === null) {
    localStorage.setItem(STORAGE_REPEAT_MODE_KEY, 'off');
  }
  if (localStorage.getItem(STORAGE_AUTOPLAY_KEY) === null) {
    localStorage.setItem(STORAGE_AUTOPLAY_KEY, '1');
  }
  if (localStorage.getItem(STORAGE_PLAYBACK_UNIT_KEY) === null) {
    localStorage.setItem(STORAGE_PLAYBACK_UNIT_KEY, 'sentence');
  }
}


function splitSentences(text) {
  return text.replace(/\r\n/g, '\n').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}
function getPlaybackUnit() {
  return localStorage.getItem(STORAGE_PLAYBACK_UNIT_KEY) === 'full' ? 'full' : 'sentence';
}
function isFullPlaybackEnabled() {
  return getPlaybackUnit() === 'full';
}
function splitPlaybackUnits(text) {
  if (isFullPlaybackEnabled()) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized ? [normalized] : [];
  }
  return splitSentences(text);
}
function setStatus(mode, message = null) {
  if (message) statusText.textContent = message;
  else if (mode === 'playing') statusText.textContent = '再生中';
  else if (mode === 'paused') statusText.textContent = '一時停止中';
  else statusText.textContent = '待機中';
  if (mode === 'playing') statusDot.classList.add('running');
  else statusDot.classList.remove('running');
}
function showEditorMode() {
  editorWrapEl.style.display = 'block';
  readingWrapEl.style.display = 'none';
  // iOS Safari sometimes fails to render textarea content after a display change.
  // Re-assigning the value forces a repaint.
  const v = textEl.value;
  if (v) requestAnimationFrame(() => { textEl.value = v; });
}
function showReadingMode() { editorWrapEl.style.display = 'none'; readingWrapEl.style.display = 'block'; }
function openSettingsPanel() {
  bottomSettingsEl.classList.add('show');
  if (settingsOverlayEl) settingsOverlayEl.classList.add('show');
  toggleSettingsBtn.classList.add('active');
  toggleSettingsBtn.textContent = '⚙️';
}
function closeSettingsPanel() {
  bottomSettingsEl.classList.remove('show');
  if (settingsOverlayEl) settingsOverlayEl.classList.remove('show');
  toggleSettingsBtn.classList.remove('active');
  toggleSettingsBtn.textContent = '⚙️';
}

function scrollSelectedSentenceIntoView() {
  const target =
    sentenceListEl.querySelector('.sentence-item.active') ||
    sentenceListEl.querySelector('.sentence-item.selected');
  if (!target) return;

  const container = readingWrapEl;
  const bottomControls = document.querySelector('.bottom-controls');
  const controlsHeight = bottomControls ? bottomControls.offsetHeight : 0;

  // Effective visible area inside the reading pane, leaving extra room for the fixed controls.
  const topMargin = 56;
  const bottomMargin = Math.max(controlsHeight * 0.55, 96);

  const visibleTop = container.scrollTop + topMargin;
  const visibleBottom = container.scrollTop + container.clientHeight - bottomMargin;

  const itemTop = target.offsetTop;
  const itemBottom = itemTop + target.offsetHeight;

  let nextTop = null;

  if (itemTop < visibleTop) {
    nextTop = Math.max(0, itemTop - topMargin);
  } else if (itemBottom > visibleBottom) {
    nextTop = Math.max(
      0,
      itemBottom - container.clientHeight + bottomMargin
    );
  }

  if (nextTop !== null) {
    container.scrollTo({
      top: nextTop,
      behavior: 'smooth'
    });
  }
}

function renderSentenceList(activeIndex = -1) {
  sentenceListEl.innerHTML = '';
  sentenceQueue.forEach((sentence, index) => {
    const item = document.createElement('div');
    const isActive = index === activeIndex;
    const isSelected = index === selectedSentenceIndex;
    item.className = 'sentence-item' + (isActive ? ' active' : '') + (isSelected ? ' selected' : '');
    item.dataset.index = String(index);

    const idx = document.createElement('span');
    idx.className = 'sentence-index';
    idx.textContent = isFullPlaybackEnabled() ? '全文' : `Sentence ${index + 1}`;

    const text = document.createElement('div');
    text.textContent = sentence;

    item.appendChild(idx);
    item.appendChild(text);
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectSentenceByTap(index);
    });

    sentenceListEl.appendChild(item);
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollSelectedSentenceIntoView();
    });
  });
}
function updateControlLock() {
  const locked = playbackState === 'playing';
  voiceSelectEl.disabled = locked;
  rateRangeEl.disabled = locked;

  if (isRandomEnabled()) {
    prevBtn.disabled = !sentenceQueue.length || !canGoPrevHistory();
    nextBtn.disabled = !sentenceQueue.length || (!isRepeatAllEnabled() && randomPool.length === 0 && !canGoNextHistory());
  } else {
    prevBtn.disabled = !sentenceQueue.length || currentSentenceIndex <= 0;
    nextBtn.disabled = !sentenceQueue.length || currentSentenceIndex >= sentenceQueue.length - 1;
  }
}
function updateToggleButton() {
  let label = '再生';
  if (playbackState === 'paused') label = '再開';
  else if (playbackState === 'playing') label = '一時停止';
  togglePlayBtn.textContent = label;
  updateControlLock();
}
function getRepeatMode() {
  return localStorage.getItem(STORAGE_REPEAT_MODE_KEY) || 'off';
}
function setRepeatMode(mode) {
  localStorage.setItem(STORAGE_REPEAT_MODE_KEY, mode);
}
function updateRepeatButton() {
  const mode = getRepeatMode();
  repeatToggleBtn.classList.toggle('active', mode !== 'off');
  repeatToggleBtn.setAttribute('aria-pressed', mode !== 'off' ? 'true' : 'false');
  repeatToggleBtn.textContent = mode === 'one' ? '🔁1' : '🔁';
}
function isRepeatAllEnabled() {
  return getRepeatMode() === 'all';
}
function isRepeatOneEnabled() {
  return getRepeatMode() === 'one';
}
function updateAutoplayButton() {
  const enabled = localStorage.getItem(STORAGE_AUTOPLAY_KEY) !== '0';
  autoplayToggleBtn.classList.toggle('active', enabled);
  autoplayToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  autoplayToggleBtn.textContent = '⏭️';
}
function updatePlaybackUnitButton() {
  const full = isFullPlaybackEnabled();
  playbackUnitToggleBtn.classList.toggle('active', full);
  playbackUnitToggleBtn.setAttribute('aria-pressed', full ? 'true' : 'false');
  playbackUnitToggleBtn.textContent = full ? '全文' : '文';
}
function isAutoplayEnabled() {
  return localStorage.getItem(STORAGE_AUTOPLAY_KEY) !== '0';
}
function updateRandomButton() {
  const enabled = localStorage.getItem(STORAGE_RANDOM_KEY) === '1';
  randomToggleBtn.classList.toggle('active', enabled);
  randomToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  randomToggleBtn.textContent = '🔀';
}
function isRandomEnabled() {
  return localStorage.getItem(STORAGE_RANDOM_KEY) === '1';
}
function resetRandomPool(excludeIndex = null) {
  randomPool = [];
  for (let i = 0; i < sentenceQueue.length; i++) {
    if (i !== excludeIndex) randomPool.push(i);
  }
}
function removeFromRandomPool(index) {
  const pos = randomPool.indexOf(index);
  if (pos !== -1) randomPool.splice(pos, 1);
}
function getNextRandomIndex() {
  if (!sentenceQueue.length) return null;
  if (randomPool.length === 0) return null;
  const pick = Math.floor(Math.random() * randomPool.length);
  const idx = randomPool[pick];
  randomPool.splice(pick, 1);
  return idx;
}
function clearPausedUtterance() {
  if (playbackState === 'paused' && !pausedUtteranceCleared) {
    stopReason = 'hold';
    pausedUtteranceCleared = true;
    speechController.stop();
  }
}

function performPendingJump() {
  stopReason = null;
  const target = pendingJumpIndex;
  pendingJumpIndex = null;
  if (typeof target === 'number') {
    currentSentenceIndex = target;
    selectedSentenceIndex = target;
    playbackState = 'playing';
    manualPauseActive = false;
    pausedAtSentenceEnd = false;
    pausedSentenceNeedsReplay = false;
    renderSentenceList(currentSentenceIndex);
    showReadingMode();
    updateToggleButton();
    setTimeout(() => startCurrentSentencePlayback(), 0);
  }
}


function initHistoryAtCurrent() {
  playHistory = sentenceQueue.length ? [currentSentenceIndex] : [];
  historyIndex = playHistory.length ? 0 : -1;
}
function recordHistory(index) {
  if (index === null || index === undefined) return;
  if (historyIndex >= 0 && playHistory[historyIndex] === index) return;
  if (historyIndex < playHistory.length - 1) {
    playHistory = playHistory.slice(0, historyIndex + 1);
  }
  playHistory.push(index);
  historyIndex = playHistory.length - 1;
}
function canGoPrevHistory() {
  return historyIndex > 0;
}
function canGoNextHistory() {
  return historyIndex >= 0 && historyIndex < playHistory.length - 1;
}
function moveToPrevHistory() {
  if (!canGoPrevHistory()) return null;
  historyIndex -= 1;
  return playHistory[historyIndex];
}
function moveToNextHistory() {
  if (canGoNextHistory()) {
    historyIndex += 1;
    return playHistory[historyIndex];
  }
  const next = getNextRandomIndex();
  if (next === null || next === undefined) return null;
  recordHistory(next);
  return next;
}

function getNextSequentialIndex() {
  if (!sentenceQueue.length) return null;
  if (currentSentenceIndex + 1 < sentenceQueue.length) return currentSentenceIndex + 1;
  if (isRepeatAllEnabled()) return 0;
  return null;
}
function getNextRandomPlaybackIndex() {
  if (!sentenceQueue.length) return null;

  if (canGoNextHistory()) {
    historyIndex += 1;
    return playHistory[historyIndex];
  }

  const next = getNextRandomIndex();
  if (next === null || next === undefined) {
    if (isRepeatAllEnabled()) {
      resetRandomPool();
      initHistoryAtCurrent();
      const looped = getNextRandomIndex();
      if (looped === null || looped === undefined) return null;
      recordHistory(looped);
      return looped;
    }
    return null;
  }

  recordHistory(next);
  return next;
}

function continueFromSentenceEndPause() {
  if (pausedSentenceNeedsReplay || isRepeatOneEnabled()) {
    playbackState = 'playing';
    pausedAtSentenceEnd = false;
    pausedSentenceNeedsReplay = false;
    renderSentenceList(currentSentenceIndex);
    showReadingMode();
    requestAnimationFrame(() => { requestAnimationFrame(() => { scrollSelectedSentenceIntoView(); }); });
    updateToggleButton();
    startCurrentSentencePlayback();
    return;
  }
  const nextIndex = isRandomEnabled()
    ? getNextRandomPlaybackIndex()
    : getNextSequentialIndex();
  if (nextIndex === null || nextIndex === undefined) {
    finishPlayback('再生完了');
    return;
  }
  currentSentenceIndex = nextIndex;
  selectedSentenceIndex = nextIndex;
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
      ['前回速度', record.lastRate ? `${Number(record.lastRate).toFixed(1)}x` : '-']
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
      sentenceQueue = splitPlaybackUnits(record.text);
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
  const record = createRecord(rawText, { lastRate: Number(rateRangeEl.value) });
  currentRecordId = record.id;
  renderSavedList();
  setStatus('idle', 'テキストを保存しました');
}
function ensureCurrentRecord() {
  const result = ensureRecordForText(textEl.value, { lastRate: Number(rateRangeEl.value) });
  if (!result || !result.record) return null;
  currentRecordId = result.record.id;
  return result;
}
function finishPlayback(message) {
  speechGeneration++;
  playbackState = 'idle';
  sentenceQueue = [];
  randomPool = [];
  playHistory = [];
  historyIndex = -1;
  currentSentenceIndex = 0;
  selectedSentenceIndex = -1;
  stopReason = null;
  pendingJumpIndex = null;
  pausedAtSentenceEnd = false;
  pausedSentenceNeedsReplay = false;
  manualPauseActive = false;
  pausedSettingsChanged = false;
  pausedUtteranceCleared = false;
  showEditorMode();
  setStatus('idle', message);
  updateToggleButton();
  updateRepeatButton();
}
function startCurrentSentencePlayback() {
  pausedSettingsChanged = false;
  pausedUtteranceCleared = false;
  selectedSentenceIndex = currentSentenceIndex;
  if (isRandomEnabled()) {
    recordHistory(currentSentenceIndex);
  }
  renderSentenceList(currentSentenceIndex);
  showReadingMode();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollSelectedSentenceIntoView();
    });
  });
  updateToggleButton();

  const generation = ++speechGeneration;
  let didStart = false;
  let retried = false;

  const launchSpeech = () => {
    speechController.speak({
      text: sentenceQueue[currentSentenceIndex],
      rate: Number(rateRangeEl.value),
      voiceName: voiceSelectEl.value,
      onStart: () => {
        if (generation !== speechGeneration) return;
        didStart = true;
        playbackState = 'playing';
        manualPauseActive = false;
        pausedAtSentenceEnd = false;
        pausedSentenceNeedsReplay = false;
        pausedUtteranceCleared = false;
        setStatus('playing', '再生中');
        updateToggleButton();
      },
      onEnd: () => {
        if (generation !== speechGeneration) return;
        if (stopReason === 'jump') {
          performPendingJump();
          return;
        }
        if (stopReason === 'hold') {
          stopReason = null;
          playbackState = 'paused';
          updateToggleButton();
          return;
        }
        if (stopReason === 'stop') return;
        if (playbackState === 'paused') return;
        if (playbackState !== 'playing') return;
        if (!isAutoplayEnabled()) {
          playbackState = 'paused';
          manualPauseActive = false;
          pausedAtSentenceEnd = true;
          pausedSentenceNeedsReplay = false;
          pausedUtteranceCleared = true;
          setStatus('paused', '文末で停止中');
          updateToggleButton();
          return;
        }
        if (isRepeatOneEnabled()) {
          startCurrentSentencePlayback();
          return;
        }
        const nextIndex = isRandomEnabled()
          ? getNextRandomPlaybackIndex()
          : getNextSequentialIndex();
        if (nextIndex === null || nextIndex === undefined) {
          finishPlayback('再生完了');
          return;
        }
        currentSentenceIndex = nextIndex;
        selectedSentenceIndex = nextIndex;
        startCurrentSentencePlayback();
      },
      onError: (event) => {
        if (generation !== speechGeneration) return;
        if (stopReason === 'jump') {
          performPendingJump();
          return;
        }
        if (stopReason === 'hold') {
          stopReason = null;
          playbackState = 'paused';
          updateToggleButton();
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
        if (playbackState !== 'playing') return;
        // iOS Safari fires onerror with 'interrupted' when speech is cancelled
        // externally (screen lock, notification, etc.). Retry the current sentence.
        const errorType = event && event.error;
        if (errorType === 'interrupted' && !retried) {
          retried = true;
          const retryGen = generation;
          setTimeout(() => {
            if (playbackState === 'playing' && retryGen === speechGeneration) {
              startCurrentSentencePlayback();
            }
          }, 300);
          return;
        }
        finishPlayback('再生エラー');
      }
    });

    setTimeout(() => {
      if (generation !== speechGeneration) return;
      if (!didStart && !retried && playbackState === 'playing' && stopReason === null) {
        retried = true;
        speechController.stop();
        setTimeout(() => {
          if (playbackState === 'playing' && generation === speechGeneration) launchSpeech();
        }, 60);
      }
    }, 350);
  };

  launchSpeech();
}
function jumpToSentence(nextIndex) {
  if (!sentenceQueue.length) return;
  nextIndex = Math.max(0, Math.min(sentenceQueue.length - 1, nextIndex));
  selectedSentenceIndex = nextIndex;

  if (playbackState === 'paused') {
    currentSentenceIndex = nextIndex;
    if (isRandomEnabled()) removeFromRandomPool(nextIndex);
    renderSentenceList(currentSentenceIndex);
    showReadingMode();
    requestAnimationFrame(() => { requestAnimationFrame(() => { scrollSelectedSentenceIntoView(); }); });
    if (manualPauseActive) {
      pausedAtSentenceEnd = false;
      pausedSentenceNeedsReplay = true;
      clearPausedUtterance();
      setStatus('paused', '一時停止中');
    } else {
      pausedAtSentenceEnd = true;
      pausedSentenceNeedsReplay = true;
      pausedUtteranceCleared = true;
      setStatus('paused', '文末で停止中');
    }
    updateToggleButton();
    return;
  }

  if (playbackState === 'playing') {
    if (isRandomEnabled()) removeFromRandomPool(nextIndex);
    pendingJumpIndex = nextIndex;
    stopReason = 'jump';
    playbackState = 'playing';
    renderSentenceList(-1);
    showReadingMode();
    updateToggleButton();
    speechController.stop();
    return;
  }

  currentSentenceIndex = nextIndex;
  if (isRandomEnabled()) removeFromRandomPool(nextIndex);
  showReadingMode();
  playbackState = 'playing';
  stopReason = null;
  pendingJumpIndex = null;
  updateToggleButton();
  startCurrentSentencePlayback();
}
function selectSentenceByTap(index) {
  selectedSentenceIndex = index;
  renderSentenceList(-1);
  jumpToSentence(index);
}


function startPlayback() {
  const text = textEl.value.trim();
  if (!text) {
    alert('先に英字テキストを貼り付けてください。');
    return;
  }

  const ensured = ensureCurrentRecord();
  renderSavedList();

  sentenceQueue = splitPlaybackUnits(text);
  if (!sentenceQueue.length) {
    alert('再生できる文がありません。');
    return;
  }

  playbackState = 'playing';
  stopReason = null;
  pendingJumpIndex = null;
  pausedAtSentenceEnd = false;
  pausedSentenceNeedsReplay = false;
  manualPauseActive = false;

  if (isRandomEnabled()) {
    resetRandomPool(null);
    const randomStart = getNextRandomIndex();
    currentSentenceIndex = randomStart !== null ? randomStart : 0;
    resetRandomPool(currentSentenceIndex);
    initHistoryAtCurrent();
  } else {
    currentSentenceIndex = 0;
    resetRandomPool(currentSentenceIndex);
    playHistory = [];
    historyIndex = -1;
  }
  selectedSentenceIndex = currentSentenceIndex;

  renderSentenceList(currentSentenceIndex);
  showReadingMode();
  updateToggleButton();

  if (currentRecordId) {
    touchRecord(currentRecordId, {
      incrementPlayCount: 1,
      lastRate: Number(rateRangeEl.value),
      lastVoiceName: voiceSelectEl.value
    });
    renderSavedList();
  }

  startCurrentSentencePlayback();

  if (ensured && ensured.isNew) {
    setStatus('playing', '新規テキストを保存して再生中');
  }
}

textEl.addEventListener('input', () => {
  saveCurrentText(textEl.value);
  currentRecordId = null;
});

rateRangeEl.addEventListener('input', () => {
  updateRateLabel();
  if (playbackState === 'paused') {
    pausedSettingsChanged = true;
    pausedSentenceNeedsReplay = true;
    if (manualPauseActive) clearPausedUtterance();
    renderSentenceList(currentSentenceIndex);
  }
});


randomToggleBtn.addEventListener('click', () => {
  const next = !isRandomEnabled();
  localStorage.setItem(STORAGE_RANDOM_KEY, next ? '1' : '0');
  if (next && sentenceQueue.length) {
    resetRandomPool(currentSentenceIndex);
    initHistoryAtCurrent();
  }
  if (!next) {
    playHistory = [];
    historyIndex = -1;
  }
  updateRandomButton();
  updateToggleButton();
});
repeatToggleBtn.addEventListener('click', () => {
  const mode = getRepeatMode();
  const nextMode = mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
  setRepeatMode(nextMode);
  updateRepeatButton();
  updateToggleButton();
});
autoplayToggleBtn.addEventListener('click', () => {
  const next = !isAutoplayEnabled();
  localStorage.setItem(STORAGE_AUTOPLAY_KEY, next ? '1' : '0');
  updateAutoplayButton();
});
playbackUnitToggleBtn.addEventListener('click', () => {
  if (playbackState !== 'idle') return;
  const next = isFullPlaybackEnabled() ? 'sentence' : 'full';
  localStorage.setItem(STORAGE_PLAYBACK_UNIT_KEY, next);
  sentenceQueue = splitPlaybackUnits(textEl.value);
  updatePlaybackUnitButton();
  setStatus('idle', next === 'full' ? '全文再生モード' : '文ごと再生モード');
});
voiceSelectEl.addEventListener('change', () => {
  if (playbackState === 'paused') {
    pausedSettingsChanged = true;
    pausedSentenceNeedsReplay = true;
    if (manualPauseActive) clearPausedUtterance();
    renderSentenceList(currentSentenceIndex);
  }
});
saveBtn.addEventListener('click', saveCurrentTextManually);

togglePlayBtn.addEventListener('click', () => {
  if (playbackState === 'paused') {
    if (pausedAtSentenceEnd) {
      continueFromSentenceEndPause();
    } else if (manualPauseActive) {
      if (pausedSentenceNeedsReplay || pausedSettingsChanged) {
        playbackState = 'playing';
        stopReason = null;
        pausedAtSentenceEnd = false;
        manualPauseActive = false;
        pausedSentenceNeedsReplay = false;
        pausedSettingsChanged = false;
        showReadingMode();
        updateToggleButton();
        startCurrentSentencePlayback();
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
    pausedUtteranceCleared = false;
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
  pausedSettingsChanged = false;
  pausedUtteranceCleared = false;
  playbackState = 'idle';
  speechController.stop();
  sentenceQueue = [];
  randomPool = [];
  playHistory = [];
  historyIndex = -1;
  currentSentenceIndex = 0;
  selectedSentenceIndex = -1;
  showEditorMode();
  setStatus('idle', '停止しました');
  updateToggleButton();
  updateRandomButton();
  updateRepeatButton();
  updateAutoplayButton();
});
prevBtn.addEventListener('click', () => {
  if (isRandomEnabled()) {
    const prevIndex = moveToPrevHistory();
    if (prevIndex !== null && prevIndex !== undefined) {
      jumpToSentence(prevIndex);
    }
    return;
  }

  const prevIndex = currentSentenceIndex > 0
    ? currentSentenceIndex - 1
    : (isRepeatAllEnabled() && sentenceQueue.length ? sentenceQueue.length - 1 : null);

  if (prevIndex !== null && prevIndex !== undefined) {
    jumpToSentence(prevIndex);
  }
});
nextBtn.addEventListener('click', () => {
  if (!sentenceQueue.length) return;

  if (isRandomEnabled()) {
    const nextIndex = getNextRandomPlaybackIndex();
    if (nextIndex !== null && nextIndex !== undefined) {
      jumpToSentence(nextIndex);
    }
    return;
  }

  const nextIndex = getNextSequentialIndex();
  if (nextIndex !== null && nextIndex !== undefined) {
    jumpToSentence(nextIndex);
  }
});
settingsOverlayEl.addEventListener('click',()=>closeSettingsPanel());

toggleSettingsBtn.addEventListener('click', () => {
  const show = !bottomSettingsEl.classList.contains('show');
  if (show) openSettingsPanel();
  else closeSettingsPanel();
});

function loadSaved() {
  ensureDefaultSettings();
  textEl.value = getCurrentText();
  rateRangeEl.value = getSavedRate();
  updateRandomButton();
  updateRepeatButton();
  updateAutoplayButton();
  updatePlaybackUnitButton();
  updateRateLabel();
  renderSavedList();
  playbackState = 'idle';
  sentenceQueue = [];
  randomPool = [];
  playHistory = [];
  historyIndex = -1;
  currentSentenceIndex = 0;
  selectedSentenceIndex = -1;
  stopReason = null;
  pendingJumpIndex = null;
  pausedAtSentenceEnd = false;
  pausedSentenceNeedsReplay = false;
  manualPauseActive = false;
  pausedSettingsChanged = false;
  pausedUtteranceCleared = false;
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

// iOS Safari がバックグラウンド時にページを破棄することがあるため、
// 非表示になる直前にテキストを localStorage へ確実に保存する
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && textEl.value) {
    saveCurrentText(textEl.value);
  }
});
window.addEventListener('pagehide', () => {
  if (textEl.value) saveCurrentText(textEl.value);
});
