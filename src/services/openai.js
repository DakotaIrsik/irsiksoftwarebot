const axios = require('axios');
require('dotenv').config();

/**
 * Ask GPT a question about Unity/NeonLadder development
 * @param {string} question - The question to ask
 * @returns {Promise<string>} - GPT's response
 */
async function askGPT(question) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-5-nano',
            messages: [
                {
                    role: 'system',
                    content: 'You are a Unity game development expert helping with NeonLadder, a 2.5D roguelite platformer. Provide concise, actionable advice.'
                },
                {
                    role: 'user',
                    content: question
                }
            ],
            max_tokens: 500,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API Error:', error);
        return 'Sorry, I could not connect to GPT right now. Please try again later.';
    }
}

module.exports = {
    askGPT
};
