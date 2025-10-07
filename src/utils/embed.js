const { EmbedBuilder } = require('discord.js');

/**
 * Create a standard success embed
 */
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#4CAF50')
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Create a standard error embed
 */
function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#F44336')
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Create a standard info embed
 */
function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#2196F3')
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Create a warning embed
 */
function createWarningEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#FF9800')
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Convert GitHub markdown to Discord-friendly format
 */
function convertMarkdownToDiscord(markdown) {
    let discord = markdown;

    // Convert headers to bold
    discord = discord.replace(/^### (.*$)/gim, '**$1**');
    discord = discord.replace(/^## (.*$)/gim, '**__$1__**');
    discord = discord.replace(/^# (.*$)/gim, '**__$1__**');

    // Remove HTML comments
    discord = discord.replace(/<!--[\s\S]*?-->/g, '');

    // Convert GitHub badges/images to just links
    discord = discord.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[$1]($2)');

    return discord.trim();
}

module.exports = {
    createSuccessEmbed,
    createErrorEmbed,
    createInfoEmbed,
    createWarningEmbed,
    convertMarkdownToDiscord
};
