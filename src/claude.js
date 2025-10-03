const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Map of repo names to their local paths
const REPO_PATHS = {
  'QiFlow': process.env.QIFLOW_PATH || 'C:\\Code\\QiFlow',
  'QiFlowGo': process.env.QIFLOWGO_PATH || 'C:\\Code\\QiFlowGo',
  'LogSmith': process.env.LOGSMITH_PATH || 'C:\\Code\\LogSmith',
  'TalkSmith': process.env.TALKSMITH_PATH || 'C:\\Code\\TalkSmith',
  'Jesus': process.env.JESUS_PATH || 'C:\\Code\\Jesus',
};

// Check if user is admin (has Founder role or Administrator permission)
function isUserAdmin(member) {
  // Check if user has Administrator permission
  if (member.permissions.has('Administrator')) {
    return true;
  }

  // Check if user has Founder role
  const founderRole = member.roles.cache.find(role => role.name === 'Founder');
  return !!founderRole;
}

// Execute claude-code CLI with a prompt
async function executeClaudeCLI(prompt, cwd) {
  return new Promise((resolve, reject) => {
    const output = [];
    const errors = [];

    // Spawn claude-code CLI process
    const claudeProcess = spawn('claude', [prompt], {
      cwd,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Collect stdout
    claudeProcess.stdout.on('data', (data) => {
      output.push(data.toString());
    });

    // Collect stderr
    claudeProcess.stderr.on('data', (data) => {
      errors.push(data.toString());
    });

    // Handle process completion
    claudeProcess.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          output: output.join(''),
          errors: errors.join(''),
        });
      } else {
        reject(new Error(`claude-code CLI exited with code ${code}: ${errors.join('')}`));
      }
    });

    // Handle process errors
    claudeProcess.on('error', (error) => {
      reject(new Error(`Failed to spawn claude-code CLI: ${error.message}`));
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      claudeProcess.kill();
      reject(new Error('Claude CLI timeout (2 minutes)'));
    }, 120000);
  });
}

// Get repo context from channel name
function getRepoContext(channelName) {
  if (channelName.startsWith('qiflowgo-')) return 'QiFlowGo';
  if (channelName.startsWith('qiflow-')) return 'QiFlow';
  if (channelName.startsWith('logsmith-')) return 'LogSmith';
  if (channelName.startsWith('talksmith-')) return 'TalkSmith';
  if (channelName.startsWith('jesus-')) return 'Jesus';
  return null;
}

// Get working directory for repo
function getRepoPath(repoName) {
  return REPO_PATHS[repoName] || null;
}

// Main Claude conversation handler using CLI
async function handleClaudeConversation(message) {
  const member = message.member;
  const channelName = message.channel.name;
  const isAdmin = isUserAdmin(member);

  // Get repo context
  const repoName = getRepoContext(channelName);
  const repoPath = repoName ? getRepoPath(repoName) : process.cwd();

  // Extract user message
  const userMessage = message.content.replace(/<@!?\d+>/g, '').trim();

  // Build context prompt
  let contextPrefix = '';

  if (repoName) {
    contextPrefix = `[Context: ${repoName} repository]\n`;
  }

  if (!isAdmin) {
    contextPrefix += `[Note: User does not have admin privileges - do not execute commands or suggest dangerous operations]\n`;
  }

  const fullPrompt = contextPrefix + userMessage;

  try {
    // Call claude-code CLI
    console.log(`Executing claude CLI in ${repoPath}`);
    console.log(`Prompt: ${fullPrompt.substring(0, 100)}...`);

    const result = await executeClaudeCLI(fullPrompt, repoPath);

    if (result.success) {
      // Clean up the output - remove ANSI codes and control characters
      let cleanOutput = result.output
        .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
        .replace(/[\r\n]+/g, '\n')       // Normalize line breaks
        .trim();

      // Limit output length for Discord
      if (cleanOutput.length > 1800) {
        cleanOutput = cleanOutput.substring(0, 1800) + '\n\n... (output truncated)';
      }

      return cleanOutput || 'Claude responded but produced no output.';
    } else {
      throw new Error('Claude CLI execution failed');
    }
  } catch (error) {
    console.error('Claude CLI error:', error);
    throw error;
  }
}

// Handle message using claude-code CLI
async function handleMessage(message) {
  // Each CLI invocation is stateless - claude-code CLI doesn't maintain conversation state
  // between calls, but it has access to the full repo context
  const response = await handleClaudeConversation(message);
  return response;
}

// Clear conversation history for a channel (no-op for CLI, but kept for compatibility)
function clearConversation(channelId) {
  // Claude CLI doesn't maintain state, so nothing to clear
  console.log(`Conversation cleared for channel ${channelId} (no-op for CLI)`);
}

module.exports = {
  handleMessage,
  clearConversation,
  isUserAdmin,
  getRepoContext,
};
