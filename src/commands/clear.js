const { SlashCommandBuilder } = require('discord.js');
const { clearConversation } = require('../handlers/messageHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear conversation history for current channel'),

    async execute(interaction) {
        clearConversation(interaction.channelId);
        await interaction.reply('✅ Conversation history cleared for this channel.');
    }
};
