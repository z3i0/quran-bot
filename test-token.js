const { REST, Routes } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

console.log('CLIENT_ID:', CLIENT_ID);
console.log('TOKEN starts with:', TOKEN ? TOKEN.substring(0, 10) + '...' : 'undefined');

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function test() {
    try {
        console.log('Fetching bot info...');
        const user = await rest.get(Routes.user());
        console.log('✅ Token is valid! Bot name:', user.username);
    } catch (error) {
        console.error('❌ Token is invalid or unauthorized:', error.message);
        if (error.rawError) console.error('Raw Error:', error.rawError);
    }
}

test();
