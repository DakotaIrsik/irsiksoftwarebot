const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removerepo')
        .setDescription('Remove a repository category (Admin only)')
        .addStringOption(option =>
            option.setName('prefix')
                .setDescription('Repository prefix to remove')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        const removePrefix = interaction.options.getString('prefix').toLowerCase();

        try {
            const configPath = path.join(__dirname, '..', '..', 'config', 'discord-structure.json');
            const data = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(data);

            const categoryIndex = config.categories.findIndex(cat =>
                cat.name.toLowerCase().includes(removePrefix)
            );

            if (categoryIndex === -1) {
                await interaction.editReply(`❌ Repository with prefix "${removePrefix}" not found.`);
                return;
            }

            const removed = config.categories.splice(categoryIndex, 1)[0];
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

            await interaction.editReply(
                `✅ Repository configuration removed: ${removed.name}\n\n` +
                `**Note**: This only removes it from the config. To delete Discord channels, use Discord's interface.`
            );
        } catch (error) {
            console.error('Error removing repo:', error);
            await interaction.editReply(`❌ Error removing repository: ${error.message}`);
        }
    }
};
