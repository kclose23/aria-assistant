async function getCalendarEvents(clientId, clientSecret, refreshToken, calendarType) {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const calRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
      '?timeMin=' + encodeURIComponent(startOfDay.toISOString()) +
      '&timeMax=' + encodeURIComponent(endOfDay.toISOString()) +
      '&singleEvents=true&orderBy=startTime',
      {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      }
    );

    const calData = await calRes.json();
    const events = (calData.items || []).map(function(e) {
      const start = e.start.dateTime || e.start.date;
      const time = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Denver'
          })
        : 'All day';
      return { time: time, title: e.summary || 'Untitled', calendarType: calendarType };
    });

    return events;
  } catch (err) {
    console.error('Calendar fetch error:', err);
    return [];
  }
}

exports.handler = async function(event) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Slack webhook not configured' }) };
  }

  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      timeZone: 'America/Denver',
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    const workEvents = await getCalendarEvents(
      process.env.GOOGLE_WORK_CLIENT_ID,
      process.env.GOOGLE_WORK_CLIENT_SECRET,
      process.env.GOOGLE_WORK_REFRESH_TOKEN,
      'work'
    );

    const familyEvents = await getCalendarEvents(
      process.env.GOOGLE_FAMILY_CLIENT_ID,
      process.env.GOOGLE_FAMILY_CLIENT_SECRET,
      process.env.GOOGLE_FAMILY_REFRESH_TOKEN,
      'family'
    );

    const allEvents = [...workEvents, ...familyEvents].sort(function(a, b) {
      return a.time.localeCompare(b.time);
    });

    let calendarSection = '';
    if (allEvents.length === 0) {
      calendarSection = '📭 No events scheduled today — enjoy the open day!\n';
    } else {
      calendarSection = '*📅 TODAY\'S SCHEDULE*\n';
      allEvents.forEach(function(e) {
        const icon = e.calendarType === 'work' ? '💼' : '👨‍👩‍👧';
        calendarSection += icon + ' ' + e.time + ' — ' + e.title + '\n';
      });
    }

    const greetings = [
      'Good morning! Let\'s make today count. 💪',
      'Rise and shine! You\'ve got this. ⚡',
      'Morning! Big things happening today. 🚀',
      'Good morning! Ready to crush it? 🎯',
      'Morning Kyler! Here\'s what\'s ahead. 🧠'
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    const message = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🧠 ARIA Morning Briefing — ' + dateStr,
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: greeting
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: calendarSection
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🔗 <https://sprightly-lebkuchen-41b633.netlify.app|Open ARIA> to add tasks, events, or send emails by voice.'
          }
        }
      ]
    };

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!slackRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Slack API error' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, eventsFound: allEvents.length })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
