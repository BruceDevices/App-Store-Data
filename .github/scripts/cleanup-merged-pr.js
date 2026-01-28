#!/usr/bin/env node

const fs = require('fs');

// Function to remove labels from merged PR
async function cleanupMergedPR() {
    if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
        console.log('Not a pull request event, skipping cleanup');
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    
    if (!token || !repository) {
        console.log('Missing required environment variables (GITHUB_TOKEN, GITHUB_REPOSITORY)');
        return;
    }

    // Get PR number from event data
    let prNumber;
    if (process.env.GITHUB_EVENT_PATH) {
        try {
            const eventData = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
            prNumber = eventData.pull_request?.number;
            
            // Check if PR was actually merged
            if (!eventData.pull_request?.merged) {
                console.log('PR was closed but not merged, skipping cleanup');
                return;
            }
        } catch (error) {
            console.log('Could not read GitHub event data:', error.message);
            return;
        }
    }

    if (!prNumber) {
        console.log('Could not determine PR number');
        return;
    }

    const [owner, repo] = repository.split('/');

    try {
        // Get current labels on the PR
        const labelsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!labelsResponse.ok) {
            console.error(`Failed to get labels: ${labelsResponse.status} ${labelsResponse.statusText}`);
            return;
        }

        const labels = await labelsResponse.json();
        const currentLabelNames = labels.map(label => label.name);

        console.log(`🏷️ Current labels on PR #${prNumber}: ${currentLabelNames.join(', ')}`);

        // Define labels to remove on merge
        const labelsToRemove = [
            'review required',
            'missing metadata.json',
            'invalid metadata.json', 
            'missing logo.png',
            'external contribution'
        ];

        // Remove each label if it exists
        for (const labelName of labelsToRemove) {
            if (currentLabelNames.includes(labelName)) {
                const removeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels/${encodeURIComponent(labelName)}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (removeResponse.ok) {
                    console.log(`✅ Removed "${labelName}" label from merged PR #${prNumber}`);
                } else {
                    console.log(`⚠️ Could not remove "${labelName}" label: ${removeResponse.status} ${removeResponse.statusText}`);
                }
            } else {
                console.log(`ℹ️ Label "${labelName}" not found on PR #${prNumber}`);
            }
        }

        console.log('🎉 PR label cleanup completed');

    } catch (error) {
        console.error('❌ Error during PR cleanup:', error.message);
        process.exit(1);
    }
}

// Run the cleanup
cleanupMergedPR().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
});