#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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
            const categoryFilePath = path.join(releasesDir, `category-${categorySlug}.json`);
            
            // Get last modification time of the category file
            let lastUpdated = null;
            try {
                const stats = fs.statSync(categoryFilePath);
                lastUpdated = Math.floor(stats.mtime.getTime() / 1000); // Convert to Unix timestamp
            } catch (error) {
                // If file doesn't exist yet, use current time
                lastUpdated = Math.floor(Date.now() / 1000);
            }
            
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
            categories: categoriesWithCounts
        };
        
        try {
            fs.writeFileSync(categoriesFilePath, JSON.stringify(categoriesData, null, 2), 'utf8');
            console.log(`📄 Generated categories.json with ${categoriesWithReleases.length} categories`);
        } catch (error) {
            console.error(`❌ Failed to write categories.json: ${error.message}`);
        }
    }
    
    // Generate releases.json with just app names and versions
    if (Object.keys(categorizedApps).length > 0) {
        const releasesFilePath = path.join(releasesDir, 'releases.json');
        
        // Collect all apps from all categories with just name and version
        const allApps = [];
        for (const [category, apps] of Object.entries(categorizedApps)) {
            for (const app of apps) {
                // Create slug by joining owner/repo/path/appname
                const slug = `${app.owner}/${app.repo}${app.path}${app.name}`.replace(/\/+/g, '/');
                
                allApps.push({
                    name: app.name,
                    description: app.description,
                    version: app.version,
                    slug: slug
                });
            }
        }
        
        // Sort by name
        allApps.sort((a, b) => a.name.localeCompare(b.name));
        
        const releasesData = {
            count: allApps.length,
            apps: allApps
        };
        
        try {
            fs.writeFileSync(releasesFilePath, JSON.stringify(releasesData, null, 2), 'utf8');
            console.log(`📄 Generated releases.json with ${allApps.length} apps`);
        } catch (error) {
            console.error(`❌ Failed to write releases.json: ${error.message}`);
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