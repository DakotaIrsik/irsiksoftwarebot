const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.WEBHOOK_PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Store Discord client reference
let discordClient = null;

function setDiscordClient(client) {
    discordClient = client;
    console.log('✓ Discord client set for webhooks');
}

// Middleware to verify GitHub webhook signature
function verifyGitHubSignature(req, res, next) {
    if (!WEBHOOK_SECRET) {
        console.warn('WARNING: WEBHOOK_SECRET not set, skipping signature verification');
        return next();
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        return res.status(401).send('No signature provided');
    }

    const hash = 'sha256=' + crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (signature !== hash) {
        return res.status(401).send('Invalid signature');
    }

    next();
}

app.use(express.json());

// GitHub webhook endpoint
app.post('/webhook/github', verifyGitHubSignature, async (req, res) => {
    const event = req.headers['x-github-event'];
    const payload = req.body;

    console.log(`Received GitHub webhook: ${event}`);

    if (!discordClient) {
        console.error('Discord client not initialized');
        return res.status(500).send('Discord client not ready');
    }

    try {
        const guild = discordClient.guilds.cache.first(); // Use first guild
        if (!guild) {
            console.error('Guild not found');
            return res.status(500).send('Guild not found');
        }

        // Determine which repo
        const repoName = payload.repository.name.toLowerCase();
        const channelPrefix = repoName;

        if (event === 'push') {
            await handlePushEvent(guild, channelPrefix, payload);
        } else if (event === 'release') {
            await handleReleaseEvent(guild, channelPrefix, payload);
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error handling webhook:', error);
        res.status(500).send('Error processing webhook');
    }
});

async function handlePushEvent(guild, channelPrefix, payload) {
    // Try to find a commits channel
    const possibleNames = [
        `${channelPrefix}-commits`,
        `${channelPrefix}-github`,
        'git-commits',
        'commits',
        'github'
    ];

    let channel = null;
    for (const name of possibleNames) {
        channel = guild.channels.cache.find(c => c.name === name);
        if (channel) break;
    }

    if (!channel) {
        console.warn(`No suitable channel found for commits (tried: ${possibleNames.join(', ')})`);
        return;
    }

    const commits = payload.commits || [];
    const branch = payload.ref.replace('refs/heads/', '');
    const pusher = payload.pusher.name;
    const repoName = payload.repository.name;

    if (commits.length === 0) return;

    // Create embed for commits
    const embed = {
        color: 0x5865F2,
        title: `📝 ${commits.length} new commit${commits.length > 1 ? 's' : ''} to ${repoName}`,
        description: `**Branch:** \`${branch}\`\n**Pushed by:** ${pusher}`,
        fields: commits.slice(0, 5).map(commit => ({
            name: commit.message.split('\n')[0].substring(0, 100),
            value: `[\`${commit.id.substring(0, 7)}\`](${commit.url}) - ${commit.author.name}`,
            inline: false,
        })),
        timestamp: new Date().toISOString(),
        footer: {
            text: payload.repository.full_name,
        },
    };

    if (commits.length > 5) {
        embed.fields.push({
            name: '...',
            value: `And ${commits.length - 5} more commit${commits.length - 5 > 1 ? 's' : ''}`,
            inline: false,
        });
    }

    await channel.send({ embeds: [embed] });
    console.log(`Posted ${commits.length} commits to #${channel.name}`);
}

async function handleReleaseEvent(guild, channelPrefix, payload) {
    if (payload.action !== 'published') return;

    // Try to find a releases channel
    const possibleNames = [
        `${channelPrefix}-releases`,
        `${channelPrefix}-announcements`,
        'releases',
        'announcements'
    ];

    let channel = null;
    for (const name of possibleNames) {
        channel = guild.channels.cache.find(c => c.name === name);
        if (channel) break;
    }

    if (!channel) {
        console.warn(`No suitable channel found for releases (tried: ${possibleNames.join(', ')})`);
        return;
    }

    const release = payload.release;
    const repoName = payload.repository.name;

    const embed = {
        color: 0x57F287,
        title: `🚀 New Release: ${release.name || release.tag_name}`,
        description: release.body || 'No release notes provided',
        url: release.html_url,
        fields: [
            {
                name: 'Tag',
                value: `\`${release.tag_name}\``,
                inline: true,
            },
            {
                name: 'Repository',
                value: repoName,
                inline: true,
            },
            {
                name: 'Author',
                value: release.author.login,
                inline: true,
            },
        ],
        timestamp: release.published_at,
        footer: {
            text: payload.repository.full_name,
        },
    };

    await channel.send({ embeds: [embed] });
    console.log(`Posted release ${release.tag_name} to #${channel.name}`);
}

function startWebhookServer() {
    app.listen(PORT, () => {
        console.log(`✓ Webhook server listening on port ${PORT}`);
        console.log(`  Configure GitHub webhooks to: http://your-server:${PORT}/webhook/github`);
    });
}

module.exports = {
    setDiscordClient,
    startWebhookServer,
};
