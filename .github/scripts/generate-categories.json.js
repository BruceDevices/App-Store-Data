#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to get the last git commit timestamp for a category release file
function getLastCommitTimestampForCategoryFile(categorySlug) {
    console.log(`\n🔍 DEBUG: Getting timestamp for category slug '${categorySlug}'`);
    
    try {
        const categoryFilePath = `releases/category-${categorySlug}.json`;
        const workingDir = path.join(__dirname, '../..');
        const fullFilePath = path.join(workingDir, categoryFilePath);
        
        console.log(`🔍 DEBUG: Looking for timestamp of category file: ${categoryFilePath}`);
        console.log(`🔍 DEBUG: Working directory: ${workingDir}`);
        console.log(`🔍 DEBUG: Full file path: ${fullFilePath}`);
        console.log(`🔍 DEBUG: File exists: ${fs.existsSync(fullFilePath)}`);

        // Check git repository state
        try {
            const gitStatusGlobal = execSync('git status --porcelain', {
                encoding: 'utf8',
                stdio: 'pipe',
                cwd: workingDir
            }).trim();
            console.log(`🔍 DEBUG: Git status (first 5 lines):\n${gitStatusGlobal.split('\n').slice(0, 5).join('\n')}`);
        } catch (e) {
            console.log(`🔍 DEBUG: Git status error: ${e.message}`);
        }

        // Check if we have a shallow repository
        try {
            const shallowCheck = execSync('git rev-parse --is-shallow-repository', {
                encoding: 'utf8',
                stdio: 'pipe',
                cwd: workingDir
            }).trim();
            console.log(`🔍 DEBUG: Shallow repository: ${shallowCheck}`);
            
            if (shallowCheck === 'true') {
                console.log('🔍 DEBUG: Repository is shallow, attempting to unshallow...');
                try {
                    execSync('git fetch --unshallow', {
                        encoding: 'utf8',
                        stdio: 'pipe',
                        cwd: workingDir
                    });
                    console.log('🔍 DEBUG: Successfully unshallowed repository');
                } catch (unshallowError) {
                    console.log(`🔍 DEBUG: Could not unshallow: ${unshallowError.message}`);
                }
            }
        } catch (e) {
            console.log(`🔍 DEBUG: Could not check shallow status: ${e.message}`);
        }

        // Try multiple git log approaches
        const gitCommands = [
            `git log -1 --format=%ct --follow -- "${categoryFilePath}"`,
            `git log -1 --format=%ct -- "${categoryFilePath}"`,
            `git log -1 --format=%ct --all -- "${categoryFilePath}"`,
            `git log --format=%ct -n 1 -- "${categoryFilePath}"`,
        ];

        for (let i = 0; i < gitCommands.length; i++) {
            const gitCommand = gitCommands[i];
            console.log(`🔍 DEBUG: Trying git command ${i + 1}/${gitCommands.length}: ${gitCommand}`);

            try {
                const result = execSync(gitCommand, {
                    encoding: 'utf8',
                    stdio: 'pipe',
                    cwd: workingDir
                }).trim();

                console.log(`🔍 DEBUG: Git command ${i + 1} result: '${result}'`);
                
                if (result) {
                    const timestamp = parseInt(result);
                    console.log(`🔍 DEBUG: Parsed timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
                    
                    // Sanity check - timestamp should be reasonable (not too old, not in future)
                    const now = Math.floor(Date.now() / 1000);
                    const oneYearAgo = now - (365 * 24 * 60 * 60);
                    const oneHourFromNow = now + (60 * 60);
                    
                    if (timestamp >= oneYearAgo && timestamp <= oneHourFromNow) {
                        console.log(`🔍 DEBUG: Timestamp passes sanity check, using it`);
                        return timestamp;
                    } else {
                        console.log(`🔍 DEBUG: Timestamp failed sanity check (${new Date(timestamp * 1000).toISOString()}), continuing to next method`);
                    }
                }
            } catch (cmdError) {
                console.log(`🔍 DEBUG: Git command ${i + 1} failed: ${cmdError.message}`);
            }
        }

        // If file exists but no git history found, try getting any commit that touched the releases directory
        if (fs.existsSync(fullFilePath)) {
            console.log(`🔍 DEBUG: File exists but no specific history found, checking releases directory`);
            try {
                const dirCommand = `git log -1 --format=%ct -- releases/`;
                console.log(`🔍 DEBUG: Trying directory command: ${dirCommand}`);
                
                const dirResult = execSync(dirCommand, {
                    encoding: 'utf8',
                    stdio: 'pipe',
                    cwd: workingDir
                }).trim();
                
                if (dirResult) {
                    const timestamp = parseInt(dirResult);
                    console.log(`🔍 DEBUG: Found releases directory timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
                    return timestamp;
                }
            } catch (dirError) {
                console.log(`🔍 DEBUG: Directory timestamp failed: ${dirError.message}`);
            }
        }

        // Fallback to current time if no commits found (new category file)
        const fallbackTimestamp = Math.floor(Date.now() / 1000);
        console.log(`🔍 DEBUG: No commits found for category file, using fallback timestamp: ${fallbackTimestamp} (${new Date(fallbackTimestamp * 1000).toISOString()})`);
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
    const releasesDir = path.join(__dirname, '../..', 'releases');
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
    const categoriesFilePath = path.join(__dirname, '../..', 'releases', 'categories.json');
    
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