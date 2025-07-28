#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Installing and setting up PM2...\n');

function runCommand(command, description) {
    console.log(`📦 ${description}...`);
    try {
        execSync(command, { stdio: 'inherit' });
        console.log(`✅ ${description} completed\n`);
        return true;
    } catch (error) {
        console.error(`❌ ${description} failed:`, error.message);
        return false;
    }
}

function checkPM2Installation() {
    try {
        execSync('pm2 --version', { stdio: 'pipe' });
        console.log('✅ PM2 is already installed\n');
        return true;
    } catch (error) {
        console.log('📦 PM2 not found, installing...\n');
        return false;
    }
}

function createDirectories() {
    const dirs = ['logs', 'scripts'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
    });
    console.log('');
}

function main() {
    console.log('🔧 Blog & Wiki ActivityPub PM2 Setup');
    console.log('=====================================\n');
    
    // Create necessary directories
    createDirectories();
    
    // Check if PM2 is already installed
    if (!checkPM2Installation()) {
        // Install PM2 globally
        if (!runCommand('npm install -g pm2', 'Installing PM2 globally')) {
            console.error('❌ Failed to install PM2. You may need to run with sudo or as administrator.');
            console.log('\n💡 Try running: sudo npm install -g pm2');
            process.exit(1);
        }
    }
    
    // Verify installation
    if (!runCommand('pm2 --version', 'Verifying PM2 installation')) {
        console.error('❌ PM2 installation verification failed');
        process.exit(1);
    }
    
    // Install PM2 log rotation (optional but recommended)
    runCommand('pm2 install pm2-logrotate', 'Installing PM2 log rotation');
    
    console.log('🎉 PM2 installation completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   • Run: npm run pm2:config');
    console.log('   • Then: npm run pm2:start');
    console.log('   • Or simply: npm run background');
}

if (require.main === module) {
    main();
}