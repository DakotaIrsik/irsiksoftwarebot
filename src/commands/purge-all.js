const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge-all')
        .setDescription('Delete ALL messages in this channel (Admin only)')
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Maximum number of messages to delete (default: 100, max: 1000)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1000)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const limit = interaction.options.getInteger('limit') || 100;

            await interaction.editReply(`🗑️ Deleting up to **${limit}** messages in this channel...`);

            let deleted = 0;
            let remaining = limit;

            while (remaining > 0) {
                const fetchLimit = Math.min(remaining, 100);
                const messages = await interaction.channel.messages.fetch({ limit: fetchLimit });

                if (messages.size === 0) break;

                // Delete messages one by one (slower but more reliable)
                for (const msg of messages.values()) {
                    if (deleted >= limit) break;

                    try {
                        await msg.delete();
                        deleted++;
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (err) {
                        console.error('Error deleting message:', err);
                    }
                }

                remaining = limit - deleted;
                if (messages.size < fetchLimit) break;
            }

            await interaction.followUp(`✅ Deleted ${deleted} message(s) from this channel.`);
            console.log(`Purged ${deleted} messages from ${interaction.channel.name}`);
        } catch (error) {
            console.error('Error purging all messages:', error);
            await interaction.editReply(`❌ Error purging messages: ${error.message}`);
        }
    }
};
