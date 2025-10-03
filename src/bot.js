const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');
const { setDiscordClient, startWebhookServer } = require('./webhooks');
const {
  addRepoCommand,
  removeRepoCommand,
  listReposCommand,
  addRoleCommand,
  helpCommand,
} = require('./commands');
const { handleMessage: handleClaudeMessage, clearConversation } = require('./claude');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'DakotaIrsik';
const QIFLOW_REPO = process.env.QIFLOW_REPO || 'QiFlow';
const QIFLOWGO_REPO = process.env.QIFLOWGO_REPO || 'QiFlowGo';

// Helper function to load Discord structure configuration
async function loadDiscordStructure() {
  const configPath = path.join(__dirname, '../config/discord-structure.json');
  const data = await fs.readFile(configPath, 'utf8');
  return JSON.parse(data);
}

// Setup Discord server according to IaC configuration
async function setupDiscordServer(guild) {
  console.log(`\n========================================`);
  console.log(`Setting up Discord server: ${guild.name}`);
  console.log(`========================================\n`);

  let structure;
  try {
    structure = await loadDiscordStructure();
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
      if (error.code === 50013) {
        console.error(`   Missing permissions to create roles`);
      } else if (error.code === 429) {
        console.error(`   Rate limited by Discord. Waiting before retry...`);
        await new Promise(resolve => setTimeout(resolve, error.retry_after || 1000));
      }
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

        // Apply category-level permissions if specified
        if (categoryConfig.permissions) {
          console.log(`  Applying ${categoryConfig.permissions.length} permission overwrite(s)`);
          for (const perm of categoryConfig.permissions) {
            const roleId = perm.role === '@everyone'
              ? guild.roles.everyone.id
              : createdRoles[perm.role]?.id;

            if (roleId) {
              const overwrite = { id: roleId };
              if (perm.allow) overwrite.allow = perm.allow.map(p => PermissionFlagsBits[p]);
              if (perm.deny) overwrite.deny = perm.deny.map(p => PermissionFlagsBits[p]);
              permissionOverwrites.push(overwrite);
              console.log(`    - ${perm.role}: Allow=${perm.allow?.length || 0}, Deny=${perm.deny?.length || 0}`);
            } else {
              console.warn(`    ⚠ Role not found: ${perm.role}`);
            }
          }
        }

        category = await guild.channels.create({
          name: categoryConfig.name,
          type: 4, // GUILD_CATEGORY
          permissionOverwrites,
        });
        console.log(`  ✓ Created category: ${categoryConfig.name} (ID: ${category.id})`);

        // Discord rate limiting: wait between category creations
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`  ❌ Failed to create category ${categoryConfig.name}:`, error.message);
        if (error.code === 50013) {
          console.error(`     Missing permissions to create channels`);
        } else if (error.code === 429) {
          console.error(`     Rate limited by Discord. Retry after: ${error.retry_after}ms`);
          await new Promise(resolve => setTimeout(resolve, error.retry_after || 2000));
        } else if (error.code === 30013) {
          console.error(`     Maximum number of channels reached (500 limit)`);
        }
        throw error;
      }
    } else {
      console.log(`  ✓ Category already exists: ${categoryConfig.name} (ID: ${category.id})`);

      // Update permissions on existing category if specified
      if (categoryConfig.permissions) {
        try {
          console.log(`  Updating permissions on existing category...`);
          const permissionOverwrites = [];

          for (const perm of categoryConfig.permissions) {
            const roleId = perm.role === '@everyone'
              ? guild.roles.everyone.id
              : createdRoles[perm.role]?.id;

            if (roleId) {
              const overwrite = { id: roleId };
              if (perm.allow) overwrite.allow = perm.allow.map(p => PermissionFlagsBits[p]);
              if (perm.deny) overwrite.deny = perm.deny.map(p => PermissionFlagsBits[p]);
              permissionOverwrites.push(overwrite);
              console.log(`    - Updating ${perm.role}: Allow=${perm.allow?.length || 0}, Deny=${perm.deny?.length || 0}`);
            } else {
              console.warn(`    ⚠ Role not found: ${perm.role}`);
            }
          }

          await category.permissionOverwrites.set(permissionOverwrites);
          console.log(`  ✓ Updated category permissions`);

          // Discord rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`  ⚠ Failed to update category permissions:`, error.message);
          if (error.code === 50013) {
            console.error(`     Missing permissions to manage channels`);
          }
        }
      }
    }

    // Create channels in category
    console.log(`  Creating ${categoryConfig.channels.length} channel(s) in ${categoryConfig.name}...`);
    for (const channelConfig of categoryConfig.channels) {
      try {
        let channel = guild.channels.cache.find(
          c => c.name === channelConfig.name && c.parentId === category.id
        );

        if (!channel) {
          console.log(`    Creating channel: #${channelConfig.name}...`);
          const permissionOverwrites = [];

          // Apply channel-specific permissions
          if (channelConfig.permissions) {
            console.log(`      Applying ${channelConfig.permissions.length} permission overwrite(s)`);
            for (const perm of channelConfig.permissions) {
              const roleId = perm.role === '@everyone'
                ? guild.roles.everyone.id
                : createdRoles[perm.role]?.id;

              if (roleId) {
                const overwrite = { id: roleId };
                if (perm.allow) overwrite.allow = perm.allow.map(p => PermissionFlagsBits[p]);
                if (perm.deny) overwrite.deny = perm.deny.map(p => PermissionFlagsBits[p]);
                permissionOverwrites.push(overwrite);
                console.log(`        - ${perm.role}: Allow=${perm.allow?.length || 0}, Deny=${perm.deny?.length || 0}`);
              } else {
                console.warn(`        ⚠ Role not found for channel permission: ${perm.role}`);
              }
            }
          }

          channel = await guild.channels.create({
            name: channelConfig.name,
            type: 0, // GUILD_TEXT
            parent: category.id,
            topic: channelConfig.topic,
            permissionOverwrites,
          });
          console.log(`    ✓ Created channel: #${channelConfig.name} (ID: ${channel.id})`);
          totalChannelsCreated++;

          // Discord rate limiting: wait between channel creations
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          console.log(`    ✓ Channel already exists: #${channelConfig.name} (ID: ${channel.id})`);
          totalChannelsSkipped++;

          // Update permissions on existing channel if specified
          if (channelConfig.permissions) {
            try {
              console.log(`      Updating permissions on existing channel...`);
              const permissionOverwrites = [];

              for (const perm of channelConfig.permissions) {
                const roleId = perm.role === '@everyone'
                  ? guild.roles.everyone.id
                  : createdRoles[perm.role]?.id;

                if (roleId) {
                  const overwrite = { id: roleId };
                  if (perm.allow) overwrite.allow = perm.allow.map(p => PermissionFlagsBits[p]);
                  if (perm.deny) overwrite.deny = perm.deny.map(p => PermissionFlagsBits[p]);
                  permissionOverwrites.push(overwrite);
                  console.log(`        - Updating ${perm.role}: Allow=${perm.allow?.length || 0}, Deny=${perm.deny?.length || 0}`);
                } else {
                  console.warn(`        ⚠ Role not found for channel permission: ${perm.role}`);
                }
              }

              await channel.permissionOverwrites.set(permissionOverwrites);
              console.log(`      ✓ Updated channel permissions`);

              // Discord rate limiting
              await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
              console.error(`      ⚠ Failed to update channel permissions:`, error.message);
              if (error.code === 50013) {
                console.error(`         Missing permissions to manage channels`);
              }
            }
          }

          // Update topic if different
          if (channelConfig.topic && channel.topic !== channelConfig.topic) {
            try {
              console.log(`      Updating channel topic...`);
              await channel.edit({ topic: channelConfig.topic });
              console.log(`      ✓ Updated topic`);
              await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
              console.error(`      ⚠ Failed to update topic:`, error.message);
            }
          }
        }
      } catch (error) {
        console.error(`    ❌ Failed to create channel #${channelConfig.name}:`, error.message);
        if (error.code === 50013) {
          console.error(`       Missing permissions to create channels`);
        } else if (error.code === 429) {
          console.error(`       Rate limited by Discord. Retry after: ${error.retry_after}ms`);
          await new Promise(resolve => setTimeout(resolve, error.retry_after || 2000));
          // Retry once after rate limit
          try {
            console.log(`       Retrying channel creation: #${channelConfig.name}...`);
            const channel = await guild.channels.create({
              name: channelConfig.name,
              type: 0,
              parent: category.id,
              topic: channelConfig.topic,
              permissionOverwrites: [],
            });
            console.log(`    ✓ Created channel on retry: #${channelConfig.name} (ID: ${channel.id})`);
            totalChannelsCreated++;
          } catch (retryError) {
            console.error(`       ❌ Retry failed:`, retryError.message);
            throw retryError;
          }
        } else if (error.code === 30013) {
          console.error(`       Maximum number of channels reached (500 limit)`);
        }
        // Don't throw - continue with other channels
        console.warn(`       ⚠ Skipping channel #${channelConfig.name} due to error`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Discord server setup complete!`);
  console.log(`Channels created: ${totalChannelsCreated}`);
  console.log(`Channels skipped (already exist): ${totalChannelsSkipped}`);
  console.log(`========================================\n`);
}

// Determine which repo based on channel name
function getRepoFromChannel(channelName) {
  if (channelName.startsWith('qiflowgo-')) {
    return QIFLOWGO_REPO;
  } else if (channelName.startsWith('qiflow-')) {
    return QIFLOW_REPO;
  }
  return null;
}

// Determine issue type from channel name
function getIssueTypeFromChannel(channelName) {
  if (channelName.includes('feature-request')) {
    return 'feature';
  } else if (channelName.includes('bug-report')) {
    return 'bug';
  }
  return null;
}

// Create GitHub issue from Discord message
async function createGitHubIssue(repo, title, body, issueType, author) {
  const labels = issueType === 'feature' ? ['enhancement'] : ['bug'];

  const issueBody = `${body}\n\n---\n*Reported by ${author} via Discord*`;

  try {
    const response = await octokit.rest.issues.create({
      owner: GITHUB_OWNER,
      repo: repo,
      title: title,
      body: issueBody,
      labels: labels,
    });

    return response.data;
  } catch (error) {
    console.error('Error creating GitHub issue:', error);
    throw error;
  }
}

// Bot ready event
client.once('ready', async () => {
  console.log(`✓ Bot logged in as ${client.user.tag}`);
  console.log(`✓ Serving ${client.guilds.cache.size} guild(s)`);

  // Initialize webhook server
  setDiscordClient(client);
  startWebhookServer();

  // Optionally run setup on start (comment out after first run)
  // const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
  // if (guild) {
  //   await setupDiscordServer(guild);
  // }
});

// Helper function to convert GitHub markdown to Discord-friendly format
function convertMarkdownToDiscord(markdown) {
  let discord = markdown;

  // Convert GitHub-style code blocks to Discord format (already compatible)
  // Convert headers to bold (Discord doesn't support # headers well)
  discord = discord.replace(/^### (.*$)/gim, '**$1**');
  discord = discord.replace(/^## (.*$)/gim, '**__$1__**');
  discord = discord.replace(/^# (.*$)/gim, '**__$1__**');

  // Remove HTML comments
  discord = discord.replace(/<!--[\s\S]*?-->/g, '');

  // Convert GitHub badges/images to just links (Discord doesn't render them well)
  discord = discord.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[$1]($2)');

  return discord.trim();
}

// Helper function to fetch README from GitHub repo
async function fetchRepoReadme(repoName) {
  try {
    const response = await octokit.rest.repos.getReadme({
      owner: GITHUB_OWNER,
      repo: repoName,
    });

    // Decode base64 content
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return content;
  } catch (error) {
    console.error(`Error fetching README for ${repoName}:`, error.message);
    throw error;
  }
}

// Handle messages
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if bot is mentioned
  if (message.mentions.has(client.user)) {
    const channelName = message.channel.name;
    const content = message.content.replace(/<@!?\d+>/g, '').trim().toLowerCase();
    const repo = getRepoFromChannel(channelName);
    const issueType = getIssueTypeFromChannel(channelName);

    // Handle README request in any channel
    if (content.includes('readme')) {
      // Extract repo name from command or channel
      let targetRepo = repo; // Default to channel's repo

      // Check if user specified a repo: "@bot readme QiFlow"
      const repoMatch = content.match(/readme\s+(\S+)/i);
      if (repoMatch) {
        targetRepo = repoMatch[1];
      }

      if (!targetRepo) {
        return message.reply(
          '❌ Please specify a repository.\nUsage: `@bot readme <repo-name>`\nExample: `@bot readme QiFlow`'
        );
      }

      try {
        await message.react('⏳');

        const readme = await fetchRepoReadme(targetRepo);
        const discordReadme = convertMarkdownToDiscord(readme);

        // Discord has a 2000 character limit per message
        const MAX_LENGTH = 1900;

        if (discordReadme.length <= MAX_LENGTH) {
          await message.reactions.removeAll();
          await message.reply(`📄 **README for ${targetRepo}**\n\n${discordReadme}`);
        } else {
          // Split into multiple messages
          await message.reactions.removeAll();
          await message.reply(`📄 **README for ${targetRepo}** (Part 1)`);

          const chunks = [];
          for (let i = 0; i < discordReadme.length; i += MAX_LENGTH) {
            chunks.push(discordReadme.substring(i, i + MAX_LENGTH));
          }

          for (let i = 0; i < chunks.length && i < 5; i++) { // Limit to 5 parts
            await message.channel.send(chunks[i]);
            await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
          }

          if (chunks.length > 5) {
            await message.channel.send(
              `\n... README is too long. View full README: https://github.com/${GITHUB_OWNER}/${targetRepo}#readme`
            );
          }
        }

        console.log(`Fetched README for ${targetRepo} in ${channelName}`);
      } catch (error) {
        await message.reactions.removeAll();
        await message.react('❌');
        await message.reply(
          `❌ Could not fetch README for "${targetRepo}".\nMake sure the repository exists and has a README file.`
        );
      }
      return;
    }

    // Handle issue creation in feature-request and bug-report channels
    if (repo && issueType) {
      // Extract title and body from message
      const originalContent = message.content.replace(/<@!?\d+>/g, '').trim();

      if (originalContent.length < 10) {
        await message.reply('Please provide more details for the issue. Format: @bot [issue title/description]');
        return;
      }

      // Use first line as title, rest as body
      const lines = originalContent.split('\n');
      const title = lines[0].substring(0, 100); // GitHub title max length
      const body = lines.length > 1 ? lines.slice(1).join('\n') : originalContent;

      try {
        await message.react('⏳');

        const issue = await createGitHubIssue(
          repo,
          title,
          body,
          issueType,
          message.author.tag
        );

        await message.reactions.removeAll();
        await message.react('✅');

        await message.reply(
          `✅ Created GitHub ${issueType} issue: ${issue.html_url}\n**#${issue.number}**: ${issue.title}`
        );

        console.log(`Created issue #${issue.number} in ${repo} from Discord`);
      } catch (error) {
        await message.reactions.removeAll();
        await message.react('❌');
        await message.reply(`❌ Error creating GitHub issue: ${error.message}`);
      }
      return;
    }

    // Claude AI conversation mode for all other mentions
    if (!repo && !issueType && !content.includes('readme')) {
      try {
        await message.channel.sendTyping();

        const response = await handleClaudeMessage(message);

        // Discord has 2000 char limit, split if needed
        if (response.length <= 2000) {
          await message.reply(response);
        } else {
          // Split into chunks
          const chunks = [];
          for (let i = 0; i < response.length; i += 1900) {
            chunks.push(response.substring(i, i + 1900));
          }

          await message.reply(chunks[0]);
          for (let i = 1; i < chunks.length && i < 5; i++) {
            await message.channel.send(chunks[i]);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (error) {
        console.error('Claude conversation error:', error);
        await message.reply(
          `❌ Sorry, I encountered an error: ${error.message}\n\n` +
          `Make sure \`claude\` CLI is installed and configured.`
        );
      }
      return;
    }
  }

  // Admin commands
  if (message.content.startsWith('!')) {
    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    switch (command) {
      case 'setup':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('❌ You need Administrator permission to use this command.');
        }
        try {
          await message.reply('Starting Discord server setup...');
          await setupDiscordServer(message.guild);
          await message.reply('✅ Discord server setup complete!');
        } catch (error) {
          await message.reply(`❌ Error during setup: ${error.message}`);
        }
        break;

      case 'addrepo':
        await addRepoCommand(message, args);
        break;

      case 'removerepo':
        await removeRepoCommand(message, args);
        break;

      case 'listrepos':
        await listReposCommand(message);
        break;

      case 'addrole':
        await addRoleCommand(message, args);
        break;

      case 'help':
        await helpCommand(message);
        break;

      case 'ping':
        await message.reply(`Pong! 🏓 Latency: ${client.ws.ping}ms`);
        break;

      case 'clear':
      case 'reset':
        clearConversation(message.channel.id);
        await message.reply('✅ Conversation history cleared for this channel.');
        break;

      case 'purge':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('❌ You need Administrator permission to use this command.');
        }
        try {
          // Get target user (default to bot)
          let targetUser = client.user;
          let targetName = 'bot';

          if (args.length > 0) {
            const userArg = args.join(' ');

            // Try to find user by mention, username, display name, or ID
            const mentionMatch = userArg.match(/^<@!?(\d+)>$/);
            if (mentionMatch) {
              targetUser = await client.users.fetch(mentionMatch[1]);
            } else {
              // Search in guild members
              const members = await message.guild.members.fetch();
              const found = members.find(m =>
                m.user.username.toLowerCase() === userArg.toLowerCase() ||
                m.user.tag.toLowerCase() === userArg.toLowerCase() ||
                m.displayName.toLowerCase() === userArg.toLowerCase() ||
                m.user.id === userArg
              );

              if (found) {
                targetUser = found.user;
              } else {
                return message.reply(`❌ Could not find user: "${userArg}"`);
              }
            }
            targetName = targetUser.username;
          }

          await message.reply(`🗑️ Deleting all messages from **${targetName}** in this channel...`);

          // Fetch messages (max 100 at a time)
          let deleted = 0;
          let lastId;

          while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await message.channel.messages.fetch(options);
            if (messages.size === 0) break;

            // Filter for target user's messages
            const targetMessages = messages.filter(m => m.author.id === targetUser.id);

            // Delete messages one by one (bulk delete only works for messages < 14 days old)
            for (const msg of targetMessages.values()) {
              try {
                await msg.delete();
                deleted++;
                await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit protection
              } catch (err) {
                console.error('Error deleting message:', err);
              }
            }

            if (messages.size < 100) break;
            lastId = messages.last().id;
          }

          await message.channel.send(`✅ Deleted ${deleted} message(s) from **${targetName}** in this channel.`);
          console.log(`Purged ${deleted} messages from ${targetName} in ${message.channel.name}`);
        } catch (error) {
          console.error('Error purging messages:', error);
          await message.reply(`❌ Error purging messages: ${error.message}`);
        }
        break;

      default:
        // Command not found, ignore silently
        break;
    }
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);

// Handle process signals
process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  client.destroy();
  process.exit(0);
});

module.exports = client;
