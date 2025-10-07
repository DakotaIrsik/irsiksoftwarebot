const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

/**
 * Load all command modules from the commands directory
 * @returns {Collection} - Collection of command name -> command module
 */
function loadCommands() {
    const commands = new Collection();
    const commandsPath = __dirname;
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ('data' in command && 'execute' in command) {
            commands.set(command.data.name, command);
            console.log(`✓ Loaded command: ${command.data.name}`);
        } else {
            console.warn(`⚠️  Command at ${filePath} is missing required "data" or "execute" property`);
        }
    }

    return commands;
}

/**
 * Get array of command data for registration
 * @param {Collection} commands - Commands collection
 * @returns {Array} - Array of command data objects
 */
function getCommandData(commands) {
    return commands.map(cmd => cmd.data.toJSON());
}

module.exports = {
    loadCommands,
    getCommandData
};
