const { getStore } = require('@netlify/blobs');

module.exports.config = { schedule: "* * * * *" };

module.exports.handler = async function() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { statusCode: 500, body: 'No webhook' };

  try {
    const store = getStore('reminders');
    const { blobs } = await store.list();
    const now = new Date();

    for (const blob of blobs) {
      const reminder = await store.get(blob.key, { type: 'json' });
      if (!reminder || reminder.fired) continue;

      const scheduledTime = new Date(reminder.scheduledISO);
      const diffMs = now - scheduledTime;

      if (diffMs >= 0 && diffMs < 120000) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*⏰ ARIA Reminder*\n' + reminder.confirmation
                }
              }
            ]
          })
        });

        await store.setJSON(blob.key, { ...reminder, fired: true });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
