const STORAGE_TEXT_KEY = 'tts_listener_text';
const STORAGE_RATE_KEY = 'tts_listener_rate';
const STORAGE_VOICE_KEY = 'tts_listener_voice';
const STORAGE_RECORDS_KEY = 'tts_listener_records';

function normalizeText(text) { return text.trim().replace(/\s+/g, ' '); }
function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
function getCurrentText() { return localStorage.getItem(STORAGE_TEXT_KEY) || ''; }
function saveCurrentText(text) { localStorage.setItem(STORAGE_TEXT_KEY, text); }
function getSavedRate() { return localStorage.getItem(STORAGE_RATE_KEY) || '1.0'; }
function saveRate(rate) { localStorage.setItem(STORAGE_RATE_KEY, String(rate)); }
function getSavedVoice() { return localStorage.getItem(STORAGE_VOICE_KEY) || ''; }
function saveVoice(voiceName) { localStorage.setItem(STORAGE_VOICE_KEY, voiceName); }
function getRecords() { try { return JSON.parse(localStorage.getItem(STORAGE_RECORDS_KEY) || '[]'); } catch { return []; } }
function saveRecords(records) { localStorage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(records)); }
function findRecordByText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  return getRecords().find(r => r.normalizedText === normalized) || null;
}
function createRecord(text, meta = {}) {
  const record = { id:createId(), text, normalizedText:normalizeText(text), createdAt:Date.now(), updatedAt:Date.now(), playCount:meta.playCount || 0, lastRate:meta.lastRate || null, lastVoiceName:meta.lastVoiceName || '' };
  const records = getRecords(); records.unshift(record); saveRecords(records); return record;
}
function ensureRecordForText(text, meta = {}) {
  const normalized = normalizeText(text); if (!normalized) return null;
  const existing = findRecordByText(text); if (existing) return { record: existing, isNew: false };
  const created = createRecord(text, meta); return { record: created, isNew: true };
}
function deleteRecordById(id) { saveRecords(getRecords().filter(r => r.id !== id)); }
function touchRecord(recordId, meta = {}) {
  const records = getRecords(); const idx = records.findIndex(r => r.id === recordId); if (idx === -1) return null;
  records[idx].updatedAt = Date.now();
  if (typeof meta.incrementPlayCount === 'number') records[idx].playCount += meta.incrementPlayCount;
  if (meta.lastRate != null) records[idx].lastRate = meta.lastRate;
  if (meta.lastVoiceName != null) records[idx].lastVoiceName = meta.lastVoiceName;
  saveRecords(records); return records[idx];
}