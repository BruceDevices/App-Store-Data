#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Rate limiting for GitHub API calls
const API_DELAY = 1000; // 1 second between API calls
let lastApiCall = 0;

// GitHub API helper with rate limiting and authentication
async function githubApiCall(url, options = {}) {
    // Ensure we don't exceed rate limits
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    if (timeSinceLastCall < API_DELAY) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY - timeSinceLastCall));
    }
    lastApiCall = Date.now();

    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'App-Store-Data-Validator/1.0',
        ...options.headers
    };

    // Add authentication if available
    const token = process.env.GITHUB_TOKEN;
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        // Handle rate limit headers
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const resetTime = response.headers.get('X-RateLimit-Reset');
        
        if (remaining && parseInt(remaining) < 10) {
            console.log(`⚠️  GitHub API rate limit low: ${remaining} calls remaining`);
            if (resetTime) {
                const resetDate = new Date(parseInt(resetTime) * 1000);
                console.log(`   Rate limit resets at: ${resetDate.toLocaleTimeString()}`);
            }
        }

        return response;
    } catch (error) {
        console.log(`⚠️  GitHub API error for ${url}: ${error.message}`);
        throw error;
    }
}

// Cache for commit verification results
const commitVerificationCache = new Map();

// Function to verify commit exists (cached)
async function verifyCommitExists(owner, repo, commit) {
    const cacheKey = `${owner}/${repo}@${commit}`;
    
    if (commitVerificationCache.has(cacheKey)) {
        return commitVerificationCache.get(cacheKey);
    }

    try {
        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${commit}`;
        const response = await githubApiCall(githubUrl);

        const result = {
            exists: response.status === 200,
            status: response.status
        };
        
        commitVerificationCache.set(cacheKey, result);
        return result;
    } catch (error) {
        const result = {
            exists: false,
            error: error.message
        };
        commitVerificationCache.set(cacheKey, result);
        return result;
    }
}

// Cache for commit verification results
const gitTreesCache = new Map();

// Function to get all files in a repository at a specific commit
async function getRepositoryFiles(owner, repo, commit) {
    const cacheKey = `${owner}/${repo}@${commit}`;
    
    if (gitTreesCache.has(cacheKey)) {
        return gitTreesCache.get(cacheKey);
    }

    try {
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`;
        const response = await githubApiCall(treeUrl);

        if (response.status === 200) {
            const data = await response.json();
            // Create a Set of file paths for fast lookup
            const filePaths = new Set(
                data.tree
                    .filter(item => item.type === 'blob') // Only files, not directories
                    .map(item => item.path)
            );
            
            gitTreesCache.set(cacheKey, filePaths);
            return filePaths;
        } else if (response.status === 404) {
            console.log(`      - ❌ Repository or commit not found: ${owner}/${repo}@${commit}`);
            return null;
        } else {
            console.log(`      - ⚠️  Could not fetch repository tree (status: ${response.status})`);
            return null;
        }
    } catch (error) {
        console.log(`      - ⚠️  Could not fetch repository tree: ${error.message}`);
        return null;
    }
}

// Function to execute git commands safely
function gitCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch (error) {
        return null;
    }
}

// Function to load valid categories from categories.json
function loadValidCategories() {
    try {
        const categoriesPath = path.join(__dirname, '..', '..', 'categories.json');
        const categoriesContent = fs.readFileSync(categoriesPath, 'utf8');
        const categoriesData = JSON.parse(categoriesContent);

        return categoriesData;
    } catch (error) {
        console.log(`❌ Could not load \`categories.json\` - ${error.message}`);
        console.log('Please ensure \`categories.json\` exists and contains a valid JSON array of category names');
        return null;
    }
}

// Function to load supported devices from supported-devices.json
function loadSupportedDevices() {
    try {
        const devicesPath = path.join(__dirname, '..', '..', 'supported-devices.json');
        const devicesContent = fs.readFileSync(devicesPath, 'utf8');
        const devicesData = JSON.parse(devicesContent);

        return devicesData;
    } catch (error) {
        console.log(`❌ Could not load \`supported-devices.json\` - ${error.message}`);
        console.log('Please ensure \`supported-devices.json\` exists and contains a valid JSON array of device names');
        return null;
    }
}

// Function to read PNG dimensions
function getPngDimensions(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        
        // Check PNG signature
        const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        for (let i = 0; i < pngSignature.length; i++) {
            if (buffer[i] !== pngSignature[i]) {
                return null; // Not a valid PNG
            }
        }
        
        // Read width and height from IHDR chunk (bytes 16-23)
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        
        return { width, height };
    } catch (error) {
        return null;
    }
}

