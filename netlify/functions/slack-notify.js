module.exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { message, emoji, scheduledISO } = body;

  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing message' }) };
  }

  const botToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  try {
    // If scheduledISO is provided, use Slack's scheduled message API
    if (scheduledISO && botToken && channelId) {
      const postAt = Math.floor(new Date(scheduledISO).getTime() / 1000);
      const nowUnix = Math.floor(Date.now() / 1000);

      // Must be at least 60 seconds in the future for Slack scheduling
      if (postAt > nowUnix + 60) {
        const slackRes = await fetch('https://slack.com/api/chat.scheduleMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + botToken
          },
          body: JSON.stringify({
            channel: channelId,
            post_at: postAt,
            text: (emoji || '⏰') + ' *ARIA Reminder* — ' + message
          })
        });

        const slackData = await slackRes.json();

        if (slackData.ok) {
          return {
            statusCode: 200,
            body: JSON.stringify({ 
              success: true, 
              scheduled: true,
              scheduledTime: scheduledISO
            })
          };
        } else {
          console.error('Slack schedule error:', slackData.error);
        }
      }
    }

    // Fall back to immediate webhook post
    if (webhookUrl) {
      const slackRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: (emoji || '🧠') + ' *ARIA* — ' + message,
          mrkdwn: true
        })
      });

      if (!slackRes.ok) {
        return { statusCode: 502, body: JSON.stringify({ error: 'Slack webhook error' }) };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, scheduled: false })
      };
    }

    return { statusCode: 500, body: JSON.stringify({ error: 'No Slack config found' }) };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
