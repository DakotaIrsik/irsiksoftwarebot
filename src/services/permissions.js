const fs = require('fs').promises;
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');

const PERMISSIONS_PATH = path.join(__dirname, '..', '..', 'config', 'permissions.json');

let permissionsConfig = null;

/**
 * Load permissions configuration from file
 */
async function loadPermissions() {
    try {
        const data = await fs.readFile(PERMISSIONS_PATH, 'utf8');
        permissionsConfig = JSON.parse(data);
        return permissionsConfig;
    } catch (error) {
        console.error('Error loading permissions config:', error);
        // Return default config
        return {
            servers: {
                default: {
                    enabled: false,
                    commands: []
                }
            },
            globalAdminRoles: ['Founder', 'Administrator']
        };
    }
}

/**
 * Check if user has admin privileges (Founder, Administrator role, or Discord Admin permission)
 */
function isAdmin(member, config = null) {
    if (!member) return false;

    // Check Discord Administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    // Check global admin roles
    const adminRoles = config?.globalAdminRoles || ['Founder', 'Administrator'];
    return member.roles.cache.some(role => adminRoles.includes(role.name));
}

/**
 * Check if a channel matches the allowed pattern (supports wildcards)
 * @param {string} channelName - The actual channel name
 * @param {string} pattern - The pattern (can include wildcards like "*-feature-requests")
 */
function channelMatchesPattern(channelName, pattern) {
    if (pattern === '*') return true;

    // Convert wildcard pattern to regex
    const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(channelName);
}

/**
 * Check if command is allowed for the user in the current context
 * @param {object} interaction - Discord interaction or message object
 * @param {string} commandName - Name of the command to check
 * @returns {object} - { allowed: boolean, reason: string }
 */
async function checkPermission(interaction, commandName) {
    // Load permissions if not already loaded
    if (!permissionsConfig) {
        await loadPermissions();
    }

    const guildId = interaction.guildId || interaction.guild?.id;
    const channelName = interaction.channel?.name;
    const member = interaction.member;

    // If no guild ID, deny (DMs not supported)
    if (!guildId) {
        return { allowed: false, reason: 'Commands cannot be used in DMs' };
    }

    // Get server config (fallback to default)
    const serverConfig = permissionsConfig.servers[guildId] || permissionsConfig.servers.default;

    // Check if server is enabled
    if (!serverConfig.enabled) {
        return { allowed: false, reason: 'Bot is not enabled for this server. Contact server admin.' };
    }

    // Get command config
    const commandConfig = serverConfig.commands?.[commandName];

    // If command not configured, deny by default
    if (!commandConfig) {
        return { allowed: false, reason: `Command "${commandName}" is not configured for this server` };
    }

    // Check if command is enabled
    if (!commandConfig.enabled) {
        return { allowed: false, reason: `Command "${commandName}" is disabled` };
    }

    // Check channel permissions
    const allowedChannels = commandConfig.channels || ['*'];
    const channelAllowed = allowedChannels.some(pattern => channelMatchesPattern(channelName, pattern));

    if (!channelAllowed) {
        const channelList = allowedChannels.join(', ');
        return {
            allowed: false,
            reason: `Command "${commandName}" can only be used in these channels: ${channelList}`
        };
    }

    // Check role permissions
    const allowedRoles = commandConfig.roles || ['*'];

    // If wildcard, allow everyone
    if (allowedRoles.includes('*')) {
        return { allowed: true };
    }

    // Check if user has any of the allowed roles
    const hasRole = member.roles.cache.some(role => allowedRoles.includes(role.name));

    if (!hasRole) {
        const roleList = allowedRoles.join(', ');
        return {
            allowed: false,
            reason: `Command "${commandName}" requires one of these roles: ${roleList}`
        };
    }

    // Check if command requires admin
    if (commandConfig.requireAdmin && !isAdmin(member, permissionsConfig)) {
        return {
            allowed: false,
            reason: `Command "${commandName}" requires administrator privileges`
        };
    }

    return { allowed: true };
}

module.exports = {
    loadPermissions,
    checkPermission,
    isAdmin,
    channelMatchesPattern
};