// Function to compare semantic versions (returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal)
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }
    return 0;
}

// Function to validate JSON structure
async function validateMetadata(filePath, dir, prAuthor) {
    let hasErrors = false;
    let metadata;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        metadata = JSON.parse(content);
    } catch (error) {
        console.log(`    - ❌ Invalid JSON format`);
        return { success: false, metadataInfo: '' };
    }
    console.log(`    - ✅ Valid JSON format`);

    // Required fields
    const requiredFields = ['name', 'category', 'description', 'version', 'commit', 'owner', 'repo', 'path'];
    console.log(`    - 🔍 Checking required fields...`);
    // Check each required field exists
    let fieldsValid = true;
    for (const field of requiredFields) {
        if (!(field in metadata)) {
            console.log(`      - ❌ Missing required field: \`${field}\``);
            hasErrors = true;
            fieldsValid = false;
        } else {
            // Check field is not null or empty string
            const value = metadata[field];
            if (value === null || value === undefined || value === '') {
                console.log(`      - ❌ Field \`${field}\` is null or empty`);
                hasErrors = true;
                fieldsValid = false;
            } else {
                console.log(`      - ✅ Field \`${field}\`: \`${value}\``);
            }
        }
    }

    // Validate field formats
    console.log(`    - 🔍 Validating fields...`);
    if (metadata.version) {
        const version = metadata.version;
        if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
            console.log(`      - ❌ Version \`${version}\` must be in format X.Y.Z`);
            hasErrors = true;
        } else {
            console.log(`      - ✅ Version format valid: \`${version}\``);
        }
    }

    if (metadata.commit) {
        const commit = metadata.commit;
        if (!/^[a-f0-9]{40}$/.test(commit)) {
            console.log(`      - ❌ Commit \`${commit}\` must be a valid 40-character SHA hash`);
            hasErrors = true;
        } else {
            console.log(`      - ✅ Commit hash format valid: \`${commit}...\``);

            // Verify commit exists on GitHub using owner/repo from metadata
            if (metadata.owner && metadata.repo) {
                const verification = await verifyCommitExists(metadata.owner, metadata.repo, commit);
                
                if (verification.exists) {
                    console.log(`      - ✅ Commit \`${commit}...\` exists on GitHub`);
                } else if (verification.status === 404) {
                    console.log(`      - ❌ Commit \`${commit}...\` not found in ${metadata.owner}/${metadata.repo}`);
                    hasErrors = true;
                } else if (verification.error) {
                    console.log(`      - ⚠️  Could not verify commit on GitHub: ${verification.error}`);
                } else {
                    console.log(`      - ⚠️  Could not verify commit on GitHub (status: ${verification.status})`);
                }
            } else {
                console.log(`      - ⚠️  Cannot verify commit without owner/repo information`);
            }
        }
    }

    // Validate category (loaded from categories.json)
    if (metadata.category) {
        const category = metadata.category;
        const validCategories = loadValidCategories();
        if (!validCategories) {
            console.log(`      - ❌ Could not load valid categories list`);
            hasErrors = true;
        } else if (!validCategories.includes(category)) {
            console.log(`      - ❌ Category \`${category}\` is not in valid list: ${validCategories.join(', ')}`);
            hasErrors = true;
        } else {
            console.log(`      - ✅ Category valid: \`${category}\``);
        }
    }

    // Validate supported-screen-size (required for themes)
    const isTheme = metadata.category === 'Themes' || metadata.category === 'Theme';
    if (isTheme) {
        if (!metadata['supported-screen-size']) {
            console.log(`      - ❌ Field 'supported-screen-size' is required for themes`);
            hasErrors = true;
        } else {
            const screenSize = metadata['supported-screen-size'];
            if (typeof screenSize !== 'string') {
                console.log(`      - ❌ supported-screen-size must be a string`);
                hasErrors = true;
            } else if (!/^\d+x\d+$/.test(screenSize)) {
                console.log(`      - ❌ supported-screen-size must be in format 'widthxheight' (e.g., '320x170')`);
                hasErrors = true;
            } else {
                const [width, height] = screenSize.split('x').map(Number);
                if (width <= 0 || height <= 0) {
                    console.log(`      - ❌ supported-screen-size dimensions must be positive numbers`);
                    hasErrors = true;
                } else {
                    console.log(`      - ✅ Screen size valid: \`${screenSize}\` (${width}x${height})`);
                }
            }
        }
    } else {
        // For non-themes, supported-screen-size should not be present
        if (metadata['supported-screen-size']) {
            console.log(`      - ❌ Field 'supported-screen-size' is only allowed for themes`);
            hasErrors = true;
        }
    }

    // Validate supported-devices (not allowed for themes)
    if (metadata['supported-devices']) {
        if (isTheme) {
            console.log(`      - ❌ Field 'supported-devices' is not allowed for themes`);
            hasErrors = true;
        } else {
            const supportedDevices = metadata['supported-devices'];
            const validDevices = loadSupportedDevices();
            
            if (!validDevices) {
                console.log(`      - ❌ Could not load supported devices list`);
                hasErrors = true;
            } else {
                if (Array.isArray(supportedDevices)) {
                    // Array of device names
                    let allValid = true;
                    for (const device of supportedDevices) {
                        if (!validDevices.includes(device)) {
                            console.log(`      - ❌ Device \`${device}\` is not in supported devices list`);
                            hasErrors = true;
                            allValid = false;
                        }
                    }
                    if (allValid) {
                        console.log(`      - ✅ All devices valid: \`${supportedDevices.join(', ')}\``);
                    }
                } else if (typeof supportedDevices === 'string') {
                    // Check if it's a direct device name or regex pattern
                    if (validDevices.includes(supportedDevices)) {
                        console.log(`      - ✅ Device valid: \`${supportedDevices}\``);
                    } else {
                        // Try as regex pattern
                        try {
                            const regex = new RegExp(supportedDevices);
                            const matchingDevices = validDevices.filter(device => regex.test(device));
                            
                            if (matchingDevices.length > 0) {
                                console.log(`      - ✅ Regex pattern \`${supportedDevices}\` matches ${matchingDevices.length} devices: ${matchingDevices.join(', ')}`);
                            } else {
                                console.log(`      - ❌ Regex pattern \`${supportedDevices}\` doesn't match any devices`);
                                hasErrors = true;
                            }
                        } catch (regexError) {
                            console.log(`      - ❌ Invalid device name or regex pattern: \`${supportedDevices}\``);
                            hasErrors = true;
                        }
                    }
                } else {
                    console.log(`      - ❌ supported-devices must be a string, regex pattern, or array of device names`);
                    hasErrors = true;
                }
            }
        }
    }

    // Validate folder structure matches /repositories/owner/reponame/ format
    if (metadata.owner && metadata.repo) {
        console.log(`    - 🔍 Checking folder structure...`);
        const expectedPath = `repositories/${metadata.owner}/${metadata.repo}`;
        const actualPath = path.dirname(filePath).replace(/\\/g, '/'); // Normalize path separators
        
        if (actualPath.includes(expectedPath)) {
            console.log(`      - ✅ Folder structure valid: contains \`${expectedPath}\``);
        } else {
            console.log(`      - ❌ Folder structure invalid: expected path containing \`${expectedPath}\`, got \`${actualPath}\``);
            hasErrors = true;
        }
    } else {
        console.log(`    - ⚠️  Cannot validate folder structure without owner/repo information`);
    }

    // Validate files array if present
    if (metadata.files) {
        console.log(`    - 🔍 Validating files array...`);
        
        if (!Array.isArray(metadata.files)) {
            console.log(`      - ❌ Field \`files\` must be an array`);
            hasErrors = true;
        } else {
            console.log(`      - ✅ Files field is a valid array with ${metadata.files.length} entries`);
            
            // Check each file exists in the repository at the specified commit
            if (metadata.owner && metadata.repo && metadata.commit) {
                console.log(`      - 🔍 Fetching repository file tree...`);
                const repositoryFiles = await getRepositoryFiles(metadata.owner, metadata.repo, metadata.commit);
                
                if (repositoryFiles) {
                    console.log(`      - ✅ Repository tree loaded (${repositoryFiles.size} files)`);
                    
                    for (const file of metadata.files) {
                        let filePath;
                        let displayPath;
                        
                        if (typeof file === 'string') {
                            // String format: direct file path
                            const cleanFilePath = file.startsWith('/') ? file.substring(1) : file;
                            // Normalize metadata.path and join with file path
                            const basePath = metadata.path === '/' ? '' : metadata.path.replace(/^\/+|\/+$/g, '');
                            filePath = basePath ? `${basePath}/${cleanFilePath}` : cleanFilePath;
                            displayPath = file;
                        } else if (typeof file === 'object' && file !== null) {
                            // Object format: must have 'source' and 'destination' properties
                            if (!file.source || !file.destination) {
                                console.log(`      - ❌ File object must contain 'source' and 'destination' properties: \`${JSON.stringify(file)}\``);
                                hasErrors = true;
                                continue;
                            }
                            if (typeof file.source !== 'string' || typeof file.destination !== 'string') {
                                console.log(`      - ❌ File object 'source' and 'destination' must be strings: \`${JSON.stringify(file)}\``);
                                hasErrors = true;
                                continue;
                            }
                            // Use source path for verification, combined with metadata.path
                            const cleanSourcePath = file.source.startsWith('/') ? file.source.substring(1) : file.source;
                            // Normalize metadata.path and join with source path
                            const basePath = metadata.path === '/' ? '' : metadata.path.replace(/^\/+|\/+$/g, '');
                            filePath = basePath ? `${basePath}/${cleanSourcePath}` : cleanSourcePath;
                            displayPath = `${file.source} → ${file.destination}`;
                        } else {
                            console.log(`      - ❌ File entry must be a string or object with 'source' and 'destination' properties: \`${file}\``);
                            hasErrors = true;
                            continue;
                        }
                        
                        // Check if file exists in the repository tree
                        if (repositoryFiles.has(filePath)) {
                            console.log(`      - ✅ File exists at commit: \`${displayPath}\` (path: ${filePath})`);
                        } else {
                            console.log(`      - ❌ File not found at commit \`${metadata.commit}...\`: \`${displayPath}\` (expected path: ${filePath})`);
                            hasErrors = true;
                        }
                    }
                } else {
                    console.log(`      - ⚠️  Could not verify files - repository tree unavailable`);
                }
            } else {
                console.log(`      - ⚠️  Cannot verify files without owner/repo/commit information`);
            }
        }
    }


    // Check for version changes
    let previousVersion = '';
    let previousCommit = '';
    let versionStatus = 'new version';

    if (!hasErrors) {
        console.log(`    - 🔍 Checking version history...`);
        // Try to get the previous version from base branch
        const baseBranch = process.env.GITHUB_BASE_REF || 'main';
        const previousContent = gitCommand(`git show origin/${baseBranch}:"${filePath}"`) || 
                               gitCommand(`git show ${baseBranch}:"${filePath}"`) ||
                               gitCommand(`git show origin/main:"${filePath}"`) || 
                               gitCommand(`git show main:"${filePath}"`);
        console.log(`      - 🔍 Current version: ${metadata.version}`);
        
        if (previousContent) {
            console.log(`      - ✅ Found previous file in main branch`);
            try {
                const previousMetadata = JSON.parse(previousContent);
                if (previousMetadata.version) {
                    previousVersion = previousMetadata.version;
                    previousCommit = previousMetadata.commit || '';
                    console.log(`      - 📋 Previous version: ${previousVersion}`);

                    const versionComparison = compareVersions(metadata.version, previousVersion);
                    if (versionComparison > 0) {
                        // Check if commit has been updated even with version increment
                        if (previousCommit && metadata.commit && previousCommit === metadata.commit) {
                            console.log(`      - ❌ Commit must be updated: ${metadata.commit}... is same as previous commit`);
                            versionStatus = `${previousVersion} → ${metadata.version} (❌ Same commit)`;
                            hasErrors = true;
                        } else {
                            versionStatus = `${previousVersion} → ${metadata.version} (✅ Version updated)`;
                            console.log(`      - ✅ Version updated: ${previousVersion} → ${metadata.version}`);
                        }
                    } else if (versionComparison === 0) {
                        versionStatus = `${metadata.version} (❌ Version unchanged)`;
                        console.log(`      - ❌ Version must be incremented: ${metadata.version} is same as previous version`);
                        hasErrors = true;
                    } else {
                        versionStatus = `${metadata.version} (❌ Version downgrade)`;
                        console.log(`      - ❌ Version must be incremented: ${metadata.version} is lower than previous ${previousVersion}`);
                        hasErrors = true;
                    }
                } else {
                    console.log(`      - ⚠️ Previous file has no version field`);
                    versionStatus = `${metadata.version} (🆕 New submission)`;
                    console.log(`      - ✅ New version added: ${metadata.version}`);
                }
            } catch (error) {
                console.log(`      - ⚠️ Previous file is not valid JSON: ${error.message}`);
                versionStatus = `${metadata.version} (🆕 New submission)`;
                console.log(`      - ✅ New app detected: ${metadata.version}`);
            }
        } else {
            console.log(`      - ⚠️ No previous file found in main branch`);
            versionStatus = `${metadata.version} (🆕 New submission)`;
            console.log(`      - ✅ New app detected: ${metadata.version}`);
        }
    }

    if (!hasErrors) {
        console.log(`    - ✅ All validation checks passed`);
    }

    // Store metadata info for PR comment
    const owner = metadata.owner;
    const repo = metadata.repo;
    let compareLink = '';

    console.log(`      - 🔍 Compare link check:`);
    
    // Create commit links
    const previousCommitLink = previousCommit ? 
        `https://github.com/${owner}/${repo}/commit/${previousCommit}` : null;
    const currentCommitLink = metadata.commit ? 
        `https://github.com/${owner}/${repo}/commit/${metadata.commit}` : null;
    
    if (previousCommitLink) {
        console.log(`        - Previous commit: [${previousCommit.substring(0, 8)}...](${previousCommitLink})`);
    } else {
        console.log(`        - Previous commit: \`None\``);
    }
    
    if (currentCommitLink) {
        console.log(`        - Current commit: [${metadata.commit.substring(0, 8)}...](${currentCommitLink})`);
    } else {
        console.log(`        - Current commit: \`None\``);
    }
    
    console.log(`        - Owner/Repo: ${owner}/${repo}`);

    if (previousCommit && metadata.commit && previousCommit !== metadata.commit) {
        compareLink = `https://github.com/${owner}/${repo}/compare/${previousCommit}...${metadata.commit}`;
        console.log(`        - ✅ Compare link generated: ${compareLink}`);
    } else {
        if (!previousCommit) {
            console.log(`        - ⚠️ No previous commit available`);
        } else if (!metadata.commit) {
            console.log(`        - ⚠️ No current commit available`);
        } else if (previousCommit === metadata.commit) {
            console.log(`        - ℹ️ Commits are identical, no changes to compare`);
        }
        console.log(`        - 🚫 No compare link generated`);
    }

    // Write metadata info to return for PR comment
    let metadataInfo = `### ${metadata.name} (${path.dirname(filePath)})\n`;
    metadataInfo += `${!hasErrors ? '✅ **Validation Passed**' : '❌ **Validation Failed**'}\n`;
    metadataInfo += `- **Repository:** [${metadata.owner}/${metadata.repo}](https://github.com/${metadata.owner}/${metadata.repo})\n`;
    metadataInfo += `- **Path:** \`${metadata.path}\`\n`;
    metadataInfo += `- **Version:** ${versionStatus}\n`;
    metadataInfo += `- **Category:** ${metadata.category}\n`;
    
    // Check for cross-repository contribution
    if (prAuthor && metadata.owner && prAuthor !== metadata.owner) {
        metadataInfo += `- **⚠️ Cross-Repository Contribution:** PR by \`${prAuthor}\`, repository owned by \`${metadata.owner}\`\n`;
    }
    
    if (compareLink) {
        metadataInfo += `- **Changes:** [View commit comparison](${compareLink})\n`;
    }
    metadataInfo += '\n';

    return { success: !hasErrors, metadataInfo }; // Return success status and metadata info
}

