#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Types and interfaces
interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: any;
}

interface FailedFolder {
  path: string;
  reason: string;
}

type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm' | 'pms';

// Configuration
const SDK_NAME = '@decloudlabs/ap';  // Must match "name" in this package's package.json
const SEARCH_PATH = '/Users/vijayankith/projects/stackai';

// Read current version from package.json
function getCurrentVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, 'package.json');
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson: PackageJson = JSON.parse(content);
    return packageJson.version || '0.0.0';
  } catch (error) {
    console.error('Error reading version from package.json:', (error as Error).message);
    process.exit(1);
  }
}

const CURRENT_VERSION = getCurrentVersion();
const COMMIT_MESSAGE = `chore: update ${SDK_NAME} to version ${CURRENT_VERSION}`;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function findPackageJsonFiles(startPath: string = SEARCH_PATH): string[] {
  const packageJsonFiles: string[] = [];
  
  function scanDirectory(dir: string): void {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip node_modules and .git directories
          if (item === 'node_modules' || item === '.git') {
            continue;
          }
          
          // Check if this directory has a package.json
          const packageJsonPath = path.join(fullPath, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            packageJsonFiles.push(packageJsonPath);
          }
          
          // Recursively scan subdirectories
          scanDirectory(fullPath);
        }
      }
    } catch (error) {
      log(`Error scanning directory ${dir}: ${(error as Error).message}`, 'yellow');
    }
  }
  
  scanDirectory(startPath);
  return packageJsonFiles;
}

function updatePackageJson(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const packageJson: PackageJson = JSON.parse(content);
    
    let updated = false;
    
    // Check dependencies
    if (packageJson.dependencies && packageJson.dependencies[SDK_NAME]) {
      const currentVersion = packageJson.dependencies[SDK_NAME];
      if (currentVersion !== CURRENT_VERSION) {
        packageJson.dependencies[SDK_NAME] = CURRENT_VERSION;
        updated = true;
        log(`  Updated dependencies.${SDK_NAME}: ${currentVersion} → ${CURRENT_VERSION}`, 'green');
      }
    }
    
    // Check devDependencies
    if (packageJson.devDependencies && packageJson.devDependencies[SDK_NAME]) {
      const currentVersion = packageJson.devDependencies[SDK_NAME];
      if (currentVersion !== CURRENT_VERSION) {
        packageJson.devDependencies[SDK_NAME] = CURRENT_VERSION;
        updated = true;
        log(`  Updated devDependencies.${SDK_NAME}: ${currentVersion} → ${CURRENT_VERSION}`, 'green');
      }
    }
    
    if (updated) {
      // Write back to file with proper formatting
      fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n');
      return true;
    }
    
    return false;
  } catch (error) {
    log(`  Error updating ${filePath}: ${(error as Error).message}`, 'red');
    return false;
  }
}

function isGitRepository(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, '.git'));
}

function detectPackageManager(dirPath: string): PackageManager {
  const files = fs.readdirSync(dirPath);
  
  if (files.includes('pnpm-lock.yaml')) {
    return 'pnpm';
  } else if (files.includes('yarn.lock')) {
    return 'yarn';
  } else if (files.includes('bun.lockb')) {
    return 'bun';
  } else if (files.includes('package-lock.json')) {
    return 'npm';
  } else {
    // Default to pms (pnpm) as per user preference
    return 'pms';
  }
}

function installPackages(dirPath: string): boolean {
  let originalDir: string | undefined;
  try {
    originalDir = process.cwd();
    process.chdir(dirPath);
    
    const packageManager = detectPackageManager(dirPath);
    log(`  📦 Detected package manager: ${packageManager}`, 'blue');
    
    let installCommand: string;
    let forceCommand: string;
    
    switch (packageManager) {
      case 'pnpm':
        installCommand = 'pnpm install';
        forceCommand = 'pnpm install --force --no-optional';
        break;
      case 'yarn':
        installCommand = 'yarn install';
        forceCommand = 'yarn install --force';
        break;
      case 'bun':
        installCommand = 'bun install';
        forceCommand = 'bun install --force';
        break;
      case 'npm':
        installCommand = 'npm install';
        forceCommand = 'npm install --force';
        break;
      case 'pms':
      default:
        installCommand = 'pms i';
        forceCommand = 'pms i --force';
        break;
    }
    
    // Try normal install first
    try {
      log(`  📦 Running: ${installCommand}`, 'cyan');
      execSync(installCommand, { stdio: 'inherit' });
      log(`  ✓ Package installation successful`, 'green');
      return true;
    } catch (error) {
      log(`  ⚠️  Normal install failed, trying force install...`, 'yellow');
      
      try {
        log(`  📦 Running: ${forceCommand}`, 'cyan');
        execSync(forceCommand, { stdio: 'inherit' });
        log(`  ✓ Force package installation successful`, 'green');
        return true;
      } catch (forceError) {
        log(`  ✗ Force install also failed: ${(forceError as Error).message}`, 'red');
        return false;
      }
    }
  } catch (error) {
    log(`  ✗ Error during package installation: ${(error as Error).message}`, 'red');
    return false;
  } finally {
    if (originalDir) {
      process.chdir(originalDir);
    }
  }
}

