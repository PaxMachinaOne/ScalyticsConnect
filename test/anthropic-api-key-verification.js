// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
// Run with: node verify-anthropic-key.js

const axios = require('axios');
const dotenv = require('dotenv');
const readline = require('readline');

// Load environment variables
dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to verify an Anthropic API key
async function verifyAnthropicKey(apiKey) {
  try {
    console.log('Testing Anthropic API key...');
    
    // First try to access models endpoint
    try {
      const modelsResponse = await axios.get('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ API key successfully accessed models endpoint!');
      console.log('Available models:');
      console.log(JSON.stringify(modelsResponse.data, null, 2));
      return true;
    } catch (modelsError) {
      console.log('⚠️ Could not access models endpoint:', modelsError.response?.data || modelsError.message);
      
      // If models endpoint fails, try a simple chat completion as fallback
      try {
        console.log('Trying a simple chat completion...');
        const chatResponse = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-haiku-20240307',  // Try with the latest Haiku model
            max_tokens: 300,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Hello, Claude. Please respond with "API key is working correctly."'
                  }
                ]
              }
            ]
          },
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('✅ API key successfully made a chat completion!');
        console.log('Response:', chatResponse.data?.content?.[0]?.text || 'No text in response');
        return true;
      } catch (chatError) {
        console.log('❌ Chat completion also failed:', chatError.response?.data || chatError.message);
        
        // Print detailed error information
        if (chatError.response) {
          console.log('Status:', chatError.response.status);
          console.log('Headers:', chatError.response.headers);
          console.log('Data:', JSON.stringify(chatError.response.data, null, 2));
        }
        
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Error verifying API key:', error.message);
    return false;
  }
}

// Prompt for API key if not in environment variables
const promptForApiKey = () => {
  return new Promise((resolve) => {
    const envApiKey = process.env.ANTHROPIC_API_KEY;
    
    if (envApiKey) {
      console.log('Found Anthropic API key in environment variables.');
      rl.question('Use this key? (Y/n): ', (answer) => {
        if (answer.toLowerCase() !== 'n') {
          resolve(envApiKey);
        } else {
          rl.question('Enter your Anthropic API key: ', (key) => {
            resolve(key.trim());
          });
        }
      });
    } else {
      rl.question('Enter your Anthropic API key: ', (key) => {
        resolve(key.trim());
      });
    }
  });
};

// Main function
async function main() {
  try {
    const apiKey = await promptForApiKey();
    
    if (!apiKey) {
      console.log('No API key provided. Exiting.');
      rl.close();
      return;
    }
    
    const isValid = await verifyAnthropicKey(apiKey);
    
    if (isValid) {
      console.log('✅ Anthropic API key is valid and working!');
      
      // Suggest adding to .env if it's not already there
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('\nTo use this key in your application, add it to your .env file:');
        console.log('ANTHROPIC_API_KEY=' + apiKey);
      }
    } else {
      console.log('❌ Anthropic API key verification failed.');
      console.log('Please check that:');
      console.log('1. The API key is correct');
      console.log('2. Your API key has access to Claude models');
      console.log('3. You have sufficient quota/credits');
    }
  } catch (error) {
    console.error('Error in verification process:', error);
  } finally {
    rl.close();
  }
}

// Run the main function
main();
