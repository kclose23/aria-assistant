var micBtn = document.getElementById('micBtn');
var micStatus = document.getElementById('micStatus');
var transcriptText = document.getElementById('transcriptText');
var resultBox = document.getElementById('resultBox');
var resultText = document.getElementById('resultText');
var confirmBtn = document.getElementById('confirmBtn');
var redoBtn = document.getElementById('redoBtn');
var emailDraftBox = document.getElementById('emailDraftBox');
var manualInput = document.getElementById('manualInput');
var manualSubmit = document.getElementById('manualSubmit');

var recognition = null;
var isListening = false;
var pendingEmail = null;
var silenceTimer = null;
var processingCommand = false;

// --- Manual input ---
manualSubmit.addEventListener('click', function() {
  if (processingCommand) return;
  var text = manualInput.value.trim();
  if (!text) return;
  transcriptText.textContent = text;
  transcriptText.style.color = '#f0f0f0';
  transcriptText.style.fontStyle = 'normal';
  manualInput.value = '';
  handleFinalTranscript(text);
});

manualInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') manualSubmit.click();
});

// --- Voice setup ---
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = function() {
    isListening = true;
    micBtn.classList.add('listening');
    micStatus.textContent = '🔴 Listening... speak now';
    transcriptText.style.color = '#f0f0f0';
    transcriptText.style.fontStyle = 'normal';
  };

  recognition.onresult = function(event) {
    var interim = '';
    var final = '';
    for (var i = event.resultIndex; i < event.results.length; i++) {
      var t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }
    transcriptText.textContent = final || interim;
    if (final) {
      var transcript = final.trim();
      handleFinalTranscript(transcript);
    }
  };

  recognition.onerror = function(e) {
    micStatus.textContent = '⚠️ Error: ' + e.error + '. Try again.';
    resetMic();
  };

  recognition.onend = function() {
    resetMic();
  };

} else {
  micBtn.disabled = true;
  micStatus.textContent = '⚠️ Voice not supported. Please use Chrome.';
}

// --- Mic button ---
micBtn.addEventListener('click', function() {
  if (processingCommand) return;
  if (isListening) {
    recognition.stop();
  } else {
    resultBox.classList.add('hidden');
    hideEmailDraft();
    try { recognition.start(); } catch(e) { console.log(e); }
  }
});

function resetMic() {
  isListening = false;
  micBtn.classList.remove('listening');
  micStatus.textContent = 'Tap to speak';
}

function fullReset() {
  resetMic();
  processingCommand = false;
  hideEmailDraft();
  resultBox.classList.add('hidden');
  transcriptText.textContent = 'Your words will appear here...';
  transcriptText.style.color = '#666';
  transcriptText.style.fontStyle = 'italic';
  manualInput.value = '';
  manualInput.disabled = false;
  manualSubmit.disabled = false;
}

// --- Handle transcript ---
async function handleFinalTranscript(text) {
  if (processingCommand) return;
  processingCommand = true;
  micStatus.textContent = '🧠 ARIA is thinking...';
  resultBox.classList.add('hidden');
  hideEmailDraft();
  manualInput.disabled = true;
  manualSubmit.disabled = true;

  try {
    var response = await fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Con