function commitAndPush(dirPath: string): boolean {
  let originalDir: string | undefined;
  try {
    originalDir = process.cwd();
    // Change to the directory
    process.chdir(dirPath);
    
    // Check if there are any changes
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    
    if (status.trim()) {
      // Add all changes
      execSync('git add .', { stdio: 'inherit' });
      
      // Commit
      execSync(`git commit -m "${COMMIT_MESSAGE}"`, { stdio: 'inherit' });
      
      // Push
      execSync('git push', { stdio: 'inherit' });
      
      log(`  ✓ Committed and pushed changes`, 'green');
      return true;
    } else {
      log(`  - No changes to commit`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`  ✗ Error committing/pushing: ${(error as Error).message}`, 'red');
    return false;
  } finally {
    if (originalDir) {
      process.chdir(originalDir);
    }
  }
}

function gitPullAtRoot(): boolean {
  try {
    log('🔄 Running git pull at root level...', 'cyan');
    execSync('git pull', { stdio: 'inherit' });
    log('✓ Git pull successful', 'green');
    return true;
  } catch (error) {
    log(`✗ Git pull failed: ${(error as Error).message}`, 'red');
    return false;
  }
}

function main(): void {
  log('🚀 Starting SDK version update script...', 'cyan');
  log(`📦 SDK: ${SDK_NAME}`, 'blue');
  log(`📋 Target version: ${CURRENT_VERSION}`, 'blue');
  log('');
  
  // Run git pull at root level first
  const gitPullSuccess = gitPullAtRoot();
  if (!gitPullSuccess) {
    log('⚠️  Git pull failed, but continuing with updates...', 'yellow');
  }
  
  // Find all package.json files
  log('🔍 Scanning for package.json files...', 'cyan');
  log(`📁 Search path: ${SEARCH_PATH}`, 'blue');
  const packageJsonFiles = findPackageJsonFiles();
  log(`Found ${packageJsonFiles.length} package.json files`, 'blue');
  
  let updatedCount = 0;
  let committedCount = 0;
  const failedFolders: FailedFolder[] = [];
  
  for (const filePath of packageJsonFiles) {
    const dirPath = path.dirname(filePath);
    const relativePath = path.relative(SEARCH_PATH, filePath);
    
    log(`\n📁 Processing: ${relativePath}`, 'magenta');
    
    // Check if this package.json contains our SDK
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const packageJson: PackageJson = JSON.parse(content);
      
      const hasSDK = (packageJson.dependencies && packageJson.dependencies[SDK_NAME]) ||
                     (packageJson.devDependencies && packageJson.devDependencies[SDK_NAME]);
      
      if (!hasSDK) {
        log(`  - SDK not found, skipping`, 'yellow');
        continue;
      }
      
      log(`  ✓ SDK found, checking version...`, 'green');
      
      // Update the package.json
      const wasUpdated = updatePackageJson(filePath);
      
      if (wasUpdated) {
        updatedCount++;
        
        // Install packages after updating
        log(`  📦 Installing packages...`, 'cyan');
        const installSuccess = installPackages(dirPath);
        
        if (installSuccess) {
          // Check if this is a git repository and commit/push
          if (isGitRepository(dirPath)) {
            log(`  📝 Committing changes...`, 'cyan');
            const wasCommitted = commitAndPush(dirPath);
            if (wasCommitted) {
              committedCount++;
            } else {
              // Add to failed folders if commit/push failed
              failedFolders.push({
                path: relativePath,
                reason: 'commit/push failed'
              });
            }
          } else {
            log(`  - Not a git repository, skipping commit`, 'yellow');
          }
        } else {
          log(`  ⚠️  Package installation failed, skipping commit`, 'yellow');
          // Add to failed folders if package installation failed
          failedFolders.push({
            path: relativePath,
            reason: 'package installation failed'
          });
        }
      } else {
        log(`  - Version already up to date`, 'yellow');
        
        // Only check for other changes if this repository contains the SDK
        if (isGitRepository(dirPath)) {
          log(`  📝 Checking for other changes to commit...`, 'cyan');
          const wasCommitted = commitAndPush(dirPath);
          if (wasCommitted) {
            committedCount++;
          }
        }
      }
      
    } catch (error) {
      log(`  ✗ Error processing ${filePath}: ${(error as Error).message}`, 'red');
      failedFolders.push({
        path: relativePath,
        reason: `processing error: ${(error as Error).message}`
      });
    }
  }
  
  log('\n' + '='.repeat(50), 'cyan');
  log('📊 Summary:', 'bright');
  log(`  • Files processed: ${packageJsonFiles.length}`, 'blue');
  log(`  • Files updated: ${updatedCount}`, 'green');
  log(`  • Changes committed: ${committedCount}`, 'green');
  log(`  • Package installations: ${updatedCount}`, 'green');
  
  if (failedFolders.length > 0) {
    log('\n❌ Failed Folders (need manual intervention):', 'red');
    failedFolders.forEach((folder, index) => {
      log(`  ${index + 1}. ${folder.path} - ${folder.reason}`, 'red');
    });
    log('\n💡 You can manually check and fix these folders:', 'yellow');
    failedFolders.forEach(folder => {
      log(`  cd ${path.join(SEARCH_PATH, folder.path)}`, 'cyan');
    });
  } else {
    log('\n✅ All updates completed successfully!', 'green');
  }
  
  log('='.repeat(50), 'cyan');
}

// Run the script
if (require.main === module) {
  main();
}

export { findPackageJsonFiles, updatePackageJson, commitAndPush }; 