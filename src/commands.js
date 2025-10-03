const { PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/discord-structure.json');
const ENV_PATH = path.join(__dirname, '../.env');

// Helper to check if user is admin
function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// Load Discord structure config
async function loadConfig() {
  const data = await fs.readFile(CONFIG_PATH, 'utf8');
  return JSON.parse(data);
}

// Save Discord structure config
async function saveConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// Add repository command
async function addRepoCommand(message, args) {
  if (!isAdmin(message.member)) {
    return message.reply('❌ You need Administrator permission to use this command.');
  }

  // Usage: !addrepo <repo-name> [public|private]
  if (args.length < 1) {
    return message.reply('Usage: `!addrepo <repo-name> [public|private]`\nExample: `!addrepo MyProject` or `!addrepo QiFlow private`');
  }

  const repoName = args[0];
  const isPrivate = args[1]?.toLowerCase() === 'private';
  const prefix = repoName.toLowerCase().replace(/\s+/g, '');

  try {
    const config = await loadConfig();

    // Check if category already exists
    const exists = config.categories.find(cat =>
      cat.name.toLowerCase().includes(prefix)
    );

    if (exists) {
      return message.reply(`❌ A category for "${repoName}" already exists.`);
    }

    // Create new category structure
    const newCategory = {
      name: `📦 ${repoName}`,
      description: isPrivate ? 'Private Project - Licensee Only' : 'Public Project',
      channels: [
        {
          name: `${prefix}-general`,
          type: 'text',
          topic: `General discussion about ${repoName}`
        },
        {
          name: `${prefix}-feature-requests`,
          type: 'text',
          topic: `Request features for ${repoName} - Tag the bot to create GitHub issues`
        },
        {
          name: `${prefix}-bug-reports`,
          type: 'text',
          topic: `Report bugs - Tag the bot to create GitHub issues`
        },
        {
          name: `${prefix}-commits`,
          type: 'text',
          topic: 'Automated commit feed from GitHub',
          permissions: isPrivate ? [
            {
              role: 'Founder',
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages']
            },
            {
              role: 'Licensee',
              allow: ['ViewChannel', 'ReadMessageHistory'],
              deny: ['SendMessages']
            }
          ] : [
            {
              role: 'Founder',
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages']
            },
            {
              role: '@everyone',
              allow: ['ViewChannel', 'ReadMessageHistory'],
              deny: ['SendMessages']
            }
          ]
        },
        {
          name: `${prefix}-releases`,
          type: 'text',
          topic: 'Automated release announcements from GitHub',
          permissions: isPrivate ? [
            {
              role: 'Founder',
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages']
            },
            {
              role: 'Licensee',
              allow: ['ViewChannel', 'ReadMessageHistory'],
              deny: ['SendMessages']
            }
          ] : [
            {
              role: 'Founder',
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages']
            },
            {
              role: '@everyone',
              allow: ['ViewChannel', 'ReadMessageHistory'],
              deny: ['SendMessages']
            }
          ]
        },
        {
          name: `${prefix}-discussions`,
          type: 'text',
          topic: `Community discussions about ${repoName}`
        }
      ]
    };

    // Add category-level permissions (Founder always gets access)
    if (isPrivate) {
      newCategory.permissions = [
        {
          role: '@everyone',
          deny: ['ViewChannel']
        },
        {
          role: 'Founder',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels', 'ManageMessages']
        },
        {
          role: 'Licensee',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        }
      ];
    } else {
      // Public repos - Founder still gets admin access
      newCategory.permissions = [
        {
          role: 'Founder',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels', 'ManageMessages']
        }
      ];
    }

    // Add to config
    config.categories.push(newCategory);
    await saveConfig(config);

    // Update .env file
    const envContent = await fs.readFile(ENV_PATH, 'utf8');
    const envVarName = `${prefix.toUpperCase()}_REPO`;

    if (!envContent.includes(envVarName)) {
      const newEnvLine = `\n${envVarName}=${repoName}\n`;
      await fs.appendFile(ENV_PATH, newEnvLine, 'utf8');
    }

    await message.reply(
      `✅ Repository "${repoName}" added to configuration!\n` +
      `**GitHub Repo**: ${repoName}\n` +
      `**Type**: ${isPrivate ? 'Private (Licensee only)' : 'Public'}\n` +
      `**Channels**: ${prefix}-general, ${prefix}-feature-requests, ${prefix}-bug-reports, ${prefix}-commits, ${prefix}-releases, ${prefix}-discussions\n\n` +
      `Run \`!setup\` to create the Discord channels, then restart the bot to enable GitHub issue creation.`
    );

  } catch (error) {
    console.error('Error adding repo:', error);
    await message.reply(`❌ Error adding repository: ${error.message}`);
  }
}

// Remove repository command
async function removeRepoCommand(message, args) {
  if (!isAdmin(message.member)) {
    return message.reply('❌ You need Administrator permission to use this command.');
  }

  // Usage: !removerepo <repo-prefix>
  if (args.length < 1) {
    return message.reply('Usage: `!removerepo <repo-prefix>`\nExample: `!removerepo myproject`');
  }

  const prefix = args[0].toLowerCase();

  try {
    const config = await loadConfig();

    const categoryIndex = config.categories.findIndex(cat =>
      cat.name.toLowerCase().includes(prefix)
    );

    if (categoryIndex === -1) {
      return message.reply(`❌ Repository with prefix "${prefix}" not found.`);
    }

    const removed = config.categories.splice(categoryIndex, 1)[0];
    await saveConfig(config);

    await message.reply(
      `✅ Repository configuration removed: ${removed.name}\n\n` +
      `**Note**: This only removes it from the config. To delete Discord channels, use Discord's interface or run \`!cleanup\`.`
    );

  } catch (error) {
    console.error('Error removing repo:', error);
    await message.reply(`❌ Error removing repository: ${error.message}`);
  }
}

// List all configured repositories
async function listReposCommand(message) {
  try {
    const config = await loadConfig();

    const repoCategories = config.categories.filter(cat =>
      !['📢 GENERAL', '🛠️ SUPPORT'].some(name => cat.name.includes(name))
    );

    if (repoCategories.length === 0) {
      return message.reply('No repositories configured.');
    }

    let response = '**Configured Repositories:**\n\n';

    for (const cat of repoCategories) {
      const isPrivate = cat.permissions?.some(p => p.role === 'Licensee');
      const prefix = cat.channels[0].name.split('-')[0];
      response += `• **${cat.name}** (${isPrivate ? 'Private' : 'Public'})\n  Prefix: \`${prefix}\`\n`;
    }

    await message.reply(response);

  } catch (error) {
    console.error('Error listing repos:', error);
    await message.reply(`❌ Error listing repositories: ${error.message}`);
  }
}

// Add custom role command
async function addRoleCommand(message, args) {
  if (!isAdmin(message.member)) {
    return message.reply('❌ You need Administrator permission to use this command.');
  }

  // Usage: !addrole <role-name> <color-hex> [mentionable] [hoisted]
  if (args.length < 2) {
    return message.reply('Usage: `!addrole <role-name> <color-hex> [yes/no mentionable] [yes/no hoisted]`\nExample: `!addrole Contributor #00FF00 yes no`');
  }

  const roleName = args[0];
  const color = args[1];
  const mentionable = args[2]?.toLowerCase() === 'yes';
  const hoisted = args[3]?.toLowerCase() === 'yes';

  try {
    const config = await loadConfig();

    // Check if role already exists in config
    const exists = config.roles.find(r => r.name === roleName);
    if (exists) {
      return message.reply(`❌ Role "${roleName}" already exists in configuration.`);
    }

    // Add to config
    const newRole = {
      name: roleName,
      color: color,
      permissions: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
      mentionable: mentionable,
      hoist: hoisted
    };

    config.roles.push(newRole);
    await saveConfig(config);

    await message.reply(
      `✅ Role "${roleName}" added to configuration!\n` +
      `**Color**: ${color}\n` +
      `**Mentionable**: ${mentionable ? 'Yes' : 'No'}\n` +
      `**Hoisted**: ${hoisted ? 'Yes' : 'No'}\n\n` +
      `Run \`!setup\` to create the role in Discord.`
    );

  } catch (error) {
    console.error('Error adding role:', error);
    await message.reply(`❌ Error adding role: ${error.message}`);
  }
}

// Help command
async function helpCommand(message) {
  const isAdmin = message.member.permissions.has('Administrator') ||
                  message.member.roles.cache.some(role => role.name === 'Founder');

  const helpText = `
# 🤖 irsik Software Bot - Help Guide

Hi ${message.author.username}! I'm your Discord assistant for managing repositories, creating GitHub issues, and chatting with Claude AI.

---

## 💬 Talk to Me!

**Tag me anywhere:** \`@${message.guild.members.me.displayName} <your question>\`
${isAdmin ? '✅ **You have admin access** - I can execute commands, use GitHub CLI, and more!' : '👀 You can ask me questions, but I can\'t execute commands (admin/Founder only)'}

**Examples:**
• \`@${message.guild.members.me.displayName} What's in the QiFlow codebase?\`
• \`@${message.guild.members.me.displayName} readme QiFlow\` - Fetch README from any repo
• \`@${message.guild.members.me.displayName} Help me understand this feature\`

**In repo channels** (like #qiflow-general), I automatically know which repo we're talking about!

---

## 🐛 Create GitHub Issues

**Tag me in \`feature-requests\` or \`bug-reports\` channels:**
\`@${message.guild.members.me.displayName} <issue title>
<detailed description>\`

I'll automatically create a GitHub issue with proper labels!

---

## ⚙️ Basic Commands

\`!ping\` - Check if I'm alive (and my latency)
\`!help\` - Show this help message
\`!listrepos\` - List all configured repositories
${isAdmin ? '\n**Admin Commands:**' : ''}
${isAdmin ? '\`!clear\` or \`!reset\` - Clear conversation history for this channel' : ''}
${isAdmin ? '\`!purge [username]\` - Delete all messages from a user (defaults to bot)' : ''}
${isAdmin ? '\`!setup\` - Sync Discord server with configuration (creates/updates channels & roles)' : ''}

${isAdmin ? `---

## 🔧 Admin: Repository Management

\`!addrepo <name> [public|private]\` - Add a new repository to Discord
\`!removerepo <prefix>\` - Remove a repository from config

**Examples:**
\`!addrepo MyAwesomeProject\` - Creates public repo channels
\`!addrepo SecretSauce private\` - Creates private repo (Licensee only)

Each repo gets: \`-general\`, \`-feature-requests\`, \`-bug-reports\`, \`-commits\`, \`-releases\`, \`-discussions\`

---

## 👥 Admin: Role Management

\`!addrole <name> <color> [mentionable] [hoisted]\`

**Example:**
\`!addrole Contributor #00FF00 yes no\` - Creates a green, mentionable role

---

## 🧹 Admin: Message Management

\`!purge\` - Delete all bot messages in current channel
\`!purge @User\` - Delete all messages from a specific user
\`!purge Username\` - Also works with username (no @)

**Be careful!** This can't be undone. Messages are deleted one by one to respect Discord's rate limits.
` : ''}
---

## 🎯 Tips

• I'm powered by Claude AI using your Claude Code CLI subscription
• I have full access to repository code when chatting in repo channels
• Founder role gives you full admin access to all my features
• I automatically post commit and release notifications from GitHub
• Use \`!clear\` if you want to start a fresh conversation with me

**Need more help?** Just ask! I'm here to assist with anything related to the irsik Software projects.
  `.trim();

  await message.reply(helpText);
}

module.exports = {
  isAdmin,
  addRepoCommand,
  removeRepoCommand,
  listReposCommand,
  addRoleCommand,
  helpCommand,
};
