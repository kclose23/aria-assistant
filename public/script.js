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
let pendingEmail = null;

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
    hideEmailDraft();
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
  resultBox.classList.add('hidden');
  hideEmailDraft();

  try {
    const response = await fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error('Server error: ' + response.status);
    const parsed = await response.json();

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

function showResult(parsed) {
  const icons = {
    REMINDER: '⏰',
    CALENDAR: '📅',
    EMAIL: '✉️',
    TASK: '✅',
    BRAIN_DUMP: '🧠'
  };
  const icon = icons[parsed.type] || '📋';
  resultText.textContent = icon + ' ' + parsed.confirmation;
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

function showEmailDraft(parsed) {
  pendingEmail = parsed.details;
  const draftBox = document.getElementById('emailDraftBox');

  draftBox.innerHTML =
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

  draftBox.classList.remove('hidden');

  document.getElementById('sendEmailBtn').addEventListener('click', sendEmail);
  document.getElementById('cancelEmailBtn').addEventListener('click', function() {
    hideEmailDraft();
    transcriptText.textContent = '❌ Email cancelled.';
    transcriptText.style.color = '#aaa';
  });
}

async function sendEmail() {
  const to = document.getElementById('emailTo').value;
  const subject = document.getElementById('emailSubject').value;
  const emailBody = document.getElementById('emailBody').value;

  if (!to) {
    alert('Please enter a recipient email address.');
    return;
  }

  const sendBtn = document.getElementById('sendEmailBtn');
  sendBtn.textContent = '📤 Sending...';
  sendBtn.disabled = true;

  try {
    const response = await fetch('/.netlify/functions/gmail-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: to,
        subject: subject,
        emailBody: emailBody,
        accountType: pendingEmail.accountType
      })
    });

    const data = await response.json();

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

function hideEmailDraft() {
  const draftBox = document.getElementById('emailDraftBox');
  if (draftBox) {
    draftBox.classList.add('hidden');
    draftBox.innerHTML = '';
  }
  pendingEmail = null;
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