// Function to manage PR labels
async function managePRLabels(hasMetadataIssues, hasMissingMetadata, hasInvalidMetadata, hasMissingLogo, validationSuccess, isExternalContribution) {
    if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    const issueNumber = process.env.PR_NUMBER ||
        (process.env.GITHUB_EVENT_PATH ?
            JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).number :
            null);

    if (!token || !repository || !issueNumber) {
        console.log('Missing required environment variables for label management');
        return;
    }

    const [owner, repo] = repository.split('/');
    const labelsToManage = ['missing metadata.json', 'invalid metadata.json', 'missing logo.png', 'review required', 'external contribution'];

    try {
        // Get current labels
        const currentLabelsResponse = await githubApiCall(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`);

        let currentLabels = [];
        if (currentLabelsResponse.ok) {
            currentLabels = await currentLabelsResponse.json();
        }

        const currentLabelNames = currentLabels.map(label => label.name);

        // Determine which labels should be present
        const labelsToAdd = [];
        const labelsToRemove = [];

        if (hasMissingMetadata) {
            if (!currentLabelNames.includes('missing metadata.json')) {
                labelsToAdd.push('missing metadata.json');
            }
        } else {
            if (currentLabelNames.includes('missing metadata.json')) {
                labelsToRemove.push('missing metadata.json');
            }
        }

        if (hasInvalidMetadata) {
            if (!currentLabelNames.includes('invalid metadata.json')) {
                labelsToAdd.push('invalid metadata.json');
            }
        } else {
            if (currentLabelNames.includes('invalid metadata.json')) {
                labelsToRemove.push('invalid metadata.json');
            }
        }

        if (hasMissingLogo) {
            if (!currentLabelNames.includes('missing logo.png')) {
                labelsToAdd.push('missing logo.png');
            }
        } else {
            if (currentLabelNames.includes('missing logo.png')) {
                labelsToRemove.push('missing logo.png');
            }
        }

        // Manage 'review required' label
        if (validationSuccess) {
            if (!currentLabelNames.includes('review required')) {
                labelsToAdd.push('review required');
            }
        } else {
            if (currentLabelNames.includes('review required')) {
                labelsToRemove.push('review required');
            }
        }

        // Manage 'external contribution' label
        if (isExternalContribution) {
            if (!currentLabelNames.includes('external contribution')) {
                labelsToAdd.push('external contribution');
            }
        } else {
            if (currentLabelNames.includes('external contribution')) {
                labelsToRemove.push('external contribution');
            }
        }

        // Add labels
        for (const labelName of labelsToAdd) {
            await githubApiCall(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    labels: [labelName]
                })
            });
            console.log(`Added label: ${labelName}`);
        }

        // Remove labels
        for (const labelName of labelsToRemove) {
            await githubApiCall(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(labelName)}`, {
                method: 'DELETE'
            });
            console.log(`Removed label: ${labelName}`);
        }

    } catch (error) {
        console.error('Error managing PR labels:', error);
    }
}

