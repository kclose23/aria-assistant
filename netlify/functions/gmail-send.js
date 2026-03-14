async function getAccessToken(clientId, clientSecret, refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json();
  return data.access_token;
}

function makeEmail(to, subject, body, fromName) {
  const emailLines = [
    'From: ' + fromName,
    'To: ' + to,
    'Subject: ' + subject,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ];
  const email = emailLines.join('\r\n');
  return Buffer.from(email).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { to, subject, emailBody, accountType } = body;

  if (!to || !subject || !emailBody || !accountType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const isWork = accountType === 'work';
  const clientId = isWork ? process.env.GOOGLE_WORK_CLIENT_ID : process.env.GOOGLE_FAMILY_CLIENT_ID;
  const clientSecret = isWork ? process.env.GOOGLE_WORK_CLIENT_SECRET : process.env.GOOGLE_FAMILY_CLIENT_SECRET;
  const refreshToken = isWork ? process.env.GOOGLE_WORK_REFRESH_TOKEN : process.env.GOOGLE_FAMILY_REFRESH_TOKEN;
  const fromName = isWork ? 'Kyler (Work)' : 'Kyler';

  if (!refreshToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: accountType + ' account not connected yet' })
    };
  }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
    const rawEmail = makeEmail(to, subject, emailBody, fromName);

    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: rawEmail })
    });

    const gmailData = await gmailRes.json();

    if (!gmailRes.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Gmail API error', detail: gmailData.error?.message })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, messageId: gmailData.id })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
