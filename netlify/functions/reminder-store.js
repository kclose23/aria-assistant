const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  const { what, when, confirmation, scheduledISO } = body;

  if (!what || !scheduledISO) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  try {
    const store = getStore('reminders');
    const id = 'reminder_' + Date.now();
    
    await store.setJSON(id, {
      id,
      what,
      when,
      confirmation,
      scheduledISO,
      createdAt: new Date().toISOString(),
      fired: false
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
