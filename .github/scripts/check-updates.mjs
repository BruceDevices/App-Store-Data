import { Octokit } from "@octokit/rest";
import fs from 'fs';
import path from 'path';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

async function getLatestCommit(owner, repo, filePath = '') {
  try {
    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      path: filePath,
      per_page: 1
    });
    return response.data[0];
  } catch (error) {
    console.error(`❌ Error fetching commits for ${owner}/${repo}: ${error.message}`);
    return null;
  }
}

async function getFileChanges(owner, repo, oldCommit, newCommit, filePaths) {
  try {
    const comparison = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: oldCommit,
      head: newCommit
    });
    
    const relevantFiles = comparison.data.files.filter(file => 
      filePaths.some(trackPath => {
        const normalizedTrackPath = trackPath.startsWith('/') ? trackPath.slice(1) : trackPath;
        return file.filename.includes(normalizedTrackPath) || 
               normalizedTrackPath.includes(file.filename);
      })
    );
    
    return {
      totalChanges: comparison.data.files.length,
      relevantChanges: relevantFiles.length,
      files: relevantFiles.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch
      }))
    };
  } catch (error) {
    console.error(`❌ Error comparing commits: ${error.message}`);
    return null;
  }
}

function findMetadataFiles(dir) {
  const metadataFiles = [];
  
  function searchRecursively(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        searchRecursively(fullPath);
      } else if (entry.name === 'metadata.json') {
        metadataFiles.push(fullPath);
      }
    }
  }
  
  searchRecursively(dir);
  return metadataFiles;
}

async function main() {
  console.log('🔍 Starting metadata update check...\n');
  
  const metadataFiles = findMetadataFiles('./repositories');
  console.log(`📁 Found ${metadataFiles.length} metadata files\n`);
  
  let totalChecked = 0;
  let updatesAvailable = 0;
  let errors = 0;
  
  const detailedOutput = process.env.DETAILED_OUTPUT === 'true';
  const onlyShowUpdates = process.env.ONLY_SHOW_UPDATES === 'true';
  
  for (const metadataFile of metadataFiles) {
    try {
      totalChecked++;
      const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      
      // Skip showing repository info if only showing updates and this repo is up to date
      const shouldShowBasicInfo = !onlyShowUpdates;
      
      if (shouldShowBasicInfo) {
        console.log(`📦 Checking: ${metadata.name} (${metadata.owner}/${metadata.repo})`);
        console.log(`   Repository: https://github.com/${metadata.owner}/${metadata.repo}`);
        console.log(`   Current commit: ${metadata.commit}`);
        console.log(`   Path: ${metadata.path || '/'}`);
      }
      
      // Get latest commit from the repository
      const latestCommit = await getLatestCommit(
        metadata.owner, 
        metadata.repo, 
        metadata.path
      );
      
      if (!latestCommit) {
        if (shouldShowBasicInfo) {
          console.log(`   ❌ Could not fetch latest commit\n`);
        }
        errors++;
        continue;
      }
      
      if (shouldShowBasicInfo) {
        console.log(`   Latest commit: ${latestCommit.sha}`);
        console.log(`   Latest commit date: ${latestCommit.commit.committer.date}`);
        console.log(`   Latest commit message: "${latestCommit.commit.message.split('\n')[0]}"`);
      }
      
      if (metadata.commit === latestCommit.sha) {
        if (!onlyShowUpdates) {
          console.log(`   ✅ Up to date\n`);
        }
      } else {
        // Get file paths to track
        let filePaths = [];
        if (Array.isArray(metadata.files)) {
          filePaths = metadata.files.map(file => {
            if (typeof file === 'string') {
              return path.join(metadata.path || '/', file).replace(/\\/g, '/');
            } else if (file.source) {
              return path.join(metadata.path || '/', file.source).replace(/\\/g, '/');
            }
            return '';
          }).filter(p => p);
        }
        
        // Check if tracked files have actually changed
        let hasRelevantChanges = false;
        let changes = null;
        
        if (filePaths.length > 0) {
          changes = await getFileChanges(
            metadata.owner,
            metadata.repo,
            metadata.commit,
            latestCommit.sha,
            filePaths
          );
          
          if (changes && changes.relevantChanges > 0) {
            hasRelevantChanges = true;
          }
        } else {
          // If no specific files to track, assume any commit means changes
          hasRelevantChanges = true;
        }
        
        if (!hasRelevantChanges) {
          if (!onlyShowUpdates) {
            console.log(`   ✅ Up to date (no relevant file changes)\n`);
          }
        } else {
          // Always show update available info, regardless of onlyShowUpdates setting
          if (onlyShowUpdates) {
            console.log(`📦 Checking: ${metadata.name} (${metadata.owner}/${metadata.repo})`);
            console.log(`   Repository: https://github.com/${metadata.owner}/${metadata.repo}`);
            console.log(`   Current commit: ${metadata.commit}`);
            console.log(`   Latest commit: ${latestCommit.sha}`);
            console.log(`   Latest commit date: ${latestCommit.commit.committer.date}`);
            console.log(`   Latest commit message: "${latestCommit.commit.message.split('\n')[0]}"`);
          }
          console.log(`   🔄 UPDATE AVAILABLE!`);
          console.log(`   📄 Compare commits: https://github.com/${metadata.owner}/${metadata.repo}/compare/${metadata.commit}...${latestCommit.sha}`);
          updatesAvailable++;
          
          // Get detailed changes if requested
          if (detailedOutput && changes) {
            console.log(`   📊 Total repository changes: ${changes.totalChanges} files`);
            console.log(`   📊 Relevant file changes: ${changes.relevantChanges} files`);
            
            if (changes.files.length > 0) {
              console.log(`   📄 Changed files:`);
              for (const file of changes.files) {
                console.log(`      - ${file.filename} (${file.status}) [+${file.additions}/-${file.deletions}]`);
              }
            }
          }
          console.log('');
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Error processing ${metadataFile}: ${error.message}\n`);
      errors++;
    }
  }
  
  console.log('📊 SUMMARY:');
  console.log(`   Total metadata files checked: ${totalChecked}`);
  console.log(`   Updates available: ${updatesAvailable}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Up to date: ${totalChecked - updatesAvailable - errors}`);
  
  if (updatesAvailable > 0) {
    console.log(`\n🎯 ${updatesAvailable} repositories have updates available!`);
    process.exit(0); // Don't fail the workflow, just inform
  } else {
    console.log('\n✅ All repositories are up to date!');
  }
}

main().catch(console.error);