const express = require('express');
const axios = require('axios');
const uuid = require('uuid');
const session = require('express-session');
const moment = require('moment');
require('dotenv').config();

const app = express();

const clientId = process.env.QUICKBOOKS_CLIENT_ID;
const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
const redirectUri = `${process.env.RENDER_URL}/callback`;
const baseUrl = 'https://quickbooks.api.intuit.com';

// Middleware to handle session
app.use(session({
    secret: ImSmokingqwerty,
    resave: false,
    saveUninitialized: true
}));

// Function to get access token
async function getAccessToken(authCode) {
    const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
    };
    const payload = new URLSearchParams({
        "grant_type": "authorization_code",
        "code": authCode,
        "redirect_uri": redirectUri,
        "client_id": clientId,
        "client_secret": clientSecret
    });

    try {
        const response = await axios.post(tokenUrl, payload, { headers });
        return response.data;
    } catch (error) {
        console.error('Error getting access token:', error.response.data);
        throw new Error('Error getting access token');
    }
}

// Function to get transaction list for the last 2 days
async function getTransactionList(accessToken, realmId) {
    const startDate = moment().subtract(2, 'days').format('YYYY-MM-DD');
    const endDate = moment().format('YYYY-MM-DD');
    const url = `${baseUrl}/v3/company/${realmId}/reports/TransactionList?start_date=${startDate}&end_date=${endDate}`;
    const headers = {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
    };

    try {
        const response = await axios.get(url, { headers });
        if (response.status !== 200) {
            throw new Error(`API request failed with status code ${response.status}`);
        }
        return response.data;
    } catch (error) {
        console.error('Error fetching transaction list:', error.response.data);
        throw new Error('Error fetching transaction list');
    }
}

// Route to initiate OAuth2 flow
app.get('/', (req, res) => {
    res.send('Welcome to the QuickBooks OAuth2 demo. <a href="/authorize">Click here to authorize</a>');
});

app.get('/authorize', (req, res) => {
    const state = uuid.v4();
    req.session.oauthState = state;
    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${redirectUri}&state=${state}`;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const receivedState = req.query.state;
    const storedState = req.session.oauthState;

    if (receivedState !== storedState) {
        return res.status(400).send("Error: Invalid state");
    }

    const authCode = req.query.code;
    const realmId = req.query.realmId;

    try {
        const tokenData = await getAccessToken(authCode);
        req.session.accessToken = tokenData.access_token;
        req.session.realmId = realmId;
        res.send('Authorization successful. Now you can fetch transactions.');
    } catch (error) {
        console.error('Error in callback:', error.message);
        res.status(400).send(`Error: ${error.message}`);
    }
});

// Endpoint to fetch transactions
app.get('/fetchTransactions', async (req, res) => {
    const accessToken = req.session.accessToken;
    const realmId = req.session.realmId;

    if (!accessToken || !realmId) {
        return res.status(400).send("Error: Not authenticated with QuickBooks");
    }

    try {
        const transactions = await getTransactionList(accessToken, realmId);
        console.log('Transactions fetched:', JSON.stringify(transactions, null, 2));
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error.message);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
