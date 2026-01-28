#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to get the last git commit timestamp for a category release file
function getLastCommitTimestampForCategoryFile(categorySlug) {
    console.log(`\n🔍 DEBUG: Getting timestamp for category slug '${categorySlug}'`);
    
    try {
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
        console.warn(`⚠️ Could not get git timestamp for category slug ${categorySlug}: ${error.message}`);
        console.log(`🔍 DEBUG: Error details: ${error.stack}`);
        // Fallback to current time
        const errorFallbackTimestamp = Math.floor(Date.now() / 1000);
        console.log(`🔍 DEBUG: Error fallback timestamp: ${errorFallbackTimestamp} (${new Date(errorFallbackTimestamp * 1000).toISOString()})`);
        return errorFallbackTimestamp;
    }
}

// Function to read category data from existing category files
function readCategoryFiles() {
    const releasesDir = path.join(__dirname, '..', 'releases');
    const categories = [];
    
    console.log(`📁 Reading category files from: ${releasesDir}`);
    
    if (!fs.existsSync(releasesDir)) {
        console.log('❌ Releases directory does not exist');
        return [];
    }

    const categoryFiles = fs.readdirSync(releasesDir)
        .filter(file => file.startsWith('category-') && file.endsWith('.json') && file !== 'categories.json');
    
    console.log(`📄 Found ${categoryFiles.length} category files:`, categoryFiles);

    for (const categoryFile of categoryFiles) {
        try {
            const filePath = path.join(releasesDir, categoryFile);
            const content = fs.readFileSync(filePath, 'utf8');
            const categoryData = JSON.parse(content);
            
            const categorySlug = categoryFile.replace('category-', '').replace('.json', '');
            
            console.log(`✅ Read category '${categoryData.category}' (${categoryData.count} apps) from ${categoryFile}`);
            
            categories.push({
                name: categoryData.category,
                slug: categorySlug,
                count: categoryData.count,
                filePath: categoryFile
            });
        } catch (error) {
            console.warn(`⚠️ Could not read ${categoryFile}: ${error.message}`);
        }
    }
    
    return categories;
}

// Main function
async function main() {
    console.log('🔄 Generating categories.json with timestamps...');

    // Read existing category files
    const categories = readCategoryFiles();
    
    if (categories.length === 0) {
        console.log('ℹ️ No category files found. Please run generate-category-files.js first.');
        return;
    }

    // Add timestamps to each category
    console.log('\n🕒 Getting timestamps for categories...');
    const categoriesWithTimestamps = [];
    
    for (const category of categories) {
        console.log(`\n🏷️ DEBUG: Processing category '${category.name}' (slug: ${category.slug})`);
        const lastUpdated = getLastCommitTimestampForCategoryFile(category.slug);
        console.log(`🏷️ DEBUG: Final timestamp for '${category.name}': ${lastUpdated} (${new Date(lastUpdated * 1000).toISOString()})`);

        const categoryWithTimestamp = {
            name: category.name,
            slug: category.slug,
            count: category.count,
            lastUpdated: lastUpdated
        };
        
        console.log(`🏷️ DEBUG: Category data for '${category.name}':`, JSON.stringify(categoryWithTimestamp, null, 2));
        categoriesWithTimestamps.push(categoryWithTimestamp);
    }

    // Sort by name
    categoriesWithTimestamps.sort((a, b) => a.name.localeCompare(b.name));

    // Create final categories.json structure
    const categoriesData = {
        totalCategories: categoriesWithTimestamps.length,
        totalApps: categoriesWithTimestamps.reduce((sum, cat) => sum + cat.count, 0),
        categories: categoriesWithTimestamps
    };

    // Write categories.json
    const categoriesFilePath = path.join(__dirname, '..', 'releases', 'categories.json');
    
    try {
        fs.writeFileSync(categoriesFilePath, JSON.stringify(categoriesData, null, 2), 'utf8');
        console.log(`\n📄 Generated categories.json with ${categoriesWithTimestamps.length} categories`);
        
        // Show summary with timestamps
        console.log('\n📋 Summary:');
        console.log(`   Total categories: ${categoriesData.totalCategories}`);
        console.log(`   Total apps: ${categoriesData.totalApps}`);
        console.log('\n🕒 Category timestamps:');
        for (const cat of categoriesWithTimestamps) {
            console.log(`   ${cat.name}: ${new Date(cat.lastUpdated * 1000).toISOString()}`);
        }
        
        console.log('\n✅ Categories.json generation complete!');
    } catch (error) {
        console.error(`❌ Failed to write categories.json: ${error.message}`);
        process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
});