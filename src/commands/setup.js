const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

/**
 * Setup Discord server according to IaC configuration
 */
async function setupDiscordServer(guild) {
    console.log(`\n========================================`);
    console.log(`Setting up Discord server: ${guild.name}`);
    console.log(`========================================\n`);

    const configPath = path.join(__dirname, '..', '..', 'config', 'discord-structure.json');
    let structure;

    try {
        const data = await fs.readFile(configPath, 'utf8');
        structure = JSON.parse(data);
        console.log(`✓ Loaded configuration: ${structure.categories.length} categories, ${structure.roles.length} roles`);
    } catch (error) {
        console.error(`❌ Failed to load discord-structure.json:`, error);
        throw error;
    }

    // Create roles
    console.log('\n--- Creating Roles ---');
    const createdRoles = {};
    for (const roleConfig of structure.roles) {
        try {
            const existingRole = guild.roles.cache.find(r => r.name === roleConfig.name);
            if (!existingRole) {
                console.log(`Creating role: ${roleConfig.name}...`);
                const role = await guild.roles.create({
                    name: roleConfig.name,
                    color: roleConfig.color,
                    permissions: roleConfig.permissions.map(p => PermissionFlagsBits[p]),
                    mentionable: roleConfig.mentionable,
                    hoist: roleConfig.hoist,
                });
                createdRoles[roleConfig.name] = role;
                console.log(`✓ Created role: ${roleConfig.name} (ID: ${role.id})`);
            } else {
                createdRoles[roleConfig.name] = existingRole;
                console.log(`✓ Role already exists: ${roleConfig.name} (ID: ${existingRole.id})`);
            }
        } catch (error) {
            console.error(`❌ Failed to create role ${roleConfig.name}:`, error.message);
            throw error;
        }
    }

    // Create categories and channels
    console.log('\n--- Creating Categories & Channels ---');
    let totalChannelsCreated = 0;
    let totalChannelsSkipped = 0;

    for (const categoryConfig of structure.categories) {
        console.log(`\nProcessing category: ${categoryConfig.name}`);

        let category = guild.channels.cache.find(
            c => c.name === categoryConfig.name && c.type === 4 // 4 = GUILD_CATEGORY
        );

        if (!category) {
            try {
                console.log(`  Creating category: ${categoryConfig.name}...`);
                const permissionOverwrites = [];

                if (categoryConfig.permissions) {
                    for (const perm of categoryConfig.permissions) {
                        const roleId = perm.role === '@everyone'
                            ? guild.roles.everyone.id
                            : createdRoles[perm.role]?.id;

                        if (roleId) {
                            const overwrite = { id: roleId };
                            if (perm.allow) overwrite.allow = perm.allow.map(p => PermissionFlagsBits[p]);
                            if (perm.deny) overwrite.deny = perm.deny.map(p => PermissionFlagsBits[p]);
                            permissionOverwrites.push(overwrite);
                        }
                    }
                }

                category = await guild.channels.create({
                    name: categoryConfig.name,
                    type: 4,
                    permissionOverwrites,
                });
                console.log(`  ✓ Created category: ${categoryConfig.name}`);
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`  ❌ Failed to create category ${categoryConfig.name}:`, error.message);
                throw error;
            }
        } else {
            console.log(`  ✓ Category already exists: ${categoryConfig.name}`);
        }

        // Create channels in category
        for (const channelConfig of categoryConfig.channels) {
            try {
                let channel = guild.channels.cache.find(
                    c => c.name === channelConfig.name && c.parentId === category.id
                );

                if (!channel) {
                    console.log(`    Creating channel: #${channelConfig.name}...`);
                    const permissionOverwrites = [];

                    if (channelConfig.permissions) {
                        for (const perm of channelConfig.permissions) {
                            const roleId = perm.role === '@everyone'
                                ? guild.roles.everyone.id
                                : createdRoles[perm.role]?.id;

                            if (roleId) {
                                const overwrite = { id: roleId };
                                if (perm.allow) overwrite.allow = perm.allow.map(p => PermissionFlagsBits[p]);
                                if (perm.deny) overwrite.deny = perm.deny.map(p => PermissionFlagsBits[p]);
                                permissionOverwrites.push(overwrite);
                            }
                        }
                    }

                    channel = await guild.channels.create({
                        name: channelConfig.name,
                        type: 0,
                        parent: category.id,
                        topic: channelConfig.topic,
                        permissionOverwrites,
                    });
                    console.log(`    ✓ Created channel: #${channelConfig.name}`);
                    totalChannelsCreated++;
                    await new Promise(resolve => setTimeout(resolve, 300));
                } else {
                    console.log(`    ✓ Channel already exists: #${channelConfig.name}`);
                    totalChannelsSkipped++;
                }
            } catch (error) {
                console.error(`    ❌ Failed to create channel #${channelConfig.name}:`, error.message);
            }
        }
    }

    console.log(`\n========================================`);
    console.log(`Discord server setup complete!`);
    console.log(`Channels created: ${totalChannelsCreated}`);
    console.log(`Channels skipped: ${totalChannelsSkipped}`);
    console.log(`========================================\n`);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup Discord server channels from config (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            await interaction.editReply('Starting Discord server setup...');
            await setupDiscordServer(interaction.guild);
            await interaction.followUp('✅ Discord server setup complete!');
        } catch (error) {
            await interaction.editReply(`❌ Error during setup: ${error.message}`);
        }
    }
};
