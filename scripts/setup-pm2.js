#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('⚙️  Configuring PM2 for Blog & Wiki ActivityPub...\n');

function runCommand(command, description, options = {}) {
    console.log(`🔧 ${description}...`);
    try {
        const result = execSync(command, { 
            stdio: options.silent ? 'pipe' : 'inherit',
            encoding: 'utf8',
            ...options
        });
        console.log(`✅ ${description} completed\n`);
        return result;
    } catch (error) {
        if (!options.optional) {
            console.error(`❌ ${description} failed:`, error.message);
            return false;
        } else {
            console.log(`⚠️  ${description} skipped (optional)\n`);
            return null;
        }
    }
}

function checkEnvironment() {
    console.log('🔍 Checking environment...');
    
    // Check if .env exists
    if (!fs.existsSync('.env')) {
        console.log('⚠️  No .env file found. Creating from template...');
        if (fs.existsSync('.env.example')) {
            fs.copyFileSync('.env.example', '.env');
            console.log('✅ Created .env from .env.example');
        } else {
            console.log('❌ No .env.example found. Please create .env manually.');
        }
    } else {
        console.log('✅ .env file exists');
    }
    
    // Check if ecosystem.config.js exists
    if (!fs.existsSync('ecosystem.config.js')) {
        console.error('❌ ecosystem.config.js not found!');
        process.exit(1);
    } else {
        console.log('✅ ecosystem.config.js exists');
    }
    
    console.log('');
}

function setupPM2() {
    console.log('🔧 Setting up PM2 configuration...\n');
    
    // Kill any existing instances
    runCommand('pm2 delete blog-wiki-activitypub', 'Stopping existing instances', { optional: true });
    
    // Clear PM2 logs
    runCommand('pm2 flush', 'Clearing PM2 logs', { optional: true });
    
    // Validate ecosystem file
    if (!runCommand('pm2 ecosystem', 'Validating ecosystem configuration', { optional: true })) {
        console.log('⚠️  Ecosystem validation failed, but continuing...\n');
    }
    
    return true;
}

function configurePM2Startup() {
    console.log('🚀 Configuring PM2 startup...');
    
    const platform = process.platform;
    console.log(`📍 Detected platform: ${platform}`);
    
    if (platform === 'linux' || platform === 'darwin') {
        console.log('💡 To enable PM2 startup on boot, run the following commands:');
        console.log('   1. pm2 startup');
        console.log('   2. Follow the instructions (may require sudo)');
        console.log('   3. npm run pm2:save');
        console.log('');
    } else if (platform === 'win32') {
        console.log('💡 For Windows, consider using pm2-windows-startup:');
        console.log('   npm install -g pm2-windows-startup');
        console.log('   pm2-startup install');
        console.log('');
    }
}

function createLogRotationConfig() {
    console.log('📝 Setting up log rotation...');
    
    try {
        // Configure PM2 log rotation
        runCommand('pm2 set pm2-logrotate:max_size 10M', 'Setting max log size', { optional: true });
        runCommand('pm2 set pm2-logrotate:retain 30', 'Setting log retention', { optional: true });
        runCommand('pm2 set pm2-logrotate:compress true', 'Enabling log compression', { optional: true });
        runCommand('pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss', 'Setting date format', { optional: true });
    } catch (error) {
        console.log('⚠️  Log rotation setup failed, continuing...\n');
    }
}

function displayHelp() {
    console.log('📚 PM2 Commands Reference:');
    console.log('==========================');
    console.log('');
    console.log('🎯 Application Control:');
    console.log('   npm run pm2:start     - Start the application');
    console.log('   npm run pm2:stop      - Stop the application');
    console.log('   npm run pm2:restart   - Restart the application');
    console.log('   npm run pm2:delete    - Delete the application from PM2');
    console.log('');
    console.log('📊 Monitoring:');
    console.log('   npm run pm2:status    - Show application status');
    console.log('   npm run pm2:logs      - Show live logs');
    console.log('   npm run pm2:monit     - Open PM2 monitoring dashboard');
    console.log('');
    console.log('💾 Persistence:');
    console.log('   npm run pm2:save      - Save PM2 process list');
    console.log('   npm run pm2:resurrect - Restore saved processes');
    console.log('');
    console.log('🧹 Maintenance:');
    console.log('   npm run pm2:flush     - Clear all logs');
    console.log('   pm2 update            - Update PM2');
    console.log('');
    console.log('🌐 Web Interface:');
    console.log('   pm2 web               - Start web interface (deprecated)');
    console.log('   pm2 plus              - Connect to PM2 Plus monitoring');
    console.log('');
}

function main() {
    console.log('⚙️  Blog & Wiki ActivityPub PM2 Configuration');
    console.log('===============================================\n');
    
    // Check environment
    checkEnvironment();
    
    // Setup PM2
    setupPM2();
    
    // Configure log rotation
    createLogRotationConfig();
    
    // Configure startup (informational)
    configurePM2Startup();
    
    console.log('🎉 PM2 configuration completed successfully!');
    console.log('\n🚀 Ready to start your application:');
    console.log('   npm run pm2:start');
    console.log('   npm run background  (install + configure + start)');
    console.log('');
    
    // Display help
    displayHelp();
}

if (require.main === module) {
    main();
}