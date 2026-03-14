const micBtn = document.getElementById('micBtn');
const micStatus = document.getElementById('micStatus');
const transcriptText = document.getElementById('transcriptText');
const resultBox = document.getElementById('resultBox');
const resultText = document.getElementById('resultText');
const confirmBtn = document.getElementById('confirmBtn');
const redoBtn = document.getElementById('redoBtn');

let recognition;
let isListening = false;
let lastTranscript = '';

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    micStatus.textContent = '🔴 Listening... speak now';
    transcriptText.style.color = '#f0f0f0';
    transcriptText.style.fontStyle = 'normal';
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }
    transcriptText.textContent = final || interim;
    if (final) {
      lastTranscript = final.trim();
      handleFinalTranscript(lastTranscript);
    }
  };

  recognition.onerror = (e) => {
    micStatus.textContent = '⚠️ Error: ' + e.error + '. Try again.';
    resetMic();
  };

  recognition.onend = () => resetMic();

} else {
  micBtn.disabled = true;
  micStatus.textContent = '⚠️ Voice not supported. Please use Chrome.';
}

micBtn.addEventListener('click', () => {
  if (isListening) {
    recognition.stop();
  } else {
    resultBox.classList.add('hidden');
    recognition.start();
  }
});

function resetMic() {
  isListening = false;
  micBtn.classList.remove('listening');
  micStatus.textContent = 'Tap to speak';
}

async function handleFinalTranscript(text) {
  micStatus.textContent = '🧠 ARIA is thinking...';
  try {
    const response = await fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const parsed = await response.json();
    showResult(parsed);
  } catch (err) {
    resultText.textContent = '⚠️ Something went wrong. Please try again.';
    resultBox.classList.remove('hidden');
    console.error(err);
  }
  micStatus.textContent = 'Tap to speak';
}

function showResult(parsed) {
  const icons = {
    REMINDER: '⏰',
    CALENDAR: '📅',
    EMAIL: '✉️',
    TASK: '✅',
    BRAIN_DUMP: '🧠'
  };
  const icon = icons[parsed.type] || '📋';
  resultText.textContent = `${icon} ${parsed.confirmation}`;
  resultBox.classList.remove('hidden');

  const calendarLinkBox = document.getElementById('calendarLinkBox');
  const calendarLink = document.getElementById('calendarLink');

  if (parsed.calendarLink) {
    calendarLink.href = parsed.calendarLink;
    calendarLinkBox.classList.remove('hidden');
  } else {
    calendarLinkBox.classList.add('hidden');
  }
}

confirmBtn.addEventListener('click', () => {
  resultBox.classList.add('hidden');
  transcriptText.textContent = '✅ Got it! ARIA is on it.';
  transcriptText.style.color = '#3ecfcf';
});

redoBtn.addEventListener('click', () => {
  resultBox.classList.add('hidden');
  transcriptText.textContent = 'Your words will appear here...';
  transcriptText.style.color = '#666';
  transcriptText.style.fontStyle = 'italic';
});
