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

  const { summary, description, start, end, calendarType } = body;

  if (!summary || !start || !calendarType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const isWork = calendarType === 'work';

  const clientId = isWork
    ? process.env.GOOGLE_WORK_CLIENT_ID
    : process.env.GOOGLE_FAMILY_CLIENT_ID;

  const clientSecret = isWork
    ? process.env.GOOGLE_WORK_CLIENT_SECRET
    : process.env.GOOGLE_FAMILY_CLIENT_SECRET;

  const refreshToken = isWork
    ? process.env.GOOGLE_WORK_REFRESH_TOKEN
    : process.env.GOOGLE_FAMILY_REFRESH_TOKEN;

  if (!refreshToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `${calendarType} calendar not connected yet` })
    };
  }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date(startTime.getTime() + 60 * 60 * 1000);

    const event = {
      summary,
      description: description || '',
      start: { dateTime: startTime.toISOString(), timeZone: 'America/Denver' },
      end: { dateTime: endTime.toISOString(), timeZone: 'America/Denver' }
    };

    const calResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    );

    const calData = await calResponse.json();

    if (!calResponse.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Calendar API error', detail: calData.error?.message })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        eventId: calData.id,
        eventLink: calData.htmlLink,
        calendar: calendarType
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
