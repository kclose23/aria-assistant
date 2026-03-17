var micBtn = document.getElementById('micBtn');
var micStatus = document.getElementById('micStatus');
var transcriptText = document.getElementById('transcriptText');
var resultBox = document.getElementById('resultBox');
var resultText = document.getElementById('resultText');
var resultTag = document.getElementById('resultTag');
var confirmBtn = document.getElementById('confirmBtn');
var redoBtn = document.getElementById('redoBtn');
var emailDraftBox = document.getElementById('emailDraftBox');
var manualInput = document.getElementById('manualInput');
var manualSubmit = document.getElementById('manualSubmit');

var recognition = null;
var isListening = false;
var pendingEmail = null;
var processingCommand = false;
var lastParsed = null;

var tagConfig = {
  REMINDER:   { label: '⏰ Reminder',  cls: 'reminder' },
  CALENDAR:   { label: '📅 Calendar',  cls: 'calendar' },
  EMAIL:      { label: '✉️ Email',     cls: 'email' },
  TASK:       { label: '✅ Task',      cls: 'task' },
  BRAIN_DUMP: { label: '🧠 Note',      cls: 'reminder' }
};

manualSubmit.addEventListener('click', function() {
  if (processingCommand) return;
  var text = manualInput.value.trim();
  if (!text) return;
  transcriptText.textContent = text;
  transcriptText.classList.add('active');
  manualInput.value = '';
  handleFinalTranscript(text);
});

manualInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') manualSubmit.click();
});

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = function() {
    isListening = true;
    micBtn.classList.add('listening');
    micStatus.textContent = 'Listening...';
    transcriptText.classList.add('active');
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
    if (final) handleFinalTranscript(final.trim());
  };

  recognition.onerror = function(e) {
    micStatus.textContent = 'Error — try again';
    resetMic();
  };

  recognition.onend = function() { resetMic(); };

} else {
  micBtn.disabled = true;
  micStatus.textContent = 'Use Chrome for voice';
}

