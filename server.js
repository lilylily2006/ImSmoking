const express = require('express');
const axios = require('axios');
const uuid = require('uuid');
const session = require('express-session');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();

const clientId = process.env.QUICKBOOKS_CLIENT_ID;
const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
const redirectUri = `${process.env.RENDER_URL}/callback`;
const baseUrl = 'https://quickbooks.api.intuit.com';

// Middleware to handle session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

// MongoDB setup
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectToMongo() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
    }
}

connectToMongo();

const db = client.db('quickbooks');
const tokensCollection = db.collection('tokens');

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

// Function to get transaction list
async function getTransactionList(accessToken, realmId) {
    const url = `${baseUrl}/v3/company/${realmId}/reports/TransactionList?start_date=${getTwoDaysAgo()}&end_date=${getToday()}`;
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

// Helper functions to get date ranges
function getToday() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function getTwoDaysAgo() {
    const today = new Date();
    today.setDate(today.getDate() - 2);
    return today.toISOString().split('T')[0];
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
        console.log('Tokens received:', tokenData);

        // Store tokens and realmId in MongoDB
        await tokensCollection.updateOne(
            { realmId },
            { $set: { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, realmId } },
            { upsert: true }
        );

        res.send('Authorization successful.');
    } catch (error) {
        console.error('Error in callback:', error.message);
        res.status(400).send(`Error: ${error.message}`);
    }
});

// Endpoint to fetch transactions
app.get('/fetch-transactions', async (req, res) => {
    try {
        const tokenData = await tokensCollection.findOne();

        if (!tokenData) {
            return res.status(404).send('No token data found.');
        }

        const transactions = await getTransactionList(tokenData.accessToken, tokenData.realmId);
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error.message);
        res.status(500).send('Error fetching transactions');
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
