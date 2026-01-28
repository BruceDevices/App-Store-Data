#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to get the last git commit timestamp for files in a category
function getLastCommitTimestampForCategory(category, categorizedApps) {
    try {
        // Get all file paths for this category
        const categoryApps = categorizedApps[category] || [];
        const filePaths = categoryApps.map(app => app.filePath + '/metadata.json');

        if (filePaths.length === 0) {
            console.log(`⚠️ No files found for category ${category}`);
            return Math.floor(Date.now() / 1000); // Current time as fallback
        }

        console.log(`🔍 Checking category ${category} with ${filePaths.length} files`);

        // Check if any of these specific files have uncommitted changes
        let hasUncommittedChanges = false;
        for (const filePath of filePaths) {
            try {
                const gitStatusCommand = `git status --porcelain "${filePath}"`;
                const statusResult = execSync(gitStatusCommand, {
                    encoding: 'utf8',
                    stdio: 'pipe',
                    cwd: path.join(__dirname, '..')
                }).trim();

                // If file shows up in git status, it has uncommitted changes
                if (statusResult) {
                    console.log(`📝 Found uncommitted changes in ${category}: ${filePath} (${statusResult})`);
                    hasUncommittedChanges = true;
                    // Don't break - continue checking to see all uncommitted files
                }
            } catch (statusError) {
                // Ignore git status errors for individual files
            }
        }

        // If any files in this category have uncommitted changes, use current time
        if (hasUncommittedChanges) {
            console.log(`⏰ Using current time for ${category} due to uncommitted changes`);
            return Math.floor(Date.now() / 1000);
        }

        // Get the most recent content change timestamp by checking actual file modifications
        let mostRecentTimestamp = 0;
        for (const filePath of filePaths) {
            try {
                // First try to get the filesystem modification time
                const stats = fs.statSync(filePath);
                const fileModTime = Math.floor(stats.mtime.getTime() / 1000);
                console.log(`📂 File system time for ${filePath}: ${fileModTime} (${new Date(fileModTime * 1000).toISOString()})`);
                
                // Also try to get git blame to see when content was last actually changed
                const gitBlameCommand = `git log --format=%ct -1 --diff-filter=M -- "${filePath}"`;
                let gitTimestamp = 0;
                try {
                    const result = execSync(gitBlameCommand, {
                        encoding: 'utf8',
                        stdio: 'pipe',
                        cwd: path.join(__dirname, '..')
                    }).trim();
                    
                    if (result) {
                        gitTimestamp = parseInt(result);
                        console.log(`📋 Git modification time for ${filePath}: ${gitTimestamp} (${new Date(gitTimestamp * 1000).toISOString()})`);
                    }
                } catch (gitError) {
                    console.log(`⚠️ Git blame failed for ${filePath}, using file system time`);
                }
                
                // Use the older of the two timestamps (git is more reliable for committed content)
                const timestamp = gitTimestamp > 0 ? gitTimestamp : fileModTime;
                if (timestamp > mostRecentTimestamp) {
                    mostRecentTimestamp = timestamp;
                }
            } catch (error) {
                console.log(`❌ Error checking ${filePath}: ${error.message}`);
            }
        }

        // If we found at least one valid timestamp, use the most recent
        if (mostRecentTimestamp > 0) {
            console.log(`✅ Using git timestamp for ${category}: ${mostRecentTimestamp} (${new Date(mostRecentTimestamp * 1000).toISOString()})`);
            return mostRecentTimestamp;
        }

        // Fallback to current time if no commits found
        console.log(`⚠️ No git timestamps found for ${category}, using current time`);
        return Math.floor(Date.now() / 1000);
    } catch (error) {
        console.warn(`⚠️ Could not get git timestamp for category ${category}: ${error.message}`);
        // Fallback to current time
        return Math.floor(Date.now() / 1000);
    }
}

// Function to recursively find all metadata.json files
function findMetadataFiles(dir) {
    const metadataFiles = [];

    if (!fs.existsSync(dir)) {
        return metadataFiles;
    }

    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
            // Recursively search subdirectories
            metadataFiles.push(...findMetadataFiles(fullPath));
        } else if (item.name === 'metadata.json') {
            metadataFiles.push(fullPath);
        }
    }

    return metadataFiles;
}

// Function to load and validate metadata
function loadMetadata(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const metadata = JSON.parse(content);

        // Basic validation - ensure required fields exist
        const requiredFields = ['name', 'category', 'description', 'version', 'commit', 'owner', 'repo', 'path'];
        for (const field of requiredFields) {
            if (!(field in metadata) || metadata[field] === null || metadata[field] === undefined || metadata[field] === '') {
                console.warn(`⚠️ Skipping ${filePath}: missing or empty field '${field}'`);
                return null;
            }
        }

        // Add file path for reference
        metadata.filePath = path.dirname(filePath).replace(/\\/g, '/');

        return metadata;
    } catch (error) {
        console.warn(`⚠️ Skipping ${filePath}: ${error.message}`);
        return null;
    }
}

// Function to load valid categories
function loadValidCategories() {
    try {
        const categoriesPath = path.join(__dirname, '..', 'categories.json');
        const categoriesContent = fs.readFileSync(categoriesPath, 'utf8');
        return JSON.parse(categoriesContent);
    } catch (error) {
        console.warn(`⚠️ Could not load categories.json: ${error.message}`);
        return [];
    }
}

