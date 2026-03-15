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

function buildRecurrenceRule(recurrence) {
  if (!recurrence) return null;
  const r = recurrence.toLowerCase();
  if (r.includes('every day') || r.includes('daily')) return 'RRULE:FREQ=DAILY';
  if (r.includes('every weekday')) return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (r.includes('every monday') || r === 'weekly on monday') return 'RRULE:FREQ=WEEKLY;BYDAY=MO';
  if (r.includes('every tuesday')) return 'RRULE:FREQ=WEEKLY;BYDAY=TU';
  if (r.includes('every wednesday')) return 'RRULE:FREQ=WEEKLY;BYDAY=WE';
  if (r.includes('every thursday')) return 'RRULE:FREQ=WEEKLY;BYDAY=TH';
  if (r.includes('every friday')) return 'RRULE:FREQ=WEEKLY;BYDAY=FR';
  if (r.includes('every saturday')) return 'RRULE:FREQ=WEEKLY;BYDAY=SA';
  if (r.includes('every sunday')) return 'RRULE:FREQ=WEEKLY;BYDAY=SU';
  if (r.includes('every week') || r.includes('weekly')) return 'RRULE:FREQ=WEEKLY';
  if (r.includes('every month') || r.includes('monthly')) return 'RRULE:FREQ=MONTHLY';
  if (r.includes('every year') || r.includes('annually')) return 'RRULE:FREQ=YEARLY';
  if (r.includes('every monday') && r.includes('wednesday')) return 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE';
  if (r.includes('every tuesday') && r.includes('thursday')) return 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH';
  return null;
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

  const { summary, description, start, end, calendarType, attendees, recurrence } = body;

  if (!summary || !start || !calendarType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const isWork = calendarType === 'work';
  const clientId = isWork ? process.env.GOOGLE_WORK_CLIENT_ID : process.env.GOOGLE_FAMILY_CLIENT_ID;
  const clientSecret = isWork ? process.env.GOOGLE_WORK_CLIENT_SECRET : process.env.GOOGLE_FAMILY_CLIENT_SECRET;
  const refreshToken = isWork ? process.env.GOOGLE_WORK_REFRESH_TOKEN : process.env.GOOGLE_FAMILY_REFRESH_TOKEN;

  if (!refreshToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: calendarType + ' calendar not connected yet' })
    };
  }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date(startTime.getTime() + 60 * 60 * 1000);

    const calEvent = {
      summary,
      description: description || '',
      start: { dateTime: startTime.toISOString(), timeZone: 'America/Denver' },
      end: { dateTime: endTime.toISOString(), timeZone: 'America/Denver' }
    };

    const rrule = buildRecurrenceRule(recurrence);
    if (rrule) {
      calEvent.recurrence = [rrule];
    }

    if (attendees && attendees.length > 0) {
      calEvent.attendees = attendees.map(function(email) {
        return { email: email.trim() };
      });
      calEvent.guestsCanModify = false;
      calEvent.guestsCanInviteOthers = false;
    }

    const calResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(calEvent)
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
        calendar: calendarType,
        recurring: !!rrule,
        attendeeCount: attendees ? attendees.length : 0
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
