const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askGPT } = require('../services/openai');
const { checkPermission } = require('../services/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('askgpt')
        .setDescription('Ask GPT about Unity/NeonLadder development')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question for GPT')
                .setRequired(true)
        ),

    async execute(interaction) {
        // Check permissions
        const permission = await checkPermission(interaction, 'askgpt');
        if (!permission.allowed) {
            return interaction.reply({ content: `❌ ${permission.reason}`, ephemeral: true });
        }

        await interaction.deferReply();
        const question = interaction.options.getString('question');
        const gptResponse = await askGPT(question);

        const gptEmbed = new EmbedBuilder()
            .setColor('#00D4FF')
            .setTitle('🤖 GPT-4o Analysis')
            .setDescription(gptResponse)
            .addFields(
                { name: '❓ Question', value: question, inline: false }
            )
            .setFooter({ text: 'NeonLadder Dual-AI System' })
            .setTimestamp();

        await interaction.editReply({ embeds: [gptEmbed] });
    }
};
