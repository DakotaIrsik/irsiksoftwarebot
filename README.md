# NeonLadder Discord Bot

Discord bot for NeonLadder game development with AI integrations, GitHub workflows, and modular permission system.

## Quick Start

```bash
npm install
cp .env.example .env  # Fill in your tokens
npm start
```

## Features

### AI Integrations
- **GPT-5 Nano** - `/askgpt` - Cheap, fast responses ($0.05/$0.40 per M tokens)
- **Claude AI** - `@mention bot` - Deep contextual understanding via Claude CLI

### GitHub Integration
- `/readme` - Auto-fetch README from current channel's repo
- `/feature-request` - Submit feature with priority (CRITICAL → LOW)
  - URGENT/CRITICAL require admin approval
  - Auto-creates GitHub issues with labels
- `@bot` in feature-requests/bug-reports channels creates GitHub issues

### Admin Commands
- `/purge` - Silent message deletion (ephemeral, no trace)
- `/addrepo` / `/removerepo` - Manage repo categories
- `/addrole` - Create Discord roles
- `/setup` - Build server structure from config

### Utility
- `/ping` - Check latency
- `/clear` - Clear conversation history
- `/help` - Dynamic help (shows admin commands only to admins)
- `/listrepos` - List configured repositories

## Configuration

### Environment Variables

```env
# Required
DISCORD_TOKEN=your_bot_token
DISCORD_APPLICATION_ID=your_app_id

# Optional: AI Services
OPENAI_API_KEY=sk-...                    # For /askgpt
# Claude CLI must be installed separately for @mentions

# Optional: GitHub
GITHUB_TOKEN=ghp_...                     # For private repos
GITHUB_OWNER=irsiksoftware               # Your GitHub org/user

# Optional: Webhooks
ENABLE_WEBHOOKS=true
WEBHOOK_PORT=3000
WEBHOOK_SECRET=your_webhook_secret
```

### Permissions System

Control commands per server/channel/role in `config/permissions.json`:

```json
{
  "servers": {
    "default": {
      "enabled": false,              // New servers disabled by default
      "commands": []
    },
    "YOUR_SERVER_ID": {
      "name": "Your Server",
      "enabled": true,
      "commands": {
        "askgpt": {
          "enabled": true,
          "channels": ["*"],         // All channels
          "roles": ["*"]             // All roles
        },
        "feature-request": {
          "enabled": true,
          "channels": ["*-feature-requests"],  // Wildcard matching
          "roles": ["*"]
        },
        "purge": {
          "enabled": true,
          "channels": ["*"],
          "roles": ["Founder", "Administrator"],
          "requireAdmin": true       // Requires Discord admin permission
        }
      }
    }
  },
  "globalAdminRoles": ["Founder", "Administrator"]
}
```

**Get your server ID:**
```bash
node -e "require('dotenv').config(); const { Client, GatewayIntentBits } = require('discord.js'); const client = new Client({ intents: [GatewayIntentBits.Guilds] }); client.once('ready', () => { client.guilds.cache.forEach(g => console.log(g.id + ' - ' + g.name)); client.destroy(); }); client.login(process.env.DISCORD_TOKEN);"
```

## Architecture

```
src/
├── index.js                      # Entry point
├── client/
│   └── DiscordClient.js          # Bot initialization & command registration
├── commands/                     # Auto-loaded slash commands
│   ├── index.js                  # Command loader
│   ├── askgpt.js
│   ├── readme.js
│   ├── feature-request.js
│   └── ... (13 commands total)
├── handlers/
│   ├── interactionHandler.js    # Slash command execution
│   └── messageHandler.js        # @mentions, Claude AI integration
├── services/
│   ├── permissions.js           # Permission checking
│   ├── openai.js                # GPT integration
│   └── github.js                # Octokit wrapper
├── utils/
│   └── embed.js                 # Reusable embed builders
└── config/
    ├── permissions.json         # Server/command permissions
    └── discord-structure.json   # Server setup template
```

### Design Principles
- **DRY**: No duplicate code, reusable services
- **Modular**: Each command is isolated, auto-discovered
- **Secure**: Permission-first, default-deny for new servers
- **Extensible**: Add commands by creating files in `src/commands/`

## Adding Commands

Create `src/commands/mycommand.js`:

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mycommand')
    .setDescription('My command description'),

  async execute(interaction) {
    await interaction.reply('Hello!');
  }
};
```

Commands are automatically loaded and registered.

## Special Features

### Smart Repo Detection
Automatically detects repo from Discord channel category:
- Channel: `#qiflow-general`
- Category: `📦 QiFlow` → Strips emojis → `QiFlow`
- Fetches: `github.com/irsiksoftware/QiFlow/README.md`

### Feature Request Workflow
1. `/feature-request title:"..." description:"..." priority:URGENT`
2. Bot posts embed with ✅ reaction
3. Admin reacts ✅ within 24 hours → Creates GitHub issue
4. Timeout → Request cancelled

### Silent Purge
Uses ephemeral deferred reply + deleteReply() for completely invisible operation.

## Development

### Project Structure
- **Entry**: `src/index.js` (set in package.json)
- **Old Files**: `bot.js`, `commands.js` (legacy, can be deleted after testing)
- **Docs**: `src/README.md` (developer guide for architecture)

### Adding Services
Create `src/services/myservice.js` and import where needed. Services should be stateless and reusable.

### Testing
```bash
npm start  # Starts bot, auto-registers commands
```

Test in Discord:
1. `/ping` - Verify bot is online
2. `/help` - Check commands load correctly
3. `/askgpt test question` - Verify OpenAI integration
4. `@bot hello` - Verify Claude integration (requires Claude CLI)

## Troubleshooting

### Commands not showing
- Wait 1-5 minutes for Discord to sync commands
- Check bot has `applications.commands` scope
- Verify server ID in `config/permissions.json`

### Permission errors
- Ensure server is `enabled: true` in permissions.json
- Check command is enabled for your server
- Verify channel matches pattern (e.g., `*-feature-requests`)
- Confirm user has required roles

### OpenAI errors
- Verify `OPENAI_API_KEY` in .env
- Check model is `gpt-5-nano` in `src/services/openai.js`
- Ensure sufficient API credits

### GitHub errors
- Private repos need `GITHUB_TOKEN` with repo access
- Public repos work without token
- Check `GITHUB_OWNER` is set correctly

## Deployment

### Railway (Recommended)
1. Push to GitHub
2. Connect Railway to repo
3. Set environment variables in dashboard
4. Auto-deploys on push

### Self-Hosted
```bash
npm install
npm start  # Or use PM2: pm2 start src/index.js --name neonladder-bot
```

## License

Built for NeonLadder Unity 2.5D roguelite platformer project.
