const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listrepos')
        .setDescription('List all configured repositories'),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const configPath = path.join(__dirname, '..', '..', 'config', 'discord-structure.json');
            const data = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(data);

            const repoCategories = config.categories.filter(cat =>
                cat.name.includes('📦')
            );

            if (repoCategories.length === 0) {
                await interaction.editReply('No repositories configured.');
                return;
            }

            const repoEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📦 Configured Repositories')
                .setDescription('List of all configured repository categories');

            for (const cat of repoCategories) {
                const isPrivate = cat.permissions?.some(p => p.role === '@everyone' && p.deny);
                const prefix = cat.channels[0].name.split('-')[0];
                repoEmbed.addFields({
                    name: cat.name,
                    value: `Type: ${isPrivate ? '🔒 Private' : '🌐 Public'}\nPrefix: \`${prefix}-\`\nChannels: ${cat.channels.length}`,
                    inline: true
                });
            }

            await interaction.editReply({ embeds: [repoEmbed] });
        } catch (error) {
            console.error('Error listing repos:', error);
            await interaction.editReply(`❌ Error listing repositories: ${error.message}`);
        }
    }
};
