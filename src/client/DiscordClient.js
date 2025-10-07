const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { loadCommands, getCommandData } = require('../commands');
const { handleInteraction } = require('../handlers/interactionHandler');
const { handleMessage } = require('../handlers/messageHandler');
const { setDiscordClient, startWebhookServer } = require('../../webhooks');
const { loadPermissions } = require('../services/permissions');
require('dotenv').config();

/**
 * Create and configure the Discord client
 */
function createClient() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers
        ]
    });

    // Load commands into client
    client.commands = loadCommands();

    return client;
}

/**
 * Register slash commands with Discord
 */
async function registerCommands(client) {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commandData = getCommandData(client.commands);

    try {
        console.log('🔄 Refreshing slash commands...');

        // Clear global commands first (in case any old ones exist)
        console.log('🗑️  Clearing global commands...');
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID),
            { body: [] }
        );

        // Register for each guild (instant update) instead of globally (takes up to 1 hour)
        for (const guild of client.guilds.cache.values()) {
            // Clear existing guild commands first to avoid duplicates
            console.log(`🗑️  Clearing old commands for guild: ${guild.name}`);
            await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, guild.id),
                { body: [] }
            );

            // Small delay to ensure clearing completes
            await new Promise(resolve => setTimeout(resolve, 500));

            // Register new commands
            await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, guild.id),
                { body: commandData }
            );
            console.log(`✅ Registered ${commandData.length} commands for guild: ${guild.name}`);
        }

        console.log('✅ Successfully registered all slash commands!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

/**
 * Setup event handlers
 */
function setupEventHandlers(client) {
    // Ready event
    client.once('ready', async () => {
        console.log(`🤖 NeonLadder Assistant is online! Logged in as ${client.user.tag}`);
        console.log(`📊 Serving ${client.guilds.cache.size} servers with ${client.users.cache.size} users`);

        // Set bot status
        client.user.setActivity('NeonLadder Development', { type: 'WATCHING' });

        // Initialize webhook server
        setDiscordClient(client);
        if (process.env.ENABLE_WEBHOOKS === 'true') {
            startWebhookServer();
        } else {
            console.log('ℹ️  Webhook server disabled (set ENABLE_WEBHOOKS=true to enable)');
        }

        // Load permissions
        await loadPermissions();
        console.log('✓ Permissions system loaded');

        // Register commands
        await registerCommands(client);
    });

    // Interaction handler (slash commands, autocomplete)
    client.on('interactionCreate', handleInteraction);

    // Message handler (bot mentions, etc.)
    client.on('messageCreate', handleMessage);

    // Error handling
    client.on('error', console.error);
    client.on('warn', console.warn);
}

/**
 * Initialize and login the Discord client
 */
async function initializeClient() {
    const client = createClient();
    setupEventHandlers(client);

    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);

    return client;
}

module.exports = {
    createClient,
    registerCommands,
    setupEventHandlers,
    initializeClient
};
