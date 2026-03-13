const speechController = (() => {
  let voices = [];
  function getVoices() { voices = window.speechSynthesis.getVoices() || []; return voices; }
  function getEnglishVoices() { return getVoices().filter(v => /^en([-_]|$)/i.test(v.lang)); }
  function waitForVoices(callback) {
    const list = getVoices();
    if (list.length) { callback(list); return; }
    window.speechSynthesis.onvoiceschanged = () => callback(getVoices());
  }
  function stop() { window.speechSynthesis.cancel(); }
  function pause() { if (window.speechSynthesis.speaking) window.speechSynthesis.pause(); }
  function resume() { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); }
  function speak({ text, rate, voiceName, onStart, onEnd, onError }) {
    stop();
    const utter = new SpeechSynthesisUtterance(text);
    const allVoices = getVoices();
    const selected = allVoices.find(v => v.name === voiceName) || getEnglishVoices()[0] || allVoices[0];
    if (selected) { utter.voice = selected; utter.lang = selected.lang; } else { utter.lang = 'en-US'; }
    utter.rate = Number(rate) || 1.0;
    utter.pitch = 1.0;
    utter.onstart = () => { if (onStart) onStart(selected || null); };
    utter.onend = () => { if (onEnd) onEnd(selected || null); };
    utter.onerror = (event) => { if (onError) onError(event, selected || null); };
    window.speechSynthesis.speak(utter);
  }
  return { getVoices, getEnglishVoices, waitForVoices, speak, stop, pause, resume };
})();