#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to get the last git commit timestamp for a category release file
function getLastCommitTimestampForCategory(category, categorizedApps) {
    console.log(`\n🔍 DEBUG: Getting timestamp for category '${category}'`);
    
    try {
        // Get the category release file path
        const categorySlug = category.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const categoryFilePath = `releases/category-${categorySlug}.json`;
        
        console.log(`🔍 DEBUG: Looking for timestamp of category file: ${categoryFilePath}`);

        // First check if the category file has uncommitted changes
        try {
            const gitStatusCommand = `git status --porcelain "${categoryFilePath}"`;
            console.log(`🔍 DEBUG: Running git status for: ${categoryFilePath}`);
            const statusResult = execSync(gitStatusCommand, {
                encoding: 'utf8',
                stdio: 'pipe',
                cwd: path.join(__dirname, '..')
            }).trim();

            // If file shows up in git status, it has uncommitted changes
            if (statusResult) {
                console.log(`📝 Found uncommitted changes in category file: ${categoryFilePath}`);
                console.log(`🔍 DEBUG: Status result: ${statusResult}`);
                const currentTimestamp = Math.floor(Date.now() / 1000);
                console.log(`🔍 DEBUG: Returning current timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`);
                return currentTimestamp; // Use current time for uncommitted changes
            } else {
                console.log(`🔍 DEBUG: No uncommitted changes found for: ${categoryFilePath}`);
            }
        } catch (statusError) {
            console.log(`🔍 DEBUG: Git status error for ${categoryFilePath}: ${statusError.message}`);
        }

        // Use git log to get the most recent commit timestamp for the category file
        const gitCommand = `git log -1 --format=%ct --follow -- "${categoryFilePath}"`;
        
        console.log(`🔍 DEBUG: Running git command: ${gitCommand}`);
        console.log(`🔍 DEBUG: Working directory: ${path.join(__dirname, '..')}`);

        const result = execSync(gitCommand, {
            encoding: 'utf8',
            stdio: 'pipe',
            cwd: path.join(__dirname, '..')
        }).trim();

        console.log(`🔍 DEBUG: Git command result: '${result}'`);
        
        if (result) {
            const timestamp = parseInt(result);
            console.log(`🔍 DEBUG: Parsed timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
            return timestamp;
        }

        // Fallback to current time if no commits found (new category file)
        const fallbackTimestamp = Math.floor(Date.now() / 1000);
        console.log(`🔍 DEBUG: No commits found for category file (probably new), using fallback timestamp: ${fallbackTimestamp} (${new Date(fallbackTimestamp * 1000).toISOString()})`);
        return fallbackTimestamp;
    } catch (error) {
        console.warn(`⚠️ Could not get git timestamp for category ${category}: ${error.message}`);
        console.log(`🔍 DEBUG: Error details: ${error.stack}`);
        // Fallback to current time
        const errorFallbackTimestamp = Math.floor(Date.now() / 1000);
        console.log(`🔍 DEBUG: Error fallback timestamp: ${errorFallbackTimestamp} (${new Date(errorFallbackTimestamp * 1000).toISOString()})`);
        return errorFallbackTimestamp;
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

            console.log(`🔍 DEBUG: Loading app '${metadata.name}' from ${metadata.filePath} into category '${category}'`);

            if (!categorizedApps[category]) {
                categorizedApps[category] = [];
                console.log(`🔍 DEBUG: Created new category '${category}'`);
            }

            categorizedApps[category].push(metadata);
            processedCount++;
            console.log(`✅ Added ${metadata.name} to category '${category}' (${categorizedApps[category].length} apps in this category)`);
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
            console.log(`\n🏷️ DEBUG: Processing category '${category}' for timestamp assignment`);
            const lastUpdated = getLastCommitTimestampForCategory(category, categorizedApps);
            console.log(`🏷️ DEBUG: Final timestamp for '${category}': ${lastUpdated} (${new Date(lastUpdated * 1000).toISOString()})`);

            const categoryData = {
                name: category,
                slug: categorySlug,
                count: categorizedApps[category].length,
                lastUpdated: lastUpdated
            };
            
            console.log(`🏷️ DEBUG: Category data for '${category}':`, JSON.stringify(categoryData, null, 2));
            
            return categoryData;
        }).sort((a, b) => a.name.localeCompare(b.name));

        const categoriesData = {
            totalCategories: categoriesWithReleases.length,
            totalApps: Object.values(categorizedApps).reduce((sum, apps) => sum + apps.length, 0),
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