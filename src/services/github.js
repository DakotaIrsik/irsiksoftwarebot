const { Octokit } = require('@octokit/rest');
require('dotenv').config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'irsiksoftware';

/**
 * Fetch README from GitHub repository
 * @param {string} repoName - Repository name
 * @returns {Promise<string>} - README content in markdown
 */
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

/**
 * Create a GitHub issue
 * @param {string} repo - Repository name
 * @param {string} title - Issue title
 * @param {string} body - Issue body
 * @param {string} issueType - Type of issue ('feature' or 'bug')
 * @param {string} author - Discord username of the author
 * @param {Array<string>} additionalLabels - Additional labels to add
 * @returns {Promise<object>} - Created issue object
 */
async function createGitHubIssue(repo, title, body, issueType, author, additionalLabels = []) {
    const labels = issueType === 'feature' ? ['enhancement'] : ['bug'];
    labels.push(...additionalLabels);

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

/**
 * Create a GitHub issue with priority
 * @param {object} params - Issue parameters
 * @param {string} params.repo - Repository name
 * @param {string} params.title - Issue title
 * @param {string} params.body - Issue body
 * @param {string} params.priority - Priority level (critical, urgent, high, medium, low)
 * @param {string} params.author - Discord username
 * @param {string} params.approvedBy - Discord username of approver (optional)
 * @returns {Promise<object>} - Created issue object
 */
async function createFeatureRequest({ repo, title, body, priority, author, approvedBy = null }) {
    const priorityLabel = `priority: ${priority}`;

    let issueBody = `${body}\n\n---\n**Priority:** ${priority.toUpperCase()}\n**Requested by:** ${author} via Discord`;

    if (approvedBy) {
        issueBody += `\n**Approved by:** ${approvedBy}`;
    }

    try {
        const response = await octokit.rest.issues.create({
            owner: GITHUB_OWNER,
            repo: repo,
            title: title,
            body: issueBody,
            labels: ['enhancement', priorityLabel]
        });

        return response.data;
    } catch (error) {
        console.error('Error creating feature request:', error);
        throw error;
    }
}

/**
 * Detect repository name from channel's parent category
 * Removes emojis from category name to get clean repo name
 * @param {object} channel - Discord channel object
 * @returns {string|null} - Repository name or null if not found
 */
function detectRepoFromChannel(channel) {
    // Get the parent category
    const parent = channel.parent;

    if (!parent) {
        return null;
    }

    // Extract repo name from category, removing all emojis
    // (e.g., "📦 QiFlow" -> "QiFlow", "🔒 QiFlow" -> "QiFlow")
    const categoryName = parent.name;
    const repoName = categoryName
        .replace(/[\u{1F000}-\u{1F9FF}]/gu, '') // Remove emojis
        .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Remove misc symbols
        .trim();

    return repoName;
}

module.exports = {
    fetchRepoReadme,
    createGitHubIssue,
    createFeatureRequest,
    detectRepoFromChannel,
    octokit,
    GITHUB_OWNER
};