// Function to post PR comment
async function postPRComment(validationSuccess, individualAppDetails, summary, metadataInfo) {
    console.log(`DEBUG: GITHUB_EVENT_NAME = "${process.env.GITHUB_EVENT_NAME}"`);
    
    if (process.env.GITHUB_EVENT_NAME !== 'pull_request' && process.env.GITHUB_EVENT_NAME !== 'pull_request_target') {
        console.log('Not a pull request, skipping PR comment');
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    const issueNumber = process.env.PR_NUMBER ||
        (process.env.GITHUB_EVENT_PATH ?
            JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).number :
            null);

    console.log('Environment variables for PR comment:');
    console.log(`  GITHUB_TOKEN: ${token ? 'present' : 'missing'}`);
    console.log(`  GITHUB_REPOSITORY: ${repository}`);
    console.log(`  PR_NUMBER: ${issueNumber}`);
    console.log(`  GITHUB_EVENT_NAME: ${process.env.GITHUB_EVENT_NAME}`);

    if (!token || !repository || !issueNumber) {
        console.log('Missing required environment variables for PR comment');
        return;
    }

    const [owner, repo] = repository.split('/');
    console.log(`Attempting to post comment to ${owner}/${repo}#${issueNumber}`);

    // Build individual app sections
    let appDetailsSection = '';
    for (const { metadataInfo: appMetadataInfo, validationOutput } of individualAppDetails) {
        if (appMetadataInfo && appMetadataInfo.trim()) {
            appDetailsSection += appMetadataInfo;
            appDetailsSection += `<details>\n<summary>🔍 Validation Steps (click to expand)</summary>\n\n`;
            appDetailsSection += validationOutput;
            appDetailsSection += `\n</details>\n\n`;
        }
    }

    let commentBody;

    if (validationSuccess) {
        commentBody = `# ✅ Validation Passed

## 📦 Updated Apps/Components:

${appDetailsSection}`;
    } else {
        commentBody = `# ❌ Validation Failed

## 📦 Apps/Components Being Updated:

${appDetailsSection}
## Summary of Issues:

${summary}

## Please address the above issues and push new commits to this pull request for re-validation.

Please check the documentation for guidance on resolving validation errors [here](https://github.com/BruceDevices/App-Store-Data/blob/main/README.md#-common-validation-errors).`;
    }

    try {
        // Find and update previous validation comments
        const commentsResponse = await githubApiCall(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`);

        if (commentsResponse.ok) {
            const comments = await commentsResponse.json();

            // Find previous validation comments (those starting with validation headers)
            // but exclude ones that are already superseded
            const previousValidationComments = comments.filter(comment =>
                (comment.body.includes('# ✅ Validation Passed') ||
                    comment.body.includes('# ❌ Validation Failed')) &&
                !comment.body.includes('🔄 Superseded by new commit')
            );

            // Update previous comments to show they're superseded
            for (const comment of previousValidationComments) {
                const supersededBody = `<details>
<summary>🔄 Superseded by new commit</summary>

${comment.body}

</details>`;

                await githubApiCall(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${comment.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        body: supersededBody
                    })
                });
            }
        }

        // Post new comment
        const response = await githubApiCall(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                body: commentBody
            })
        });

        if (response.ok) {
            console.log('Successfully posted PR comment');
        } else {
            const errorText = await response.text();
            console.error(`Failed to post PR comment: ${response.status} ${response.statusText}`);
            console.error(errorText);
        }
    } catch (error) {
        console.error('Error posting PR comment:', error);
    }
}

// Main validation logic
async function main() {
    // Get actual changed files from git
    // For pull_request_target, we need to compare against the base branch
    const baseBranch = process.env.GITHUB_BASE_REF || 'main';
    const changedFiles = gitCommand(`git diff --name-only origin/${baseBranch}...HEAD`) || 
                        gitCommand(`git diff --name-only ${baseBranch}...HEAD`) ||
                        gitCommand('git diff --name-only HEAD~1 HEAD');
    
    if (!changedFiles) {
        console.log('No changed files detected');
        return;
    }

    const changedFileList = changedFiles.split('\n').filter(f => f.trim());
    console.log('Changed files:', changedFileList.join(', '));

    // Find directories containing metadata.json files that were changed
    const metadataDirectories = [];
    
    for (const file of changedFileList) {
        if (file.endsWith('metadata.json')) {
            const metadataDir = path.dirname(file);
            const metadataPath = path.join(metadataDir, 'metadata.json');
            const logoPath = path.join(metadataDir, 'logo.png');
            
            // Check if both files exist in filesystem
            if (fs.existsSync(metadataPath)) {
                metadataDirectories.push({
                    directory: metadataDir,
                    metadataFile: metadataPath,
                    logoFile: logoPath
                });
            }
        }
    }

    console.log(`Found ${metadataDirectories.length} directories with changed metadata.json files`);

    let validationFailed = false;
    let metadataFound = false;
    let hasInvalidMetadata = false;
    let hasMissingLogo = false;
    let isExternalContribution = false;
    let prAuthor = null;

    // Check if this is an external contribution
    if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_EVENT_PATH) {
        try {
            const eventData = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
            prAuthor = eventData.pull_request.user.login;
            
            console.log(`🔍 Checking contribution type - PR Author: ${prAuthor}`);
            
            // Extract owners from changed metadata files
            const repositoryOwners = new Set();
            for (const { directory } of metadataDirectories) {
                const pathParts = directory.split(path.sep);
                const repoIndex = pathParts.indexOf('repositories');
                if (repoIndex >= 0 && pathParts.length > repoIndex + 1) {
                    const owner = pathParts[repoIndex + 1];
                    repositoryOwners.add(owner);
                    console.log(`  - Found repository owner: ${owner}`);
                }
            }
            
            // Check if PR author is not one of the repository owners
            if (repositoryOwners.size > 0 && !repositoryOwners.has(prAuthor)) {
                isExternalContribution = true;
                console.log(`  - ✅ External contribution detected: ${prAuthor} is not in [${Array.from(repositoryOwners).join(', ')}]`);
            } else if (repositoryOwners.has(prAuthor)) {
                console.log(`  - ℹ️ Author contribution: ${prAuthor} is the repository owner`);
            } else {
                console.log(`  - ⚠️ Could not determine repository owners from folder structure`);
            }
        } catch (error) {
            console.log(`  - ⚠️ Could not check contribution type: ${error.message}`);
        }
    }

    console.log('📂 Processing changed metadata.json files...');
    console.log('');

    // Group directories by repository to optimize API calls
    const repoGroups = new Map();
    for (const { directory, metadataFile, logoFile } of metadataDirectories) {
        // Extract owner/repo from directory path
        const pathParts = directory.split(path.sep);
        const repoIndex = pathParts.indexOf('repositories');
        if (repoIndex >= 0 && pathParts.length > repoIndex + 2) {
            const owner = pathParts[repoIndex + 1];
            const repo = pathParts[repoIndex + 2];
            const repoKey = `${owner}/${repo}`;
            
            if (!repoGroups.has(repoKey)) {
                repoGroups.set(repoKey, { owner, repo, directories: [] });
            }
            repoGroups.get(repoKey).directories.push({ directory, metadataFile, logoFile });
        } else {
            // Fallback: treat as individual directory
            repoGroups.set(directory, { owner: null, repo: null, directories: [{ directory, metadataFile, logoFile }] });
        }
    }

    // Initialize metadata info collection
    let allMetadataInfo = '';
    let individualAppDetails = []; // Store details for each individual app

    // Process each repository group
    for (const [repoKey, { owner, repo, directories }] of repoGroups) {
        if (owner && repo) {
            console.log(`📋 Repository: ${repoKey}`);
            console.log('');
        }
        
        // Process each directory in this repository
        for (const { directory, metadataFile, logoFile } of directories) {
            console.log(`📁 Processing: \`${directory}\``);
            console.log('');
            
            // Capture validation output for this directory
            let directoryOutput = '';
            const originalLog = console.log;
            const originalError = console.error;

            console.log = (...args) => {
                const message = args.join(' ');
                directoryOutput += message + '\n';
                originalLog(...args);
            };

            console.error = (...args) => {
                const message = args.join(' ');
                directoryOutput += message + '\n';
                originalError(...args);
            };

            // Validate this directory
            const result = await validateDirectoryFiles(directory, metadataFile, logoFile, prAuthor);
            
            // Track missing logos
            if (result.hasMissingLogo) {
                hasMissingLogo = true;
            }
            
            // Restore console functions
            console.log = originalLog;
            console.error = originalError;
            
            // Add metadata info if we got it
            if (result.directoryMetadataInfo) {
                allMetadataInfo += result.directoryMetadataInfo;
                
                // Store individual app details
                individualAppDetails.push({
                    metadataInfo: result.directoryMetadataInfo,
                    validationOutput: directoryOutput.trim()
                });
                
                // Show metadata summary for this directory
                console.log('📋 **Metadata Summary:**');
                console.log(result.directoryMetadataInfo.trim());
                console.log('');
            }
            
            console.log('─'.repeat(80));
            console.log('');
        }
        
        if (owner && repo) {
            console.log('═'.repeat(80));
            console.log('');
        }
    }

    async function validateDirectoryFiles(dirPath, metadataFile, logoPath, prAuthor) {
        let directoryValid = true;
        let directoryMetadataInfo = '';
        
        // Check for metadata.json
        console.log(`  - 📄 \`metadata.json\``);
        if (fs.existsSync(metadataFile)) {
            console.log(`    - ✅ File exists`);
            metadataFound = true;

            // Validate metadata.json
            const result = await validateMetadata(metadataFile, dirPath, prAuthor);
            if (!result.success) {
                validationFailed = true;
                hasInvalidMetadata = true;
                directoryValid = false;
            }
            directoryMetadataInfo = result.metadataInfo;
        } else {
            console.log(`    - ❌ File not found`);
            directoryValid = false;
        }

        // Check for logo.png
        console.log(`  - 📄 \`logo.png\``);
        if (fs.existsSync(logoPath)) {
            console.log(`    - ✅ File exists`);
            
            // Check logo dimensions
            console.log(`    - 🔍 Checking logo dimensions...`);
            const dimensions = getPngDimensions(logoPath);
            if (dimensions) {
                const { width, height } = dimensions;
                console.log(`      - ℹ️ Logo size: ${width}x${height}`);
                
                if (width < 64 || height < 64) {
                    console.log(`      - ❌ Logo too small: minimum size is 64x64`);
                    validationFailed = true;
                    directoryValid = false;
                } else if (width > 512 || height > 512) {
                    console.log(`      - ❌ Logo too large: maximum size is 512x512`);
                    validationFailed = true;
                    directoryValid = false;
                } else if (width !== height) {
                    console.log(`      - ❌ Logo must be square: ${width}x${height} is not square`);
                    validationFailed = true;
                    directoryValid = false;
                } else {
                    console.log(`      - ✅ Logo size valid: ${width}x${height}`);
                }
            } else {
                console.log(`      - ❌ Unable to read logo dimensions (not a valid PNG?)`);
                validationFailed = true;
                directoryValid = false;
            }
        } else {
            console.log(`    - ❌ File not found`);
            validationFailed = true;
            directoryValid = false;
        }
        
        return { directoryValid, directoryMetadataInfo, hasMissingLogo: !fs.existsSync(logoPath) };
    }

    let validationSuccess = false;
    let hasMissingMetadata = false;
    let summary = '';

    if (!metadataFound) {
        summary += '❌ **No metadata.json files found in changed directories**\n\n';
        summary += 'When adding new apps or components, each directory must include a metadata.json file. ';
        summary += 'Please add a metadata.json file following the required format.\n\n';
        validationSuccess = false;
        hasMissingMetadata = true;
    } else if (validationFailed || hasMissingLogo) {
        if (hasMissingLogo) {
            summary += '❌ **Missing \`logo.png\` files in directories with \`metadata.json\`**\n\n';
        }
        if (hasInvalidMetadata) {
            summary += '❌ **Invalid metadata.json files detected**\n\n';
        }
        summary += 'Please fix the errors shown in the **🔍 Validation Steps** output above.\n\n';
        validationSuccess = false;
    } else {
        summary += '✅ **All files are valid!**\n\n';
        summary += 'All metadata.json files and logo.png files passed validation checks.';
        validationSuccess = true;
    }

    // Manage PR labels based on validation results
    await managePRLabels(!validationSuccess, hasMissingMetadata, hasInvalidMetadata, hasMissingLogo, validationSuccess, isExternalContribution);

    // Post PR comment with the collected validation output and metadata info
    await postPRComment(validationSuccess, individualAppDetails, summary, allMetadataInfo);

    // Exit with appropriate code
    if (!validationSuccess) {
        process.exit(1);
    }
}

// Call main function
main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
});