micBtn.addEventListener('click', function() {
  if (processingCommand) return;
  if (isListening) {
    recognition.stop();
  } else {
    resultBox.classList.add('hidden');
    hideEmailDraft();
    try { recognition.start(); } catch(e) {}
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
  transcriptText.classList.remove('active');
  transcriptText.style.fontStyle = 'italic';
  manualInput.value = '';
  manualInput.disabled = false;
  manualSubmit.disabled = false;
}

async function handleFinalTranscript(text) {
  if (processingCommand) return;
  processingCommand = true;
  micStatus.textContent = 'Thinking...';
  resultBox.classList.add('hidden');
  hideEmailDraft();
  manualInput.disabled = true;
  manualSubmit.disabled = true;

  try {
    var response = await fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    if (!response.ok) throw new Error('Server error: ' + response.status);
    var parsed = await response.json();
    lastParsed = parsed;

    if (parsed.type === 'EMAIL') {
      parsed.details = {
        recipientEmail: parsed.to,
        subject: parsed.subject,
        emailBody: parsed.body,
        accountType: 'personal'
      };
      showEmailDraft(parsed);
    } else {
      showResult(parsed);
    }
  } catch (err) {
    resultTag.textContent = '⚠️ Error';
    resultTag.className = 'result-tag reminder';
    resultText.textContent = 'Something went wrong. Please try again.';
    resultBox.classList.remove('hidden');
    console.error(err);
  }

  micStatus.textContent = 'Tap to speak';
  processingCommand = false;
  manualInput.disabled = false;
  manualSubmit.disabled = false;
}

function showResult(parsed) {
  var config = tagConfig[parsed.type] || { label: '📋 ARIA', cls: 'reminder' };
  resultTag.textContent = config.label;
  resultTag.className = 'result-tag ' + config.cls;

  if (parsed.type === 'REMINDER') {
    resultText.textContent = 'Reminder: ' + parsed.task + (parsed.datetime ? ' at ' + new Date(parsed.datetime).toLocaleString() : '');
  } else if (parsed.type === 'CALENDAR') {
    resultText.textContent = 'Event: ' + parsed.title + (parsed.datetime ? ' at ' + new Date(parsed.datetime).toLocaleString() : '');
  } else if (parsed.type === 'TASK') {
    resultText.textContent = 'Task added: ' + parsed.task;
  } else if (parsed.type === 'SLACK') {
    resultText.textContent = 'Slack message: ' + parsed.message;
  } else {
    resultText.textContent = parsed.response || parsed.confirmation || 'Done!';
  }

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

function showEmailDraft(parsed) {
  pendingEmail = parsed.details;
  emailDraftBox.innerHTML =
    '<h3>Email Draft</h3>' +
    '<div class="email-field"><label>To</label>' +
    '<input type="email" id="emailTo" value="' + (parsed.details.recipientEmail || '') + '" placeholder="recipient@email.com" /></div>' +
    '<div class="email-field"><label>Subject</label>' +
    '<input type="text" id="emailSubject" value="' + (parsed.details.subject || '') + '" /></div>' +
    '<div class="email-field"><label>Message</label>' +
    '<textarea id="emailBody" rows="7">' + (parsed.details.emailBody || '') + '</textarea></div>' +
    '<p class="email-account">Sending from ' + (parsed.details.accountType === 'work' ? 'Work Gmail' : 'Personal Gmail') + '</p>' +
    '<div class="email-actions">' +
    '<button class="btn-confirm" id="sendEmailBtn">Send Email</button>' +
    '<button class="btn-redo" id="cancelEmailBtn">Cancel</button></div>';

  emailDraftBox.classList.remove('hidden');
  document.getElementById('sendEmailBtn').addEventListener('click', sendEmail);
  document.getElementById('cancelEmailBtn').addEventListener('click', function() {
    fullReset();
  });
}

async function sendEmail() {
  var to = document.getElementById('emailTo').value;
  var subject = document.getElementById('emailSubject').value;
  var emailBody = document.getElementById('emailBody').value;
  if (!to) { alert('Please enter a recipient email.'); return; }

  var sendBtn = document.getElementById('sendEmailBtn');
  sendBtn.textContent = 'Sending...';
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
      fullReset();
      transcriptText.textContent = 'Email sent successfully';
      transcriptText.classList.add('active');
    } else {
      sendBtn.textContent = 'Send Email';
      sendBtn.disabled = false;
      alert('Failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    sendBtn.textContent = 'Send Email';
    sendBtn.disabled = false;
    alert('Error: ' + err.message);
  }
}

function hideEmailDraft() {
  try {
    emailDraftBox.classList.add('hidden');
    emailDraftBox.innerHTML = '';
  } catch(e) {}
  pendingEmail = null;
}

confirmBtn.addEventListener('click', async function() {
  if (lastParsed && lastParsed.type === 'REMINDER') {
    try {
      await fetch('/.netlify/functions/slack-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: lastParsed.task,
          emoji: '⏰',
          scheduledISO: lastParsed.datetime
        })
      });
    } catch(e) { console.error(e); }
  }
  fullReset();
  transcriptText.textContent = 'Got it — ARIA is on it';
  transcriptText.classList.add('active');
});

redoBtn.addEventListener('click', fullReset);

document.getElementById('navCapture').addEventListener('click', function() {
  setNav('navCapture');
});
document.getElementById('navSettings').addEventListener('click', function() {
  window.location.href = '/connect.html';
});
document.getElementById('navTasks').addEventListener('click', function() {
  transcriptText.textContent = 'Tasks view coming soon...';
  transcriptText.classList.add('active');
  setNav('navTasks');
});
document.getElementById('navCalendar').addEventListener('click', function() {
  transcriptText.textContent = 'Calendar view coming soon...';
  transcriptText.classList.add('active');
  setNav('navCalendar');
});

function setNav(activeId) {
  ['navCapture','navTasks','navCalendar','navSettings'].forEach(function(id) {
    document.getElementById(id).classList.remove('active');
  });
  document.getElementById(activeId).classList.add('active');
}
