const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

class ActivityPubKeyManager {
    constructor() {
        this.envPath = path.join(__dirname, '../../.env');
        this.dataDir = path.join(__dirname, '../../activitypub-data');
        this.keysExist = this.checkKeysExist();
        this.refreshCallbacks = []; // Callbacks to execute after successful refresh
    }

    checkKeysExist() {
        return process.env.ACTIVITYPUB_PUBLIC_KEY &&
               process.env.ACTIVITYPUB_PUBLIC_KEY.includes('BEGIN PUBLIC KEY');
    }

    /**
     * Refreshes environment variables by re-reading the .env file
     * and updating process.env accordingly
     */
    async refreshEnvironment() {
        try {
            console.log('🔄 [ACTIVITYPUB] Refreshing environment variables...');
            
            // Re-read the .env file
            if (await fs.pathExists(this.envPath)) {
                const envContent = await fs.readFile(this.envPath, 'utf8');
                const lines = envContent.split('\n');
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                        const [key, ...valueParts] = trimmed.split('=');
                        let value = valueParts.join('=');
                        
                        // Remove quotes if present
                        if ((value.startsWith('"') && value.endsWith('"')) || 
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        
                        // Convert escaped newlines back to actual newlines for the public key
                        if (key === 'ACTIVITYPUB_PUBLIC_KEY') {
                            value = value.replace(/\\n/g, '\n');
                        }
                        
                        process.env[key] = value;
                    }
                }
            }
            
            // Update internal state
            const oldKeysExist = this.keysExist;
            this.keysExist = this.checkKeysExist();
            
            console.log(`✅ [ACTIVITYPUB] Environment refreshed. Keys exist: ${this.keysExist}`);
            
            // If keys now exist but didn't before, execute callbacks
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

    /**
     * Registers a callback to be executed after successful key refresh
     */
    onKeysRefreshed(callback) {
        if (typeof callback === 'function') {
            this.refreshCallbacks.push(callback);
        }
    }

    /**
     * Executes all registered refresh callbacks
     */
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
        if (force || !this.keysExist) {
            console.log('🔑 [ACTIVITYPUB] Generating new RSA key pair...');
            await this.generateAndSaveKeys();
            
            // Automatically refresh environment after key generation
            await this.refreshEnvironment();
        } else {
            console.log('🔑 [ACTIVITYPUB] Keys already exist');
        }
    }

    async generateAndSaveKeys() {
        try {
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

            // Ensure data directory exists
            await fs.ensureDir(this.dataDir);

            // Save private key to file
            const privateKeyFile = path.join(this.dataDir, `private-key-${Date.now()}.pem`);
            await fs.writeFile(privateKeyFile, privateKey);
            await fs.chmod(privateKeyFile, '600');

            // Update .env file with public key
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

            await fs.writeFile(this.envPath, newLines.join('\n'));

            console.log('✅ [ACTIVITYPUB] Keys generated and saved to .env file');
            console.log(`🔑 [ACTIVITYPUB] Private key: ${privateKeyFile}`);

            return { publicKey, privateKey };

        } catch (error) {
            console.error('❌ [ACTIVITYPUB] Error generating keys:', error);
            throw error;
        }
    }

    /**
     * Forces complete key regeneration and refresh
     */
    async regenerateAndRefresh() {
        console.log('🔄 [ACTIVITYPUB] Forcing key regeneration and refresh...');
        await this.generateKeysIfNeeded(true);
        return this.keysExist;
    }

    /**
     * Returns the current public key (after refresh if necessary)
     */
    async getPublicKey() {
        if (!this.keysExist) {
            await this.refreshEnvironment();
        }
        
        if (this.keysExist) {
            return process.env.ACTIVITYPUB_PUBLIC_KEY.replace(/\\n/g, '\n');
        }
        
        return null;
    }

    /**
     * Checks key status without refresh
     */
    hasKeys() {
        return this.keysExist;
    }

    /**
     * Checks key status with automatic refresh
     */
    async hasKeysWithRefresh() {
        await this.refreshEnvironment();
        return this.keysExist;
    }

    /**
     * Manual refresh trigger - useful for external calls
     */
    async refresh() {
        return await this.refreshEnvironment();
    }
}

module.exports = { ActivityPubKeyManager };