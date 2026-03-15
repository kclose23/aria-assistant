module.exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let text;
  try {
    const body = JSON.parse(event.body);
    text = body.text;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing text' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Gemini API key not configured' }) };
  }

  const now = new Date();
  const baseUrl = 'https://sprightly-lebkuchen-41b633.netlify.app';

  const prompt = `
You are ARIA, a smart productivity assistant for Kyler, located in Salt Lake City, Utah (Mountain Time, UTC-6, daylight saving active).
Current date: ${now.toLocaleDateString('en-US', {timeZone: 'America/Denver', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}
Current time: ${now.toLocaleTimeString('en-US', {timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit'})}

The user said: "${text}"

Current time in Mountain Time: ${now.toLocaleTimeString('en-US', {timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit'})}
For REMINDER types, always calculate the exact scheduledISO datetime based on current time. "In 5 minutes" = current time + 5 minutes. "Tomorrow at 2pm" = tomorrow's date at 14:00:00-06:00. ALWAYS include scheduledISO.

Identify the TYPE. Choose ONE of: REMINDER, CALENDAR, EMAIL, TASK, BRAIN_DUMP

For CALENDAR events:
- calendarType: "work" (meetings, calls, clients, travel, deadlines) or "family" (kids, personal, errands, medical) or "ask" if ambiguous
- startISO and endISO: always use -06:00 offset (Mountain Time)
- Example: "Monday at 2pm" = "2026-03-16T14:00:00-06:00"
- recurrence: include if user says "every", "weekly", "daily", "monthly" etc. Otherwise set to null.
- attendees: array of email addresses mentioned. Otherwise empty array [].

For EMAIL:
- accountType: "work" (colleagues, clients, business) or "family" (personal, friends, family)
- Extract: recipient name, recipient email if mentioned, subject, key points to include
- If no email address mentioned, set recipientEmail to null
- Draft a professional, warm, concise email based on the key points

Reply in this exact JSON format with no extra text:

For CALENDAR:
{
  "type": "CALENDAR",
  "details": {
    "what": "team standup",
    "when": "every Monday at 9am",
    "calendarType": "work",
    "startISO": "2026-03-16T09:00:00-06:00",
    "endISO": "2026-03-16T10:00:00-06:00",
    "recurrence": "every Monday",
    "attendees": ["john@company.com"]
  },
  "confirmation": "📅 Got it! Adding weekly team standup to your Work Calendar every Monday at 9am."
}

For EMAIL:
{
  "type": "EMAIL",
  "details": {
    "accountType": "work",
    "recipientName": "Sarah",
    "recipientEmail": "sarah@company.com",
    "subject": "Proposal Update",
    "emailBody": "Hi Sarah,\\n\\nI wanted to reach out regarding the proposal.\\n\\nBest,\\nKyler"
  },
  "confirmation": "✉️ I've drafted an email to Sarah. Review it below and confirm to send."
}

For REMINDER:
{
  "type": "REMINDER",
  "details": {
    "what": "call dentist",
    "when": "tomorrow at 10am",
    "who": ""
  },
  "confirmation": "⏰ Got it! I'll remind you to call the dentist tomorrow at 10am."
}

For TASK, BRAIN_DUMP use REMINDER format.
Only return the JSON. No extra text.
`;

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok || !data.candidates?.[0]) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Gemini API error', detail: data.error?.message ?? 'No candidates returned' })
      };
    }

    const raw = data.candidates[0].content.parts[0].text;
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Handle CALENDAR
    if (parsed.type === 'CALENDAR' && parsed.details?.calendarType !== 'ask') {
      const calRes = await fetch(baseUrl + '/.netlify/functions/calendar-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: parsed.details.what,
          description: 'Added by ARIA from voice: "' + text + '"',
          start: parsed.details.startISO,
          end: parsed.details.endISO,
          calendarType: parsed.details.calendarType,
          recurrence: parsed.details.recurrence || null,
          attendees: parsed.details.attendees || []
        })
      });
      const calData = await calRes.json();
      if (calData.success) {
        var calLabel = parsed.details.calendarType === 'work' ? '💼 Work' : '👨‍👩‍👧 Family';
        var recurringLabel = calData.recurring ? ' (repeating)' : '';
        var attendeeLabel = calData.attendeeCount > 0 ? ' — ' + calData.attendeeCount + ' attendee(s) invited' : '';
        parsed.confirmation = '📅 Done! "' + parsed.details.what + '" added to your ' + calLabel + ' Calendar' + recurringLabel + attendeeLabel + '.';
        parsed.calendarLink = calData.eventLink;
      } else {
        parsed.confirmation = '⚠️ Understood the event but could not add it. Make sure your calendar is connected.';
      }
    }

    // Handle REMINDER — schedule via Slack
    if (parsed.type === 'REMINDER' && parsed.details) {
      try {
        const whenText = (parsed.details.when || '').toLowerCase();
        const now2 = new Date();
        const mtNow = new Date(now2.toLocaleString('en-US', { timeZone: 'America/Denver' }));
        let scheduledTime = null;

        const inMinutes = whenText.match(/in (\d+) minute/);
        const inHours = whenText.match(/in (\d+) hour/);
        const atTime = whenText.match(/(\d+):?(\d*)\s*(am|pm)/i);
        const tomorrow = whenText.includes('tomorrow');

        if (inMinutes) {
          scheduledTime = new Date(now2.getTime() + parseInt(inMinutes[1]) * 60000);
        } else if (inHours) {
          scheduledTime = new Date(now2.getTime() + parseInt(inHours[1]) * 3600000);
        } else if (atTime) {
          let hours = parseInt(atTime[1]);
          const minutes = parseInt(atTime[2] || '0');
          const ampm = atTime[3].toLowerCase();
          if (ampm === 'pm' && hours !== 12) hours += 12;
          if (ampm === 'am' && hours === 12) hours = 0;
          scheduledTime = new Date(mtNow);
          scheduledTime.setHours(hours, minutes, 0, 0);
          if (tomorrow) scheduledTime.setDate(scheduledTime.getDate() + 1);
          if (scheduledTime <= now2) scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        const slackPayload = {
          message: parsed.confirmation,
          emoji: '⏰'
        };

        if (scheduledTime && scheduledTime > new Date(now2.getTime() + 60000)) {
          slackPayload.scheduledISO = scheduledTime.toISOString();
          parsed.confirmation = parsed.confirmation + ' — I\'ll ping you in Slack at the right time ✓';
        }

        await fetch(baseUrl + '/.netlify/functions/slack-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackPayload)
        });

      } catch (err) {
        console.error('Reminder error:', err);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get response from Gemini' })
    };
  }
};
