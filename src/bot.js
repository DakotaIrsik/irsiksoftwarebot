const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');
const { setDiscordClient, startWebhookServer } = require('./webhooks');
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
  console.log(`Setting up Discord server: ${guild.name}`);
  const structure = await loadDiscordStructure();

  // Create roles
  console.log('Creating roles...');
  const createdRoles = {};
  for (const roleConfig of structure.roles) {
    const existingRole = guild.roles.cache.find(r => r.name === roleConfig.name);
    if (!existingRole) {
      const role = await guild.roles.create({
        name: roleConfig.name,
        color: roleConfig.color,
        permissions: roleConfig.permissions.map(p => PermissionFlagsBits[p]),
        mentionable: roleConfig.mentionable,
        hoist: roleConfig.hoist,
      });
      createdRoles[roleConfig.name] = role;
      console.log(`✓ Created role: ${roleConfig.name}`);
    } else {
      createdRoles[roleConfig.name] = existingRole;
      console.log(`✓ Role already exists: ${roleConfig.name}`);
    }
  }

  // Create categories and channels
  console.log('Creating categories and channels...');
  for (const categoryConfig of structure.categories) {
    let category = guild.channels.cache.find(
      c => c.name === categoryConfig.name && c.type === 4 // 4 = GUILD_CATEGORY
    );

    if (!category) {
      const permissionOverwrites = [];

      // Apply category-level permissions if specified
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
        type: 4, // GUILD_CATEGORY
        permissionOverwrites,
      });
      console.log(`✓ Created category: ${categoryConfig.name}`);
    } else {
      console.log(`✓ Category already exists: ${categoryConfig.name}`);
    }

    // Create channels in category
    for (const channelConfig of categoryConfig.channels) {
      let channel = guild.channels.cache.find(
        c => c.name === channelConfig.name && c.parentId === category.id
      );

      if (!channel) {
        const permissionOverwrites = [];

        // Apply channel-specific permissions
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
          type: 0, // GUILD_TEXT
          parent: category.id,
          topic: channelConfig.topic,
          permissionOverwrites,
        });
        console.log(`  ✓ Created channel: #${channelConfig.name}`);
      } else {
        console.log(`  ✓ Channel already exists: #${channelConfig.name}`);
      }
    }
  }

  console.log('Discord server setup complete!');
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

// Handle messages
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if bot is mentioned
  if (message.mentions.has(client.user)) {
    const channelName = message.channel.name;
    const repo = getRepoFromChannel(channelName);
    const issueType = getIssueTypeFromChannel(channelName);

    if (repo && issueType) {
      // Extract title and body from message
      const content = message.content.replace(/<@!?\d+>/g, '').trim();

      if (content.length < 10) {
        await message.reply('Please provide more details for the issue. Format: @bot [issue title/description]');
        return;
      }

      // Use first line as title, rest as body
      const lines = content.split('\n');
      const title = lines[0].substring(0, 100); // GitHub title max length
      const body = lines.length > 1 ? lines.slice(1).join('\n') : content;

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
    }
  }

  // Admin commands
  if (message.content.startsWith('!setup') && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    try {
      await message.reply('Starting Discord server setup...');
      await setupDiscordServer(message.guild);
      await message.reply('✅ Discord server setup complete!');
    } catch (error) {
      await message.reply(`❌ Error during setup: ${error.message}`);
    }
  }

  if (message.content === '!ping') {
    await message.reply(`Pong! 🏓 Latency: ${client.ws.ping}ms`);
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
