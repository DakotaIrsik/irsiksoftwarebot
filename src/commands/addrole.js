const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('Add a custom role (Admin only)')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Role name')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Hex color code (e.g., #FF0000)')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('mentionable')
                .setDescription('Can the role be mentioned?')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('hoisted')
                .setDescription('Display role separately in member list?')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        const roleName = interaction.options.getString('name');
        const color = interaction.options.getString('color');
        const mentionable = interaction.options.getBoolean('mentionable') ?? false;
        const hoisted = interaction.options.getBoolean('hoisted') ?? false;

        try {
            const configPath = path.join(__dirname, '..', '..', 'config', 'discord-structure.json');
            const data = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(data);

            const exists = config.roles.find(r => r.name === roleName);
            if (exists) {
                await interaction.editReply(`❌ Role "${roleName}" already exists in configuration.`);
                return;
            }

            const newRole = {
                name: roleName,
                color: color,
                permissions: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                mentionable: mentionable,
                hoist: hoisted
            };

            config.roles.push(newRole);
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

            await interaction.editReply(
                `✅ Role "${roleName}" added to configuration!\n` +
                `**Color**: ${color}\n` +
                `**Mentionable**: ${mentionable ? 'Yes' : 'No'}\n` +
                `**Hoisted**: ${hoisted ? 'Yes' : 'No'}\n\n` +
                `Run \`/setup\` to create the role in Discord.`
            );
        } catch (error) {
            console.error('Error adding role:', error);
            await interaction.editReply(`❌ Error adding role: ${error.message}`);
        }
    }
};
