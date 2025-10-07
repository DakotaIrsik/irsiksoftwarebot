const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addrepo')
        .setDescription('Add a new repository category (Admin only)')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Repository name')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('visibility')
                .setDescription('Repository visibility')
                .setRequired(false)
                .addChoices(
                    { name: 'Public', value: 'public' },
                    { name: 'Private', value: 'private' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        const addRepoName = interaction.options.getString('name');
        const visibility = interaction.options.getString('visibility') || 'public';
        const isPrivate = visibility === 'private';
        const prefix = addRepoName.toLowerCase().replace(/\s+/g, '');

        try {
            const configPath = path.join(__dirname, '..', '..', 'config', 'discord-structure.json');
            const data = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(data);

            const exists = config.categories.find(cat =>
                cat.name.toLowerCase().includes(prefix)
            );

            if (exists) {
                await interaction.editReply(`❌ A category for "${addRepoName}" already exists.`);
                return;
            }

            const newCategory = {
                name: `📦 ${addRepoName}`,
                description: isPrivate ? 'Private Project' : 'Public Project',
                channels: [
                    { name: `${prefix}-general`, type: 'text', topic: `General discussion about ${addRepoName}` },
                    { name: `${prefix}-feature-requests`, type: 'text', topic: `Request features for ${addRepoName} - Tag the bot to create GitHub issues` },
                    { name: `${prefix}-bug-reports`, type: 'text', topic: `Report bugs - Tag the bot to create GitHub issues` },
                    { name: `${prefix}-commits`, type: 'text', topic: 'Automated commit feed from GitHub', permissions: [{ role: '@everyone', allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] }] },
                    { name: `${prefix}-releases`, type: 'text', topic: 'Automated release announcements from GitHub', permissions: [{ role: '@everyone', allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] }] },
                    { name: `${prefix}-discussions`, type: 'text', topic: `Community discussions about ${addRepoName}` }
                ]
            };

            if (isPrivate) {
                newCategory.permissions = [{ role: '@everyone', deny: ['ViewChannel'] }];
            }

            config.categories.push(newCategory);
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

            await interaction.editReply(
                `✅ Repository "${addRepoName}" added to configuration!\n` +
                `**Type**: ${isPrivate ? 'Private' : 'Public'}\n` +
                `**Channels**: ${prefix}-general, ${prefix}-feature-requests, ${prefix}-bug-reports, ${prefix}-commits, ${prefix}-releases, ${prefix}-discussions\n\n` +
                `Run \`/setup\` to create the Discord channels.`
            );
        } catch (error) {
            console.error('Error adding repo:', error);
            await interaction.editReply(`❌ Error adding repository: ${error.message}`);
        }
    }
};