// Main function
async function main() {
    console.log('🔄 Generating release files...');

    // Load valid categories
    const validCategories = loadValidCategories();
    console.log(`📋 Valid categories: ${validCategories.join(', ')}`);

    // Find all metadata files
    const repositoriesDir = path.join(__dirname, '..', 'repositories');
    const metadataFiles = findMetadataFiles(repositoriesDir);
    console.log(`📁 Found ${metadataFiles.length} metadata files`);

    if (metadataFiles.length === 0) {
        console.log('ℹ️ No metadata files found. No release files will be generated.');
        return;
    }

    // Group metadata by category
    const categorizedApps = {};
    let processedCount = 0;
    let skippedCount = 0;

    for (const filePath of metadataFiles) {
        const metadata = loadMetadata(filePath);
        if (metadata) {
            const category = metadata.category;

            if (!categorizedApps[category]) {
                categorizedApps[category] = [];
            }

            categorizedApps[category].push(metadata);
            processedCount++;
            console.log(`✅ Added ${metadata.name} to category '${category}'`);
        } else {
            skippedCount++;
        }
    }

    console.log(`📊 Processed: ${processedCount}, Skipped: ${skippedCount}`);

    // Create releases directory if it doesn't exist
    const releasesDir = path.join(__dirname, '..', 'releases');
    if (!fs.existsSync(releasesDir)) {
        fs.mkdirSync(releasesDir, { recursive: true });
        console.log(`📁 Created releases directory`);
    }

    // Generate release files for each category
    const releaseFiles = [];
    const categoriesWithReleases = [];
    for (const [category, apps] of Object.entries(categorizedApps)) {
        const releaseFileName = `category-${category.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
        const releaseFilePath = path.join(releasesDir, releaseFileName);

        // Sort apps by name for consistent ordering
        apps.sort((a, b) => a.name.localeCompare(b.name));

        // Filter out unwanted fields from apps for category files
        const filteredApps = apps.map(app => {
            const { commit, owner, repo, path, filePath, category, files, ...cleanApp } = app;
            // Add slug in format: owner/repo/appname
            cleanApp.slug = `${owner}/${repo}/${app.name}`;

            // Include supported-devices if present (apps/scripts only, not themes)
            const isTheme = app.category === 'Themes';
            if (app['supported-devices'] && !isTheme) {
                cleanApp['supported-devices'] = app['supported-devices'];
            }

            // Include supported-screen-size if present (themes only)
            if (app['supported-screen-size'] && isTheme) {
                cleanApp['supported-screen-size'] = app['supported-screen-size'];
            }

            return cleanApp;
        });

        const releaseData = {
            category: category,
            count: apps.length,
            apps: filteredApps
        };

        try {
            // Write with pretty formatting
            fs.writeFileSync(releaseFilePath, JSON.stringify(releaseData, null, 2), 'utf8');
            releaseFiles.push(releaseFileName);
            categoriesWithReleases.push(category);
            console.log(`📄 Generated ${releaseFileName} with ${apps.length} apps`);
        } catch (error) {
            console.error(`❌ Failed to write ${releaseFileName}: ${error.message}`);
        }
    }

    // Generate categories.json file with categories that have releases
    if (categoriesWithReleases.length > 0) {
        const categoriesFilePath = path.join(releasesDir, 'categories.json');

        // Create categories array with counts and lastUpdated timestamps
        const categoriesWithCounts = categoriesWithReleases.map(category => {
            const categorySlug = category.toLowerCase().replace(/[^a-z0-9]/g, '-');

            // Get last commit timestamp for this category's metadata files
            const lastUpdated = getLastCommitTimestampForCategory(category, categorizedApps);

            return {
                name: category,
                slug: categorySlug,
                count: categorizedApps[category].length,
                lastUpdated: lastUpdated
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        const categoriesData = {
            totalCategories: categoriesWithReleases.length,
            totalApps: Object.values(categorizedApps).reduce((sum, apps) => sum + apps.length, 0),
            lastUpdated: Math.floor(Date.now() / 1000),
            categories: categoriesWithCounts
        };

        try {
            fs.writeFileSync(categoriesFilePath, JSON.stringify(categoriesData, null, 2), 'utf8');
            console.log(`📄 Generated categories.json with ${categoriesWithReleases.length} categories`);
        } catch (error) {
            console.error(`❌ Failed to write categories.json: ${error.message}`);
        }
    }

    // Clean up old release files that are no longer needed
    const existingReleaseFiles = fs.readdirSync(releasesDir)
        .filter(file => file.startsWith('category-') && file.endsWith('.json'));

    for (const existingFile of existingReleaseFiles) {
        if (!releaseFiles.includes(existingFile)) {
            try {
                fs.unlinkSync(path.join(releasesDir, existingFile));
                console.log(`🗑️ Removed obsolete file: ${existingFile}`);
            } catch (error) {
                console.warn(`⚠️ Could not remove ${existingFile}: ${error.message}`);
            }
        }
    }

    // Generate summary
    console.log('');
    console.log('📋 Summary:');
    console.log(`   Categories: ${Object.keys(categorizedApps).length}`);
    console.log(`   Total apps: ${processedCount}`);
    console.log(`   Release files: ${releaseFiles.length}`);

    if (releaseFiles.length > 0) {
        console.log('');
        console.log('📄 Generated files:');
        for (const file of releaseFiles) {
            console.log(`   - ${file}`);
        }
    }

    console.log('✅ Release file generation complete!');
}

// Run the script
main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
});