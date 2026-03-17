const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { text } = JSON.parse(event.body);
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  const prompt = `You are ARIA, an AI assistant. Parse this request and return ONLY valid JSON.

User said: "${text}"

Return JSON in one of these formats:

For reminders: {"type":"REMINDER","task":"what to remember","datetime":"ISO datetime or null"}
For calendar events: {"type":"CALENDAR","title":"event title","datetime":"ISO datetime","duration":60,"description":"optional"}
For emails: {"type":"EMAIL","to":"email address","subject":"subject line","body":"email body"}
For Slack messages: {"type":"SLACK","message":"the message"}
For tasks: {"type":"TASK","task":"task description"}
For general questions: {"type":"GENERAL","response":"your response"}

Today is ${new Date().toISOString()}. Return ONLY the JSON object, no markdown, no explanation.`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
     path: `/v1/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const geminiResponse = JSON.parse(data);
          const rawText = geminiResponse.candidates[0].content.parts[0].text;
          const cleaned = rawText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed)
          });
        } catch (err) {
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ERROR', raw: data, error: err.message })
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ERROR', message: err.message })
      });
    });

    req.write(requestBody);
    req.end();
  });
};
