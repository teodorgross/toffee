const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

class ActivityPubKeyManager {
    constructor() {
        this.envPath = path.join(__dirname, '../../.env');
        this.dataDir = path.join(__dirname, '../../activitypub-data');
        this.privateKeyFile = path.join(this.dataDir, 'private-key.pem');
        this.lockFile = path.join(this.dataDir, '.keymanager.lock');
        this.keysExist = this.checkKeysExist();
        this.refreshCallbacks = [];
    }

    checkKeysExist() {
        return process.env.ACTIVITYPUB_PUBLIC_KEY &&
               process.env.ACTIVITYPUB_PUBLIC_KEY.includes('BEGIN PUBLIC KEY');
    }

    async acquireLock() {
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWait) {
            try {
                await fs.writeFile(this.lockFile, process.pid.toString(), { flag: 'wx' });
                return true; // Successfully acquired lock
            } catch (error) {
                if (error.code === 'EEXIST') {
                    // Lock exists, check if process is still running
                    try {
                        const lockPid = await fs.readFile(this.lockFile, 'utf8');
                        try {
                            process.kill(parseInt(lockPid), 0); // Check if process exists
                            // Process exists, wait and retry
                            await new Promise(resolve => setTimeout(resolve, 100));
                            continue;
                        } catch (killError) {
                            // Process doesn't exist, remove stale lock
                            await fs.remove(this.lockFile);
                            continue;
                        }
                    } catch (readError) {
                        // Can't read lock file, remove it
                        await fs.remove(this.lockFile);
                        continue;
                    }
                } else {
                    throw error;
                }
            }
        }
        throw new Error('Could not acquire lock within timeout');
    }

    async releaseLock() {
        try {
            await fs.remove(this.lockFile);
        } catch (error) {
            console.warn('⚠️ [ACTIVITYPUB] Could not release lock:', error.message);
        }
    }

    async refreshEnvironment() {
        try {
            console.log('🔄 [ACTIVITYPUB] Refreshing environment variables...');
            
            if (await fs.pathExists(this.envPath)) {
                const envContent = await fs.readFile(this.envPath, 'utf8');
                const lines = envContent.split('\n');
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                        const [key, ...valueParts] = trimmed.split('=');
                        let value = valueParts.join('=');
                        
                        if ((value.startsWith('"') && value.endsWith('"')) || 
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        
                        if (key === 'ACTIVITYPUB_PUBLIC_KEY') {
                            value = value.replace(/\\n/g, '\n');
                        }
                        
                        process.env[key] = value;
                    }
                }
            }
            
            const oldKeysExist = this.keysExist;
            this.keysExist = this.checkKeysExist();
            
            console.log(`✅ [ACTIVITYPUB] Environment refreshed. Keys exist: ${this.keysExist}`);
            
            if (this.keysExist && !oldKeysExist) {
                console.log('🎉 [ACTIVITYPUB] Keys are now available, executing refresh callbacks...');
                await this.executeRefreshCallbacks();
            }
            
            return this.keysExist;
            
        } catch (error) {
            console.error('❌ [ACTIVITYPUB] Error refreshing environment:', error);
            throw error;
        }
    }

    onKeysRefreshed(callback) {
        if (typeof callback === 'function') {
            this.refreshCallbacks.push(callback);
        }
    }

    async executeRefreshCallbacks() {
        for (const callback of this.refreshCallbacks) {
            try {
                await callback();
            } catch (error) {
                console.error('❌ [ACTIVITYPUB] Error executing refresh callback:', error);
            }
        }
    }

    async generateKeysIfNeeded(force = false) {
        const privateKeyExists = await fs.pathExists(this.privateKeyFile);
        
        if (force || !this.keysExist || !privateKeyExists) {
            console.log('🔑 [ACTIVITYPUB] Generating new RSA key pair...');
            
            // Use lock to prevent race conditions
            await this.acquireLock();
            try {
                await this.generateAndSaveKeys();
                await this.refreshEnvironment();
            } finally {
                await this.releaseLock();
            }
        } else {
            console.log('🔑 [ACTIVITYPUB] Keys already exist');
        }
    }

    async generateAndSaveKeys() {
        try {
            await this.cleanupOldKeys();

            const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem'
                }
            });

            await fs.ensureDir(this.dataDir);

            const existingPrivateKey = await fs.pathExists(this.privateKeyFile) ? 
                await fs.readFile(this.privateKeyFile, 'utf8') : null;
            
            if (!existingPrivateKey || existingPrivateKey !== privateKey) {
                const tempFile = this.privateKeyFile + '.tmp.' + Date.now();
                await fs.writeFile(tempFile, privateKey);
                await fs.chmod(tempFile, '600');
                await fs.move(tempFile, this.privateKeyFile, { overwrite: true });
                console.log(`🔑 [ACTIVITYPUB] Private key saved: ${this.privateKeyFile}`);
            } else {
                console.log('🔑 [ACTIVITYPUB] Private key unchanged, skipping write');
            }

            // Check if public key already matches before updating
            const currentPublicKey = process.env.ACTIVITYPUB_PUBLIC_KEY?.replace(/\\n/g, '\n');
            if (currentPublicKey !== publicKey) {
                await this.updateEnvFile(publicKey);
            } else {
                console.log('🔑 [ACTIVITYPUB] Public key unchanged, skipping .env update');
            }

            console.log('✅ [ACTIVITYPUB] Keys generated and saved');
            return { publicKey, privateKey };

        } catch (error) {
            console.error('❌ [ACTIVITYPUB] Error generating keys:', error);
            throw error;
        }
    }

    async cleanupOldKeys() {
        try {
            if (await fs.pathExists(this.dataDir)) {
                const files = await fs.readdir(this.dataDir);
                const oldKeyFiles = files.filter(file => 
                    file.startsWith('private-key-') && 
                    file.endsWith('.pem') && 
                    file !== 'private-key.pem'
                );

                for (const file of oldKeyFiles) {
                    const filePath = path.join(this.dataDir, file);
                    await fs.remove(filePath);
                    console.log(`🧹 [ACTIVITYPUB] Removed old key file: ${file}`);
                }

                if (oldKeyFiles.length > 0) {
                    console.log(`🧹 [ACTIVITYPUB] Cleaned up ${oldKeyFiles.length} old key files`);
                }
            }
        } catch (error) {
            console.warn('⚠️ [ACTIVITYPUB] Could not cleanup old keys:', error.message);
        }
    }

    async updateEnvFile(publicKey) {
        const maxRetries = 3;
        let attempt = 0;
        
        while (attempt < maxRetries) {
            try {
                let envContent = '';
                try {
                    envContent = await fs.readFile(this.envPath, 'utf8');
                } catch (error) {
                    envContent = '# Environment Variables\n';
                }

                const lines = envContent.split('\n');
                const newLines = [];
                let foundPublicKey = false;

                for (const line of lines) {
                    if (line.startsWith('ACTIVITYPUB_PUBLIC_KEY=')) {
                        newLines.push(`ACTIVITYPUB_PUBLIC_KEY="${publicKey.replace(/\n/g, '\\n')}"`);
                        foundPublicKey = true;
                    } else if (line.startsWith('INCLUDE_WIKI_IN_ACTIVITYPUB=')) {
                        newLines.push('INCLUDE_WIKI_IN_ACTIVITYPUB=true');
                    } else {
                        newLines.push(line);
                    }
                }

                if (!foundPublicKey) {
                    newLines.push('');
                    newLines.push('# ActivityPub Keys');
                    newLines.push(`ACTIVITYPUB_PUBLIC_KEY="${publicKey.replace(/\n/g, '\\n')}"`);
                    newLines.push('');
                    newLines.push('# ActivityPub Settings');
                    newLines.push('INCLUDE_WIKI_IN_ACTIVITYPUB=true');
                }

                // Use unique temp filename to avoid collisions
                const tempEnvPath = this.envPath + '.tmp.' + Date.now() + '.' + process.pid;
                await fs.writeFile(tempEnvPath, newLines.join('\n'));
                await fs.move(tempEnvPath, this.envPath, { overwrite: true });
                
                console.log('✅ [ACTIVITYPUB] Environment file updated successfully');
                return;
                
            } catch (error) {
                attempt++;
                console.warn(`⚠️ [ACTIVITYPUB] Attempt ${attempt} to update .env failed:`, error.message);
                
                if (attempt >= maxRetries) {
                    throw new Error(`Failed to update .env file after ${maxRetries} attempts: ${error.message}`);
                }
                
                // Wait before retry with exponential backoff
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
            }
        }
    }

    async regenerateAndRefresh() {
        console.log('🔄 [ACTIVITYPUB] Forcing key regeneration and refresh...');
        await this.generateKeysIfNeeded(true);
        return this.keysExist;
    }

    async getPublicKey() {
        if (!this.keysExist) {
            await this.refreshEnvironment();
        }
        
        if (this.keysExist) {
            return process.env.ACTIVITYPUB_PUBLIC_KEY.replace(/\\n/g, '\n');
        }
        
        return null;
    }

    async getPrivateKey() {
        if (await fs.pathExists(this.privateKeyFile)) {
            return await fs.readFile(this.privateKeyFile, 'utf8');
        }
        return null;
    }

    hasKeys() {
        return this.keysExist;
    }

    async hasKeysWithRefresh() {
        await this.refreshEnvironment();
        return this.keysExist;
    }

    async refresh() {
        return await this.refreshEnvironment();
    }
}

module.exports = { ActivityPubKeyManager };