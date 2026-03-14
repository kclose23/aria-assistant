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

  const prompt = `
You are ARIA, a smart productivity assistant. A user just said the following by voice:
"${text}"

Your job is to:
1. Identify what TYPE of action this is. Choose ONE of: REMINDER, CALENDAR, EMAIL, TASK, BRAIN_DUMP
2. Extract the key details (who, what, when, where if relevant)
3. Respond with a short, friendly one-sentence confirmation of what you will do

Reply in this exact JSON format:
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
