const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Base64 } = require('base64-string');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.get('/quickbooksAuth', (req, res) => {
  const { JWT_SECRET, QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_SCOPES } = process.env;

  if (!JWT_SECRET || !QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET || !QUICKBOOKS_SCOPES) {
    return res.status(500).json({ error: 'Missing environment variables for QuickBooks OAuth' });
  }

  const b64 = new Base64();
  const encodedString = b64.urlEncode(
    jwt.sign({ id: 'some-shop-id' }, JWT_SECRET, { expiresIn: "1h" })
  );

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${QUICKBOOKS_CLIENT_ID}&redirect_uri=${process.env.VERCEL_URL}/quickbooksCallback&response_type=code&scope=${QUICKBOOKS_SCOPES}&state=${encodedString}`;

  res.redirect(authUrl);
});

app.get('/quickbooksCallback', async (req, res) => {
  const { code, state } = req.query;
  const { JWT_SECRET, QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET } = process.env;

  try {
    const tokenData = await axios.post("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.VERCEL_URL}/quickbooksCallback`,
      client_id: QUICKBOOKS_CLIENT_ID,
      client_secret: QUICKBOOKS_CLIENT_SECRET
    });

    // Store tokenData in your database or session
    res.status(200).send('Authorization successful');
  } catch (error) {
    console.error('Error getting access token:', error.response.data);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
