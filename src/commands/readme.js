const { SlashCommandBuilder } = require('discord.js');
const { fetchRepoReadme, detectRepoFromChannel, GITHUB_OWNER } = require('../services/github');
const { convertMarkdownToDiscord } = require('../utils/embed');
const { checkPermission } = require('../services/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('readme')
        .setDescription('Fetch README from GitHub repository')
        .addStringOption(option =>
            option.setName('repo')
                .setDescription('Repository name (auto-detects from channel if not provided)')
                .setRequired(false)
        ),

    async execute(interaction) {
        // Check permissions
        const permission = await checkPermission(interaction, 'readme');
        if (!permission.allowed) {
            return interaction.reply({ content: `❌ ${permission.reason}`, ephemeral: true });
        }

        let repoName = interaction.options.getString('repo');

        // Auto-detect repo from channel if not provided
        if (!repoName) {
            repoName = detectRepoFromChannel(interaction.channel);
            if (!repoName) {
                await interaction.reply('❌ Could not detect repository from channel category. Please use this command in a project channel or specify the repo name manually.');
                return;
            }
        }

        await interaction.deferReply();

        try {
            const content = await fetchRepoReadme(repoName);

            if (!content || content.trim() === '') {
                throw new Error('No README content returned');
            }

            // Convert markdown to Discord-friendly format
            const discord = convertMarkdownToDiscord(content);

            const MAX_LENGTH = 1900;
            const fullRepo = `${GITHUB_OWNER}/${repoName}`;

            if (discord.length <= MAX_LENGTH) {
                await interaction.editReply(`📄 **README for ${fullRepo}**\n\n${discord}`);
            } else {
                await interaction.editReply(`📄 **README for ${fullRepo}** (Part 1)`);

                const chunks = [];
                for (let i = 0; i < discord.length; i += MAX_LENGTH) {
                    chunks.push(discord.substring(i, i + MAX_LENGTH));
                }

                for (let i = 0; i < chunks.length && i < 5; i++) {
                    await interaction.followUp(chunks[i]);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                if (chunks.length > 5) {
                    await interaction.followUp(
                        `\n... README is too long. View full README: https://github.com/${fullRepo}/blob/main/README.md`
                    );
                }
            }

            console.log(`Fetched README for ${fullRepo}`);
        } catch (error) {
            console.error(`Error fetching README for ${repoName}:`, error.message);
            await interaction.editReply(
                `❌ Could not fetch README for "${repoName}".\nMake sure the repository exists at https://github.com/${GITHUB_OWNER}/${repoName}/blob/main/README.md and you have access to it.`
            );
        }
    }
};
