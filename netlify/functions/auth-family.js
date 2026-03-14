exports.handler = async function() {
  const clientId = process.env.GOOGLE_FAMILY_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_FAMILY_REDIRECT_URI;
  
  const scope = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.send'
  ].join(' ');
  
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent(scope) +
    '&access_type=offline' +
    '&prompt=consent';
  
  return {
    statusCode: 302,
    headers: { Location: authUrl }
  };
};
