exports.handler = async function(event) {
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
  const prompt = `
You are ARIA, a smart productivity assistant for Kyler, located in Salt Lake City, Utah (Mountain Time, UTC-6, daylight saving active).
Current date: ${now.toLocaleDateString('en-US', {timeZone: 'America/Denver', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}
Current time: ${now.toLocaleTimeString('en-US', {timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit'})}

The user said: "${text}"

Identify the TYPE. Choose ONE of: REMINDER, CALENDAR, EMAIL, TASK, BRAIN_DUMP

For CALENDAR events:
- calendarType: "work" (meetings, calls, clients, travel, deadlines) or "family" (kids, personal, errands, medical) or "ask" if ambiguous
- startISO and endISO: always use -06:00 offset (Mountain Time)
- Example: "Monday at 2pm" = "2026-03-16T14:00:00-06:00"

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
    "when": "Monday at 9am",
    "calendarType": "work",
    "startISO": "2026-03-16T09:00:00-06:00",
    "endISO": "2026-03-16T10:00:00-06:00"
  },
  "confirmation": "📅 Got it! Adding team standup to your Work Calendar on Monday at 9am."
}

For EMAIL:
{
  "type": "EMAIL",
  "details": {
    "accountType": "work",
    "recipientName": "Sarah",
    "recipientEmail": "sarah@company.com",
    "subject": "Proposal Update",
    "emailBody": "Hi Sarah,\n\nI wanted to reach out regarding the proposal. We are targeting end of month for completion and would love to get your feedback by Friday if possible.\n\nPlease let me know if you have any questions.\n\nBest,\nKyler"
  },
  "confirmation": "✉️ I've drafted an email to Sarah about the proposal. Review it below and confirm to send."
}

For REMINDER, TASK, BRAIN_DUMP:
{
  "type": "REMINDER",
  "details": {
    "what": "call dentist",
    "when": "tomorrow at 10am",
    "who": ""
  },
  "confirmation": "⏰ Got it! I'll remind you to call the dentist tomorrow at 10am."
}

Only return the JSON. No extra text.
`;

  const baseUrl = 'https://sprightly-lebkuchen-41b633.netlify.app';

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
          calendarType: parsed.details.calendarType
        })
      });
      const calData = await calRes.json();
      if (calData.success) {
        parsed.confirmation = '📅 Done! "' + parsed.details.what + '" added to your ' + (parsed.details.calendarType === 'work' ? '💼 Work' : '👨‍👩‍👧 Family') + ' Calendar.';
        parsed.calendarLink = calData.eventLink;
      } else {
        parsed.confirmation = '⚠️ Understood the event but could not add it. Make sure your calendar is connected.';
      }
    }

// Handle REMINDER — store for scheduled delivery
    if (parsed.type === 'REMINDER' && parsed.details) {
      try {
        const scheduledISO = parsed.details.scheduledISO || null;
        
        if (scheduledISO) {
          await fetch(baseUrl + '/.netlify/functions/reminder-store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              what: parsed.details.what,
              when: parsed.details.when,
              confirmation: parsed.confirmation,
              scheduledISO: scheduledISO
            })
          });
          parsed.confirmation = parsed.confirmation + ' — I\'ll remind you in Slack at the right time.';
        } else {
          await fetch(baseUrl + '/.netlify/functions/slack-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: parsed.confirmation,
              emoji: '⏰'
            })
          });
        }
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
