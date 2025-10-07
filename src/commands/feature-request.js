const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createFeatureRequest, detectRepoFromChannel } = require('../services/github');
const { checkPermission, isAdmin } = require('../services/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feature-request')
        .setDescription('Submit a feature request (use in *-feature-requests channels)')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Feature request title')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Detailed description of the feature')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('priority')
                .setDescription('Priority level')
                .setRequired(true)
                .addChoices(
                    { name: '🔴 CRITICAL - Blocking issues; drop everything', value: 'critical' },
                    { name: '🟠 URGENT - Time-sensitive tasks', value: 'urgent' },
                    { name: '🟡 HIGH - Important but not blocking', value: 'high' },
                    { name: '🟢 MEDIUM - Standard priority', value: 'medium' },
                    { name: '🔵 LOW - Nice to have', value: 'low' }
                )
        ),

    async execute(interaction) {
        // Check permissions
        const permission = await checkPermission(interaction, 'feature-request');
        if (!permission.allowed) {
            return interaction.reply({ content: `❌ ${permission.reason}`, ephemeral: true });
        }

        // Check if in feature-requests channel
        if (!interaction.channel.name.includes('feature-request')) {
            await interaction.reply('❌ This command can only be used in `*-feature-requests` channels.');
            return;
        }

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const priority = interaction.options.getString('priority');
        const requestRepo = detectRepoFromChannel(interaction.channel);

        if (!requestRepo) {
            await interaction.reply('❌ Could not detect repository from channel category.');
            return;
        }

        const priorityEmoji = {
            'critical': '🔴',
            'urgent': '🟠',
            'high': '🟡',
            'medium': '🟢',
            'low': '🔵'
        };

        const needsApproval = ['critical', 'urgent'].includes(priority);

        const requestEmbed = new EmbedBuilder()
            .setColor(needsApproval ? '#FF6B6B' : '#4ECDC4')
            .setTitle(`${priorityEmoji[priority]} Feature Request: ${title}`)
            .setDescription(description)
            .addFields(
                { name: 'Repository', value: requestRepo, inline: true },
                { name: 'Priority', value: priority.toUpperCase(), inline: true },
                { name: 'Requested by', value: `${interaction.user.tag}`, inline: true }
            )
            .setTimestamp();

        if (needsApproval) {
            requestEmbed.setFooter({ text: '⏳ Awaiting admin approval - React with ✅ to approve' });
        }

        await interaction.reply({ embeds: [requestEmbed] });
        const reply = await interaction.fetchReply();

        if (needsApproval) {
            await reply.react('✅');

            // Wait for admin approval
            const filter = (reaction, user) => {
                return reaction.emoji.name === '✅' && !user.bot && isAdmin(interaction.guild.members.cache.get(user.id));
            };

            try {
                const collected = await reply.awaitReactions({ filter, max: 1, time: 86400000, errors: ['time'] });
                const approver = collected.first().users.cache.find(user => !user.bot);

                // Admin approved - create issue
                const issue = await createFeatureRequest({
                    repo: requestRepo,
                    title: title,
                    body: description,
                    priority: priority,
                    author: interaction.user.tag,
                    approvedBy: approver.tag
                });

                await interaction.followUp(`✅ **Approved!** Feature request created: ${issue.html_url}`);
            } catch (error) {
                if (error.message === 'time') {
                    await interaction.followUp('⏱️ Request timed out after 24 hours without admin approval.');
                } else {
                    console.error('Error creating GitHub issue:', error);
                    await interaction.followUp(`❌ Error creating GitHub issue: ${error.message}`);
                }
            }
        } else {
            // No approval needed - create issue immediately
            try {
                const issue = await createFeatureRequest({
                    repo: requestRepo,
                    title: title,
                    body: description,
                    priority: priority,
                    author: interaction.user.tag
                });

                await interaction.followUp(`✅ Feature request created: ${issue.html_url}`);
            } catch (error) {
                console.error('Error creating GitHub issue:', error);
                await interaction.followUp(`❌ Error creating GitHub issue: ${error.message}`);
            }
        }
    }
};
