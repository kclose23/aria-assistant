module.exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  var text;
  try {
    var body = JSON.parse(event.body);
    text = body.text;
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing text' }) };
  }

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Gemini API key not configured' }) };
  }

  var now = new Date();
  var baseUrl = 'https://sprightly-lebkuchen-41b633.netlify.app';

  var currentDate = now.toLocaleDateString('en-US', {timeZone: 'America/Denver', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
  var currentTime = now.toLocaleTimeString('en-US', {timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit'});

  var prompt = 'You are ARIA, a smart productivity assistant for Kyler in Salt Lake City, Utah (Mountain Time, UTC-6).\n' +
    'Current date: ' + currentDate + '\n' +
    'Current time: ' + currentTime + '\n\n' +
    'The user said: "' + text + '"\n\n' +
    'Identify the TYPE. Choose ONE of: REMINDER, CALENDAR, EMAIL, TASK, BRAIN_DUMP\n\n' +
    'For CALENDAR events:\n' +
    '- calendarType: "work" (meetings, calls, clients, travel, deadlines) or "family" (kids, personal, errands, medical) or "ask" if ambiguous\n' +
    '- startISO and endISO: always use -06:00 offset (Mountain Time)\n' +
    '- recurrence: include if user says "every", "weekly", "daily", "monthly" etc. Otherwise null.\n' +
    '- attendees: array of email addresses mentioned. Otherwise empty array [].\n\n' +
    'For EMAIL:\n' +
    '- accountType: "work" or "family"\n' +
    '- Extract recipient name, email, subject, and draft a professional email\n' +
    '- If no email address mentioned, set recipientEmail to null\n\n' +
    'Reply in this exact JSON format with no extra text:\n\n' +
    'For CALENDAR:\n' +
    '{"type":"CALENDAR","details":{"what":"team standup","when":"every Monday at 9am","calendarType":"work","startISO":"2026-03-16T09:00:00-06:00","endISO":"2026-03-16T10:00:00-06:00","recurrence":"every Monday","attendees":["john@company.com"]},"confirmation":"Got it! Adding team standup to Work Calendar every Monday at 9am."}\n\n' +
    'For EMAIL:\n' +
    '{"type":"EMAIL","details":{"accountType":"work","recipientName":"Sarah","recipientEmail":"sarah@company.com","subject":"Proposal Update","emailBody":"Hi Sarah,\\n\\nI wanted to reach out.\\n\\nBest,\\nKyler"},"confirmation":"I have drafted an email to Sarah. Review it below."}\n\n' +
    'For REMINDER:\n' +
    '{"type":"REMINDER","details":{"what":"call dentist","when":"tomorrow at 10am","who":""},"confirmation":"Got it! I will remind you to call the dentist tomorrow at 10am."}\n\n' +
    'For TASK, BRAIN_DUMP use REMINDER format.\n' +
    'Only return the JSON. No extra text.';

  try {
    var geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    var data = await geminiRes.json();

    if (!geminiRes.ok || !data.candidates || !data.candidates[0]) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Gemini API error', detail: data.error ? data.error.message : 'No candidates returned' })
      };
    }

    var raw = data.candidates[0].content.parts[0].text;
    var cleaned = raw.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(cleaned);

    // Handle CALENDAR
    if (parsed.type === 'CALENDAR' && parsed.details && parsed.details.calendarType !== 'ask') {
      var calRes = await fetch(baseUrl + '/.netlify/functions/calendar-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: parsed.details.what,
          description: 'Added by ARIA: ' + text,
          start: parsed.details.startISO,
          end: parsed.details.endISO,
          calendarType: parsed.details.calendarType,
          recurrence: parsed.details.recurrence || null,
          attendees: parsed.details.attendees || []
        })
      });
      var calData = await calRes.json();
      if (calData.success) {
        var calLabel = parsed.details.calendarType === 'work' ? 'Work' : 'Family';
        var recurringLabel = calData.recurring ? ' (repeating)' : '';
        var attendeeLabel = calData.attendeeCount > 0 ? ' — ' + calData.attendeeCount + ' attendee(s) invited' : '';
        parsed.confirmation = 'Done! "' + parsed.details.what + '" added to your ' + calLabel + ' Calendar' + recurringLabel + attendeeLabel + '.';
        parsed.calendarLink = calData.eventLink;
      } else {
        parsed.confirmation = 'Understood the event but could not add it. Make sure your calendar is connected.';
      }
    }

    // Handle REMINDER
    if (parsed.type === 'REMINDER' && parsed.details) {
      try {
        var whenText = (parsed.details.when || '').toLowerCase();
        var now2 = new Date();
        var mtNow = new Date(now2.toLocaleString('en-US', { timeZone: 'America/Denver' }));
        var scheduledTime = null;

        var inMinutes = whenText.match(/in (\d+) minute/);
        var inHours = whenText.match(/in (\d+) hour/);
        var atTime = whenText.match(/(\d+):?(\d*)\s*(am|pm)/i);
        var tomorrow = whenText.includes('tomorrow');

        if (inMinutes) {
          scheduledTime = new Date(now2.getTime() + parseInt(inMinutes[1]) * 60000);
        } else if (inHours) {
          scheduledTime = new Date(now2.getTime() + parseInt(inHours[1]) * 3600000);
        } else if (atTime) {
          var hours = parseInt(atTime[1]);
          var minutes = parseInt(atTime[2] || '0');
          var ampm = atTime[3].toLowerCase();
          if (ampm === 'pm' && hours !== 12) hours += 12;
          if (ampm === 'am' && hours === 12) hours = 0;
          scheduledTime = new Date(mtNow);
          scheduledTime.setHours(hours, minutes, 0, 0);
          if (tomorrow) scheduledTime.setDate(scheduledTime.getDate() + 1);
          if (scheduledTime <= now2) scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        var slackPayload = {
          message: parsed.confirmation,
          emoji: '⏰'
        };

        if (scheduledTime && scheduledTime > new Date(now2.getTime() + 60000)) {
          slackPayload.scheduledISO = scheduledTime.toISOString();
          parsed.confirmation = parsed.confirmation + ' — I will ping you in Slack at the right time.';
        }

        await fetch(baseUrl + '/.netlify/functions/slack-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackPayload)
        });

      } catch(reminderErr) {
        console.error('Reminder error:', reminderErr);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch(err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get response from Gemini' })
    };
  }
};
