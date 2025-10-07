/**
 * Handle Discord interaction events (slash commands, autocomplete, etc.)
 */
async function handleInteraction(interaction) {
    // Handle autocomplete
    if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error('Error handling autocomplete:', error);
        }
        return;
    }

    // Handle slash commands
    if (!interaction.isCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Command execution error:', error);

        const errorMessage = '❌ An error occurred while executing the command.';

        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else if (interaction.replied) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

module.exports = {
    handleInteraction
};
