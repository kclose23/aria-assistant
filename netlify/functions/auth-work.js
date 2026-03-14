exports.handler = async function() {
  const clientId = process.env.GOOGLE_WORK_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_WORK_REDIRECT_URI;
  
  const scope = encodeURIComponent(
    'https://www.googleapis.com/auth/calendar.events'
  );
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
  
  return {
    statusCode: 302,
    headers: { Location: authUrl }
  };
};
