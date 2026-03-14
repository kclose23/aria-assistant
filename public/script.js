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

// --- Manual input ---
manualSubmit.addEventListener('click', function() {
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
  recognition.continuous = true;
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
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(function() {
      if (isListening) recognition.stop();
    }, 2500);
    if (final) {
      var transcript = final.trim();
      if (silenceTimer) clearTimeout(silenceTimer);
      recognition.stop();
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
  if (isListening) {
    recognition.stop();
  } else {
    resultBox.classList.add('hidden');
    hideEmailDraft();
    recognition.start();
  }
});

function resetMic() {
  isListening = false;
  micBtn.classList.remove('listening');
  micStatus.textContent = 'Tap to speak';
}

// --- Handle transcript ---
async function handleFinalTranscript(text) {
  micStatus.textContent = '🧠 ARIA is thinking...';
  resultBox.classList.add('hidden');
  hideEmailDraft();

  try {
    var response = await fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });

    if (!response.ok) throw new Error('Server error: ' + response.status);
    var parsed = await response.json();
    console.log('ARIA response:', JSON.stringify(parsed));

    if (parsed.type === 'EMAIL' && parsed.details) {
      showEmailDraft(parsed);
    } else {
      showResult(parsed);
    }
  } catch (err) {
    resultText.textContent = '⚠️ Something went wrong. Please try again.';
    resultBox.classList.remove('hidden');
    console.error(err);
  }
  micStatus.textContent = 'Tap to speak';
}

// --- Show result ---
function showResult(parsed) {
  var icons = {
    REMINDER: '⏰',
    CALENDAR: '📅',
    EMAIL: '✉️',
    TASK: '✅',
    BRAIN_DUMP: '🧠'
  };
  var icon = icons[parsed.type] || '📋';
  resultText.textContent = icon + ' ' + parsed.confirmation;
  resultBox.classList.remove('hidden');

  var calendarLinkBox = document.getElementById('calendarLinkBox');
  var calendarLink = document.getElementById('calendarLink');
  if (parsed.calendarLink) {
    calendarLink.href = parsed.calendarLink;
    calendarLinkBox.classList.remove('hidden');
  } else {
    calendarLinkBox.classList.add('hidden');
  }
}

// --- Show email draft ---
function showEmailDraft(parsed) {
  pendingEmail = parsed.details;

  emailDraftBox.innerHTML =
    '<h3>✉️ Email Draft</h3>' +
    '<div class="email-field">' +
      '<label>To:</label>' +
      '<input type="email" id="emailTo" value="' + (parsed.details.recipientEmail || '') + '" placeholder="recipient@email.com" />' +
    '</div>' +
    '<div class="email-field">' +
      '<label>Subject:</label>' +
      '<input type="text" id="emailSubject" value="' + (parsed.details.subject || '') + '" />' +
    '</div>' +
    '<div class="email-field">' +
      '<label>Message:</label>' +
      '<textarea id="emailBody" rows="8">' + (parsed.details.emailBody || '') + '</textarea>' +
    '</div>' +
    '<p class="email-account">Sending from: ' + (parsed.details.accountType === 'work' ? '💼 Work Gmail' : '👤 Personal Gmail') + '</p>' +
    '<div class="email-actions">' +
      '<button class="confirm-btn" id="sendEmailBtn">📤 Send Email</button>' +
      '<button class="redo-btn" id="cancelEmailBtn">❌ Cancel</button>' +
    '</div>';

  emailDraftBox.classList.remove('hidden');

  document.getElementById('sendEmailBtn').addEventListener('click', sendEmail);
  document.getElementById('cancelEmailBtn').addEventListener('click', function() {
    hideEmailDraft();
    transcriptText.textContent = '❌ Email cancelled.';
    transcriptText.style.color = '#aaa';
  });
}

// --- Send email ---
async function sendEmail() {
  var to = document.getElementById('emailTo').value;
  var subject = document.getElementById('emailSubject').value;
  var emailBody = document.getElementById('emailBody').value;

  if (!to) {
    alert('Please enter a recipient email address.');
    return;
  }

  var sendBtn = document.getElementById('sendEmailBtn');
  sendBtn.textContent = '📤 Sending...';
  sendBtn.disabled = true;

  try {
    var response = await fetch('/.netlify/functions/gmail-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: to,
        subject: subject,
        emailBody: emailBody,
        accountType: pendingEmail.accountType
      })
    });

    var data = await response.json();

    if (data.success) {
      hideEmailDraft();
      transcriptText.textContent = '✅ Email sent successfully!';
      transcriptText.style.color = '#3ecfcf';
    } else {
      sendBtn.textContent = '📤 Send Email';
      sendBtn.disabled = false;
      alert('Failed to send: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    sendBtn.textContent = '📤 Send Email';
    sendBtn.disabled = false;
    alert('Error sending email: ' + err.message);
  }
}

// --- Hide email draft ---
function hideEmailDraft() {
  emailDraftBox.classList.add('hidden');
  emailDraftBox.innerHTML = '';
  pendingEmail = null;
}

// --- Confirm / Redo buttons ---
confirmBtn.addEventListener('click', function() {
  resultBox.classList.add('hidden');
  transcriptText.textContent = '✅ Got it! ARIA is on it.';
  transcriptText.style.color = '#3ecfcf';
});

redoBtn.addEventListener('click', function() {
  resultBox.classList.add('hidden');
  transcriptText.textContent = 'Your words will appear here...';
  transcriptText.style.color = '#666';
  transcriptText.style.fontStyle = 'italic';
});
