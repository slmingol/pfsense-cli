const axios = require('axios');
const https = require('https');
require('dotenv').config();

/**
 * Create and configure pfSense API client
 */
function getPfSenseClient() {
  const host = process.env.PFSENSE_HOST;
  const apiKey = process.env.PFSENSE_API_KEY;
  const apiSecret = process.env.PFSENSE_API_SECRET;
  
  if (!host || !apiKey || !apiSecret) {
    throw new Error(
      'Missing required environment variables. Please set PFSENSE_HOST, PFSENSE_API_KEY, and PFSENSE_API_SECRET'
    );
  }
  
  // Create axios instance with pfSense configuration
  const client = axios.create({
    baseURL: host,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-api-key': apiSecret
    },
    // Allow self-signed certificates if needed
    httpsAgent: new https.Agent({
      rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
    })
  });
  
  // Add response interceptor for better error handling
  client.interceptors.response.use(
    response => response,
    error => {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error(`pfSense API Error: ${error.response.status} - ${error.response.statusText}`);
        if (error.response.data?.message) {
          console.error(`Message: ${error.response.data.message}`);
        }
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response from pfSense. Check your PFSENSE_HOST and network connection.');
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Error:', error.message);
      }
      return Promise.reject(error);
    }
  );
  
  return client;
}

module.exports = {
  getPfSenseClient
};
