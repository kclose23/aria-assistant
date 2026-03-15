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
    '- calendarType: work or family or ask\n' +
    '- startISO and endISO: always use -06:00 offset\n' +
    '- recurrence: include if recurring, else null\n' +
    '- attendees: array of emails, else []\n\n' +
    'For EMAIL: accountType work or family, draft a professional email\n\n' +
    'Reply ONLY in JSON. Examples:\n' +
    'CALENDAR: {"type":"CALENDAR","details":{"what":"meeting","when":"Monday 9am","calendarType":"work","startISO":"2026-03-16T09:00:00-06:00","endISO":"2026-03-16T10:00:00-06:00","recurrence":null,"attendees":[]},"confirmation":"Added meeting to Work Calendar."}\n' +
    'EMAIL: {"type":"EMAIL","details":{"accountType":"work","recipientName":"Sarah","recipientEmail":"sarah@co.com","subject":"Update","emailBody":"Hi Sarah,\\n\\nBest,\\nKyler"},"confirmation":"Drafted email to Sarah."}\n' +
    'REMINDER: {"type":"REMINDER","details":{"what":"call dentist","when":"tomorrow at 10am","who":""},"confirmation":"Got it! Will remind you tomorrow at 10am."}\n' +
    'Only return JSON. No extra text.';

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
        body: JSON.stringify({ error: 'Gemini API error' })
      };
    }

    var raw = data.candidates[0].content.parts[0].text;
    var cleaned = raw.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(cleaned);

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
        var attendeeLabel = calData.attendeeCount > 0 ? ' with ' + calData.attendeeCount + ' attendee(s)' : '';
        parsed.confirmation = 'Done! Added to ' + calLabel + ' Calendar' + recurringLabel + attendeeLabel + '.';
        parsed.calendarLink = calData.eventLink;
      } else {
        parsed.confirmation = 'Could not add event. Check calendar connection.';
      }
    }

    if (parsed.type === 'REMINDER' && parsed.details) {
      try {
        var whenText = (parsed.details.when || '').toLowerCase();
        var now2 = new Date();
        var mtNow = new Date(now2.toLocaleString('en-US', { timeZone: 'America/Denver' }));
        var scheduledTime = null;
        var inMinutes = whenText.match(/in (\d+) minute/);
        var inHours = whenText.match(/in (\d+) hour/);
        var atTime = whenText.match(/(\d+):?(\d*)\s*(am|pm)/i);
        var isTomorrow = whenText.includes('tomorrow');

        if (inMinutes) {
          scheduledTime = new Date(now2.getTime() + parseInt(inMinutes[1]) * 60000);
        } else if (inHours) {
          scheduledTime = new Date(now2.getTime() + parseInt(inHours[1]) * 3600000);
        } else if (atTime) {
          var hrs = parseInt(atTime[1]);
          var mins = parseInt(atTime[2] || '0');
          var ampm = atTime[3].toLowerCase();
          if (ampm === 'pm' && hrs !== 12) hrs += 12;
          if (ampm === 'am' && hrs === 12) hrs = 0;
          scheduledTime = new Date(mtNow);
          scheduledTime.setHours(hrs, mins, 0, 0);
          if (isTomorrow) scheduledTime.setDate(scheduledTime.getDate() + 1);
          if (scheduledTime <= now2) scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        var slackPayload = { message: parsed.confirmation, emoji: '⏰' };
        if (scheduledTime && scheduledTime > new Date(now2.getTime() + 60000)) {
          slackPayload.scheduledISO = scheduledTime.toISOString();
          parsed.confirmation = parsed.confirmation + ' Slack reminder scheduled.';
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
