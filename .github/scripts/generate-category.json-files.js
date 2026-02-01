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
        const categoriesPath = path.join(__dirname, '../../', 'categories.json');
        const categoriesContent = fs.readFileSync(categoriesPath, 'utf8');
        return JSON.parse(categoriesContent);
    } catch (error) {
        console.warn(`⚠️ Could not load categories.json: ${error.message}`);
        return [];
    }
}

// Main function
async function main() {
    console.log('🔄 Generating category files...');

    // Load valid categories
    const validCategories = loadValidCategories();
    console.log(`📋 Valid categories: ${validCategories.join(', ')}`);

    // Find all metadata files
    const repositoriesDir = path.join(__dirname, '../..', 'repositories');
    const metadataFiles = findMetadataFiles(repositoriesDir);
    console.log(`📁 Found ${metadataFiles.length} metadata files`);

    if (metadataFiles.length === 0) {
        console.log('ℹ️ No metadata files found. No category files will be generated.');
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
    const releasesDir = path.join(__dirname, '../..', 'releases');
    if (!fs.existsSync(releasesDir)) {
        fs.mkdirSync(releasesDir, { recursive: true });
        console.log(`📁 Created releases directory`);
    }

    // Generate category files
    const generatedFiles = [];
    const categoriesWithReleases = [];
    for (const [category, apps] of Object.entries(categorizedApps)) {
        const releaseFileName = `category-${category.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
        const releaseFilePath = path.join(releasesDir, releaseFileName);

        // Sort apps by name for consistent ordering
        apps.sort((a, b) => a.name.localeCompare(b.name));

        // Filter out unwanted fields from apps for category files
        const filteredApps = apps.map(app => {
            const { commit, owner, repo, path, filePath, category, files, ...cleanApp } = app;
            // Add slug in format: owner/repo/subfolder_name
            const subfolderName = filePath.split('/').pop();
            cleanApp.slug = `${owner}/${repo}/${subfolderName}`;

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
            generatedFiles.push(releaseFileName);
            categoriesWithReleases.push(category);
            console.log(`📄 Generated ${releaseFileName} with ${apps.length} apps`);
        } catch (error) {
            console.error(`❌ Failed to write ${releaseFileName}: ${error.message}`);
        }
    }

    // Clean up old category files that are no longer needed
    const existingReleaseFiles = fs.readdirSync(releasesDir)
        .filter(file => file.startsWith('category-') && file.endsWith('.json'));

    for (const existingFile of existingReleaseFiles) {
        if (!generatedFiles.includes(existingFile)) {
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
    console.log(`   Category files: ${generatedFiles.length}`);

    if (generatedFiles.length > 0) {
        console.log('');
        console.log('📄 Generated category files:');
        for (const file of generatedFiles) {
            console.log(`   - ${file}`);
        }
    }

    console.log('✅ Category file generation complete!');
}

// Run the script
main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
});