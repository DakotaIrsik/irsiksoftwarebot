const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPermission } = require('../services/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from a user or webhook (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to purge messages from')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('webhook')
                .setDescription('Webhook/integration name to purge')
                .setRequired(false)
                .setAutocomplete(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        // Fetch recent messages to get unique webhook/bot names
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const webhookNames = new Set();

        messages.forEach(msg => {
            if (msg.webhookId || msg.author.bot) {
                webhookNames.add(msg.author.username);
            }
        });

        // Filter and return matching webhook names
        const choices = Array.from(webhookNames)
            .filter(name => name.toLowerCase().includes(focusedValue))
            .slice(0, 25) // Discord limits to 25 choices
            .map(name => ({ name: name, value: name }));

        await interaction.respond(choices);
    },

    async execute(interaction) {
        // Check permissions
        const permission = await checkPermission(interaction, 'purge');
        if (!permission.allowed) {
            return interaction.reply({ content: `❌ ${permission.reason}`, ephemeral: true });
        }

        // Defer ephemerally and delete the response immediately
        await interaction.deferReply({ ephemeral: true });

        try {
            const targetUser = interaction.options.getUser('user');
            const webhookName = interaction.options.getString('webhook');

            let targetName;
            let filterFunc;

            if (targetUser) {
                // Delete by user ID
                targetName = targetUser.username;
                filterFunc = (m) => m.author.id === targetUser.id;
            } else if (webhookName) {
                // Delete by webhook/bot name
                targetName = webhookName;
                filterFunc = (m) => m.author.username.toLowerCase().includes(webhookName.toLowerCase());
            } else {
                // Default to current bot
                targetName = interaction.client.user.username;
                filterFunc = (m) => m.author.id === interaction.client.user.id;
            }

            let deleted = 0;
            let lastId;

            while (true) {
                const fetchOptions = { limit: 100 };
                if (lastId) fetchOptions.before = lastId;

                const messages = await interaction.channel.messages.fetch(fetchOptions);
                if (messages.size === 0) break;

                const targetMessages = messages.filter(filterFunc);

                for (const msg of targetMessages.values()) {
                    try {
                        await msg.delete();
                        deleted++;
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (err) {
                        console.error('Error deleting message:', err);
                    }
                }

                if (messages.size < 100) break;
                lastId = messages.last().id;
            }

            // Delete the ephemeral "thinking" message
            await interaction.deleteReply();
            console.log(`Purged ${deleted} messages from ${targetName} in ${interaction.channel.name}`);
        } catch (error) {
            console.error('Error purging messages:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    }
};
