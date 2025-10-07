const { initializeClient } = require('./client/DiscordClient');

// Global error handlers
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Initialize and start the bot
(async () => {
    try {
        console.log('🚀 Starting NeonLadder Discord Bot...\n');
        await initializeClient();
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
})();
