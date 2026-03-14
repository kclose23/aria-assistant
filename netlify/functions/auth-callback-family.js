exports.handler = async function(event) {
  const code = event.queryStringParameters?.code;
  
  if (!code) {
    return { statusCode: 400, body: 'Missing authorization code' };
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_FAMILY_CLIENT_ID,
        client_secret: process.env.GOOGLE_FAMILY_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_FAMILY_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await response.json();

    if (!tokens.refresh_token) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<html><body style="background:#0f0f1a;color:#f0f0f0;font-family:sans-serif;text-align:center;padding:60px">
          <h2>⚠️ No refresh token received</h2>
          <p>Please go back and try connecting again.</p>
          <a href="/connect.html" style="color:#3ecfcf">Try Again</a>
        </body></html>`
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body style="background:#0f0f1a;color:#f0f0f0;font-family:sans-serif;text-align:center;padding:60px">
        <h1>✅ Family Calendar Connected!</h1>
        <p style="color:#aaa">Copy this refresh token and add it to Netlify environment variables as <strong>GOOGLE_FAMILY_REFRESH_TOKEN</strong></p>
        <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:20px;margin:30px auto;max-width:600px;word-break:break-all;font-family:monospace;font-size:0.85rem">
          ${tokens.refresh_token}
        </div>
        <a href="/connect.html" style="color:#3ecfcf">Back to Connect Page</a>
      </body></html>`
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: `Error: ${err.message}`
    };
  }
};
