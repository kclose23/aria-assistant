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
You are ARIA, a smart productivity assistant. 
The user is located in Salt Lake City, Utah (Mountain Time, UTC-6 during daylight saving which is currently active).
The current date is: ${now.toLocaleDateString('en-US', {timeZone: 'America/Denver', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}
The current time is: ${now.toLocaleTimeString('en-US', {timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit'})}
Today is ${now.toLocaleDateString('en-US', {timeZone: 'America/Denver', weekday: 'long'})}.
Monday is ${new Date(now.getTime()).toLocaleDateString('en-US', {timeZone: 'America/Denver'})}.

CRITICAL TIMEZONE RULES:
- All times the user says are in Mountain Time (America/Denver, currently UTC-6)
- When generating startISO and endISO, append "-06:00" at the end NOT "Z" or "+00:00"
- Example: if user says "Monday at 2pm", output startISO as "2026-03-16T14:00:00-06:00"
- NEVER output UTC times. ALWAYS use -06:00 offset.
- Today is Saturday March 14. Monday = March 16. Tuesday = March 17.
The user's name is Kyler.

A user just said the following by voice:
"${text}"

Your job is to:
1. Identify what TYPE of action this is. Choose ONE of: REMINDER, CALENDAR, EMAIL, TASK, BRAIN_DUMP
2. Extract the key details (who, what, when, where if relevant)
3. If it's a CALENDAR event, determine which calendar it belongs to:
   - "work" calendar: meetings, calls, client appointments, travel, conferences, deadlines, work tasks
   - "family" calendar: kids activities, school events, family events, holidays, personal errands, personal to-dos, medical appointments
   - "ask" if genuinely ambiguous
4. If it's a CALENDAR event, extract a proper start datetime in ISO 8601 format based on today's date
5. Respond with a short friendly confirmation

Reply in this exact JSON format with no extra text:
{
  "type": "CALENDAR",
  "details": {
    "what": "dentist appointment",
    "when": "Tuesday at 2pm",
    "who": "",
    "calendarType": "family",
    "startISO": "2026-03-17T14:00:00",
    "endISO": "2026-03-17T15:00:00"
  },
  "confirmation": "📅 Got it! I'll add your dentist appointment to your Family Calendar on Tuesday at 2pm."
}

For non-calendar types use:
{
  "type": "REMINDER",
  "details": {
    "what": "call John",
    "when": "tomorrow at 2pm",
    "who": "John"
  },
  "confirmation": "⏰ Got it! I'll remind you to call John tomorrow at 2pm."
}

Only return the JSON. No extra text.
`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

    // If it's a calendar event, add it automatically
    if (parsed.type === 'CALENDAR' && parsed.details?.calendarType !== 'ask') {
      const calendarType = parsed.details.calendarType;
      const baseUrl = process.env.URL || 'https://sprightly-lebkuchen-41b633.netlify.app';

      const calRes = await fetch(`${baseUrl}/.netlify/functions/calendar-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: parsed.details.what,
          description: `Added by ARIA from voice: "${text}"`,
          start: parsed.details.startISO,
          end: parsed.details.endISO,
          calendarType
        })
      });

      const calData = await calRes.json();

      if (calData.success) {
        parsed.confirmation = `📅 Done! "${parsed.details.what}" has been added to your ${calendarType === 'work' ? '💼 Work' : '👨‍👩‍👧 Family'} Calendar.`;
        parsed.calendarLink = calData.eventLink;
      } else {
        parsed.confirmation = `⚠️ I understood the event but couldn't add it to your calendar yet. Make sure your calendar is connected.`;
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
