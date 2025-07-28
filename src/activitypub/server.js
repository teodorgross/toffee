const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

class ActivityPubServer {
    constructor(keyManager = null) {
        this.domain = process.env.FEDIVERSE_DOMAIN || new URL(process.env.BASE_URL || 'http://localhost:3000').hostname;
        this.username = process.env.FEDIVERSE_USERNAME || 'blog';
        this.displayName = process.env.FEDIVERSE_DISPLAY_NAME || 'Blog & Wiki';
        this.description = process.env.FEDIVERSE_DESCRIPTION || 'A blog and wiki with ActivityPub support';
        this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        this.dataDir = path.join(__dirname, '../../activitypub-data');
        
        this.keyManager = keyManager;
        this.publicKey = null;
        this.privateKey = null;
        
        this.followers = new Set();
        this.following = new Set();
        this.activities = [];
        
        this.initializationPromise = this.initialize();
    }

    async initialize() {
        await this.loadKeys();
        await this.loadData();
        
        if (this.keyManager) {
            this.keyManager.onKeysRefreshed(async () => {
                console.log('🔄 [ACTIVITYPUB] Keys refreshed, reloading...');
                await this.loadKeys();
            });
        }
        
        console.log('✅ [ACTIVITYPUB] Server initialization complete');
    }

    async ensureInitialized() {
        await this.initializationPromise;
    }

    async loadKeys() {
        try {
            if (this.keyManager) {
                this.publicKey = await this.keyManager.getPublicKey();
                this.privateKey = await this.keyManager.getPrivateKey();
            } else {
                this.publicKey = this.getPublicKeyFromEnv();
                await this.loadPrivateKeyFromFile();
            }
            
            if (this.publicKey && this.privateKey) {
                console.log('🔑 [ACTIVITYPUB] Keys loaded successfully');
            } else {
                console.log('⚠️ [ACTIVITYPUB] Keys not available yet');
            }
        } catch (error) {
            console.error('❌ [ACTIVITYPUB] Error loading keys:', error);
        }
    }

    getPublicKeyFromEnv() {
        if (process.env.ACTIVITYPUB_PUBLIC_KEY) {
            return process.env.ACTIVITYPUB_PUBLIC_KEY.replace(/\\n/g, '\n');
        }
        return null;
    }

    async loadPrivateKeyFromFile() {
        try {
            const privateKeyFile = path.join(this.dataDir, 'private-key.pem');
            
            if (await fs.pathExists(privateKeyFile)) {
                this.privateKey = await fs.readFile(privateKeyFile, 'utf8');
                console.log('🔑 [ACTIVITYPUB] Private key loaded from file');
            } else {
                console.log('🔑 [ACTIVITYPUB] No private key file found');
                
                try {
                    const files = await fs.readdir(this.dataDir);
                    const oldKeyFiles = files.filter(f => 
                        f.startsWith('private-key-') && 
                        f.endsWith('.pem') && 
                        f !== 'private-key.pem'
                    );
                    
                    if (oldKeyFiles.length > 0) {
                        console.log(`🧹 [ACTIVITYPUB] Found ${oldKeyFiles.length} old key files, cleaning up...`);
                        for (const file of oldKeyFiles) {
                            await fs.remove(path.join(this.dataDir, file));
                            console.log(`🧹 [ACTIVITYPUB] Removed old key: ${file}`);
                        }
                    }
                } catch (cleanupError) {
                    console.warn('⚠️ [ACTIVITYPUB] Could not cleanup old keys:', cleanupError.message);
                }
            }
        } catch (error) {
            console.error('❌ [ACTIVITYPUB] Error loading private key:', error);
        }
    }

    areKeysAvailable() {
        return !!(this.publicKey && this.privateKey);
    }

    async refreshKeys() {
        await this.loadKeys();
        return this.areKeysAvailable();
    }

    async loadData() {
        try {
            await fs.ensureDir(this.dataDir);

            try {
                const followersData = await fs.readFile(path.join(this.dataDir, 'followers.json'), 'utf8');
                this.followers = new Set(JSON.parse(followersData));
            } catch (e) {
                console.log('[ACTIVITYPUB] No existing followers file');
            }

            try {
                const followingData = await fs.readFile(path.join(this.dataDir, 'following.json'), 'utf8');
                this.following = new Set(JSON.parse(followingData));
            } catch (e) {
                console.log('[ACTIVITYPUB] No existing following file');
            }

            try {
                const activitiesData = await fs.readFile(path.join(this.dataDir, 'activities.json'), 'utf8');
                this.activities = JSON.parse(activitiesData);
            } catch (e) {
                console.log('[ACTIVITYPUB] No existing activities file');
            }

            console.log(`[ACTIVITYPUB] Loaded ${this.followers.size} followers, ${this.following.size} following, ${this.activities.length} activities`);
        } catch (error) {
            console.error('[ACTIVITYPUB] Error loading data:', error);
        }
    }

    async saveData() {
        try {
            await fs.writeFile(
                path.join(this.dataDir, 'followers.json'), 
                JSON.stringify([...this.followers], null, 2)
            );
            await fs.writeFile(
                path.join(this.dataDir, 'following.json'), 
                JSON.stringify([...this.following], null, 2)
            );
            await fs.writeFile(
                path.join(this.dataDir, 'activities.json'), 
                JSON.stringify(this.activities, null, 2)
            );
        } catch (error) {
            console.error('[ACTIVITYPUB] Error saving data:', error);
        }
    }

    generateWebFinger() {
        return {
            "subject": `acct:${this.username}@${this.domain}`,
            "aliases": [
                `${this.baseUrl}/actor.json`  
            ],
            "links": [
                {
                    "rel": "self",
                    "type": "application/activity+json",
                    "href": `${this.baseUrl}/actor.json`
                },
                {
                    "rel": "http://webfinger.net/rel/profile-page",
                    "type": "text/html",
                    "href": this.baseUrl
                }
            ]
        };
    }

    async generateActor() {
        await this.ensureInitialized();
        
        if (!this.areKeysAvailable()) {
            console.error('❌ [ACTIVITYPUB] Cannot generate actor - keys not available');
            return null;
        }

        return {
            "@context": [
                "https://www.w3.org/ns/activitystreams",
                "https://w3id.org/security/v1"
            ],
            "type": "Person",
            "id": `${this.baseUrl}/actor.json`,                    
            "name": this.displayName,
            "preferredUsername": this.username,
            "summary": this.description,
            "url": this.baseUrl,
            "outbox": `${this.baseUrl}/outbox.json`,              
            "followers": `${this.baseUrl}/followers.json`,        
            "following": `${this.baseUrl}/following.json`,        
            "inbox": `${this.baseUrl}/inbox`,
            "icon": {
                "type": "Image",
                "mediaType": "image/png",
                "url": `${this.baseUrl}/assets/img/Image.png`
            },
            "publicKey": {
                "id": `${this.baseUrl}/actor.json#main-key`,       
                "owner": `${this.baseUrl}/actor.json`,
                "publicKeyPem": this.publicKey
            },
            "manuallyApprovesFollowers": false,
            "discoverable": true,                                 
            "indexable": true,                                   
            "alsoKnownAs": []
        };
    }

    generateOutbox(blogPosts = [], wikiPages = []) {
        console.log(`[ACTIVITYPUB] Generating outbox with ${blogPosts.length} blog posts and ${wikiPages.length} wiki pages`);
        
        const blogActivities = blogPosts.map(post => ({
            "type": "Create",
            "id": `${this.baseUrl}/activities/blog/${post.slug}`,
            "actor": `${this.baseUrl}/actor.json`,                
            "published": new Date(post.date).toISOString(),
            "to": ["https://www.w3.org/ns/activitystreams#Public"],
            "cc": [`${this.baseUrl}/followers`],
            "object": {
                "type": "Article",
                "id": `${this.baseUrl}/blog/${post.slug}`,
                "url": `${this.baseUrl}/blog/${post.slug}`,
                "name": post.title,
                "content": post.content,
                "summary": post.excerpt,
                "published": new Date(post.date).toISOString(),
                "attributedTo": `${this.baseUrl}/actor.json`,     
                "to": ["https://www.w3.org/ns/activitystreams#Public"],
                "cc": [`${this.baseUrl}/followers`],
                "mediaType": "text/html",
                "tag": (post.tags || []).map(tag => ({
                    "type": "Hashtag",
                    "href": `${this.baseUrl}/blog?tag=${encodeURIComponent(tag)}`,
                    "name": `#${tag}`
                }))
            }
        }));

        const includeWiki = process.env.INCLUDE_WIKI_IN_ACTIVITYPUB !== 'false';
        let wikiActivities = [];
        
        if (includeWiki && wikiPages.length > 0) {
            const filteredWikiPages = wikiPages.filter(page => page.slug !== 'home');
            
            wikiActivities = filteredWikiPages.map(page => ({
                "type": "Create",
                "id": `${this.baseUrl}/activities/wiki/${page.slug}`,
                "actor": `${this.baseUrl}/actor.json`,            
                "published": new Date(page.lastModified).toISOString(),
                "to": ["https://www.w3.org/ns/activitystreams#Public"],
                "cc": [`${this.baseUrl}/followers`],
                "object": {
                    "type": "Article",
                    "id": `${this.baseUrl}/wiki/${page.slug}`,
                    "url": `${this.baseUrl}/wiki/${page.slug}`,
                    "name": `📖 ${page.title}`,
                    "content": page.content,
                    "summary": page.description || `Wiki page: ${page.title}`,
                    "published": new Date(page.lastModified).toISOString(),
                    "attributedTo": `${this.baseUrl}/actor.json`, 
                    "to": ["https://www.w3.org/ns/activitystreams#Public"],
                    "cc": [`${this.baseUrl}/followers`],
                    "mediaType": "text/html",
                    "tag": [
                        {
                            "type": "Hashtag",
                            "name": `#wiki`,
                            "href": `${this.baseUrl}/wiki`
                        },
                        {
                            "type": "Hashtag",
                            "name": `#${page.category}`,
                            "href": `${this.baseUrl}/wiki?category=${encodeURIComponent(page.category)}`
                        },
                        ...(page.tags || []).map(tag => ({
                            "type": "Hashtag",
                            "href": `${this.baseUrl}/wiki?tag=${encodeURIComponent(tag)}`,
                            "name": `#${tag}`
                        }))
                    ]
                }
            }));
        }

        const allActivities = [...blogActivities, ...wikiActivities];
        allActivities.sort((a, b) => new Date(b.published) - new Date(a.published));

        return {
            "@context": "https://www.w3.org/ns/activitystreams",
            "type": "OrderedCollection",
            "id": `${this.baseUrl}/outbox.json`,                  
            "totalItems": allActivities.length,
            "orderedItems": allActivities
        };
    }

    generateCollection(type) {
        const items = type === 'followers' ? [...this.followers] : [...this.following];
        return {
            "@context": "https://www.w3.org/ns/activitystreams",
            "type": "OrderedCollection",
            "id": `${this.baseUrl}/${type}.json`,                 
            "totalItems": items.length,
            "orderedItems": items
        };
    }

    signRequest(method, url, body) {
        if (!this.areKeysAvailable()) {
            console.error('❌ [ACTIVITYPUB] Cannot sign request - keys not available');
            return null;
        }

        try {
            const urlObj = new URL(url);
            const date = new Date().toUTCString();
            
            const bodyBuffer = Buffer.from(body || '', 'utf8');
            const digest = 'SHA-256=' + crypto.createHash('sha256').update(bodyBuffer).digest('base64');
            
            const requestTarget = `${method.toLowerCase()} ${urlObj.pathname}`;
            
            const headersToSign = [
                `(request-target): ${requestTarget}`,
                `host: ${urlObj.hostname}`,
                `date: ${date}`,
                `digest: ${digest}`,
                `content-type: application/activity+json`
            ];
            
            const stringToSign = headersToSign.join('\n');
            
            const signature = crypto.sign('sha256', Buffer.from(stringToSign, 'utf8'), {
                key: this.privateKey,
                padding: crypto.constants.RSA_PKCS1_PADDING
            }).toString('base64');
            
            return {
                'Host': urlObj.hostname,
                'Date': date,
                'Digest': digest,
                'Content-Type': 'application/activity+json',
                'User-Agent': 'ActivityPubServer/1.0',
                'Accept': 'application/activity+json',
                'Signature': `keyId="${this.baseUrl}/actor.json#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest content-type",signature="${signature}"`
            };
        } catch (error) {
            console.error('❌ Signing error:', error);
            return null;
        }
    }

    async sendActivityToFollower(followerUrl, activity) {
        try {
            console.log(`📤 Sending activity to ${followerUrl}`);
            console.log(`📤 Activity type: ${activity.type}`);

            const actorResponse = await fetch(followerUrl, {
                headers: { 
                    'Accept': 'application/activity+json, application/ld+json',
                    'User-Agent': 'ActivityPubServer/1.0'
                }
            });
            
            if (!actorResponse.ok) {
                console.error(`❌ Failed to fetch actor: ${actorResponse.status} ${actorResponse.statusText}`);
                return false;
            }
            
            const actorData = await actorResponse.json();
            const inboxUrl = actorData.inbox;
            
            if (!inboxUrl) {
                console.error(`❌ No inbox found in actor data`);
                console.error(`Actor data:`, JSON.stringify(actorData, null, 2));
                return false;
            }

            console.log(`📤 Inbox URL: ${inboxUrl}`);

            const body = JSON.stringify(activity, null, 0);
            console.log(`📤 Activity body length: ${body.length} chars`);
            
            const headers = this.signRequest('POST', inboxUrl, body);
            
            if (!headers) {
                console.error(`❌ Failed to sign request - no private key?`);
                console.error(`❌ Private key exists: ${!!this.privateKey}`);
                return false;
            }

            console.log(`📤 Signed headers:`, Object.keys(headers));
            console.log(`📤 Signature header:`, headers.Signature ? 'Present' : 'Missing');

            const response = await fetch(inboxUrl, {
                method: 'POST',
                headers: headers,
                body: body
            });

            console.log(`📤 Response: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Error response from ${inboxUrl}:`);
                console.error(`❌ Status: ${response.status}`);
                console.error(`❌ Body: ${errorText}`);
                
                if (errorText.includes('signature')) {
                    console.error(`❌ SIGNATURE VERIFICATION FAILED!`);
                    console.error(`❌ This means the receiving server rejected our signature`);
                }
            } else {
                console.log(`✅ Activity successfully delivered to ${followerUrl}`);
            }
            
            return response.ok;
            
        } catch (error) {
            console.error(`❌ Send error to ${followerUrl}:`, error.message);
            console.error(`❌ Stack trace:`, error.stack);
            return false;
        }
    }

    async handleFollow(activity, blogPosts = [], wikiPages = []) {
        try {
            console.log(`👤 Processing Follow from: ${activity.actor}`);
            console.log(`📊 Available content: ${blogPosts.length} blog posts, ${wikiPages.length} wiki pages`);
            
            this.followers.add(activity.actor);
            await this.saveData();
            
            console.log(`✅ Added follower: ${activity.actor} (Total: ${this.followers.size})`);
            
            const acceptActivity = {
                "@context": "https://www.w3.org/ns/activitystreams",
                "type": "Accept",
                "id": `${this.baseUrl}/activities/accept/${Date.now()}`,
                "actor": `${this.baseUrl}/actor.json`,
                "object": activity,
                "to": [activity.actor],
                "published": new Date().toISOString()
            };
            
            const sent = await this.sendActivityToFollower(activity.actor, acceptActivity);
            
            if (sent) {
                console.log(`✅ Accept activity sent to ${activity.actor}`);
                
                console.log(`📤 [DEBUG] Sending recent posts IMMEDIATELY to new follower: ${activity.actor}`);
                
                try {
                    await this.sendRecentPostsToNewFollower(activity.actor, blogPosts, wikiPages);
                    console.log(`✅ [DEBUG] Finished sending recent posts`);
                } catch (error) {
                    console.error(`❌ [DEBUG] Error sending recent posts: ${error.message}`);
                    console.error(`❌ [DEBUG] Stack trace:`, error.stack);
                }
                    
            } else {
                console.log(`❌ Failed to send Accept activity to ${activity.actor}`);
            }
            
            return { success: sent, acceptActivity };
            
        } catch (error) {
            console.error('❌ Error handling Follow:', error);
            throw error;
        }
    }

    async handleUndo(activity) {
        try {
            if (activity.object?.type === 'Follow') {
                console.log(`[ACTIVITYPUB] Processing Unfollow from ${activity.actor}`);
                this.followers.delete(activity.actor);
                await this.saveData();
            }
        } catch (error) {
            console.error('[ACTIVITYPUB] Error handling Undo:', error);
            throw error;
        }
    }

    async broadcastNewPost(post) {
        if (this.followers.size === 0) {
            console.log('📤 [ACTIVITYPUB] No followers to broadcast to');
            return;
        }

        console.log(`📤 [ACTIVITYPUB] Broadcasting new post "${post.title}" to ${this.followers.size} followers`);
        
        const createActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            "type": "Create",
            "id": `${this.baseUrl}/activities/blog/${post.slug}`,
            "actor": `${this.baseUrl}/actor.json`,                
            "published": new Date(post.date).toISOString(),
            "to": ["https://www.w3.org/ns/activitystreams#Public"],
            "cc": [`${this.baseUrl}/followers`],
            "object": {
                "type": "Article",
                "id": `${this.baseUrl}/blog/${post.slug}`,
                "url": `${this.baseUrl}/blog/${post.slug}`,
                "name": post.title,
                "content": post.content,
                "summary": post.excerpt,
                "published": new Date(post.date).toISOString(),
                "attributedTo": `${this.baseUrl}/actor.json`,     
                "to": ["https://www.w3.org/ns/activitystreams#Public"],
                "cc": [`${this.baseUrl}/followers`],
                "mediaType": "text/html",
                "tag": (post.tags || []).map(tag => ({
                    "type": "Hashtag",
                    "href": `${this.baseUrl}/blog?tag=${encodeURIComponent(tag)}`,
                    "name": `#${tag}`
                }))
            }
        };

        let successCount = 0;
        for (const followerUrl of this.followers) {
            try {
                const success = await this.sendActivityToFollower(followerUrl, createActivity);
                if (success) {
                    successCount++;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`❌ Error broadcasting to ${followerUrl}:`, error);
            }
        }
        
        console.log(`✅ [ACTIVITYPUB] Broadcast complete: ${successCount}/${this.followers.size} successful`);
    }

    async sendRecentPostsToNewFollower(followerUrl, blogPosts = [], wikiPages = []) {
        try {
            console.log(`📤 [ACTIVITYPUB] Sending recent posts to new follower: ${followerUrl}`);
            
            const recentBlogPosts = blogPosts.slice(0, 3);
            console.log(`📝 [ACTIVITYPUB] Sending ${recentBlogPosts.length} recent blog posts`);
            
            for (const post of recentBlogPosts) {
                const createActivity = {
                    "@context": "https://www.w3.org/ns/activitystreams",
                    "type": "Create",
                    "id": `${this.baseUrl}/activities/blog/${post.slug}`,
                    "actor": `${this.baseUrl}/actor.json`,        
                    "published": new Date(post.date).toISOString(),
                    "to": ["https://www.w3.org/ns/activitystreams#Public"],
                    "cc": [followerUrl],
                    "object": {
                        "type": "Article",
                        "id": `${this.baseUrl}/blog/${post.slug}`,
                        "url": `${this.baseUrl}/blog/${post.slug}`,
                        "name": post.title,
                        "content": post.content,
                        "summary": post.excerpt,
                        "published": new Date(post.date).toISOString(),
                        "attributedTo": `${this.baseUrl}/actor.json`, 
                        "to": ["https://www.w3.org/ns/activitystreams#Public"],
                        "cc": [followerUrl],
                        "mediaType": "text/html"
                    }
                };
                
                const success = await this.sendActivityToFollower(followerUrl, createActivity);
                if (success) {
                    console.log(`✅ Sent blog post "${post.title}" to ${followerUrl}`);
                } else {
                    console.log(`❌ Failed to send blog post "${post.title}" to ${followerUrl}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            

            const includeWiki = process.env.INCLUDE_WIKI_IN_ACTIVITYPUB !== 'false';
            if (includeWiki && wikiPages.length > 0) {
                const recentWikiPages = wikiPages
                    .filter(page => page.slug !== 'home')
                    .slice(0, 2);
                
                console.log(`📖 [ACTIVITYPUB] Sending ${recentWikiPages.length} recent wiki pages`);
                
                for (const page of recentWikiPages) {
                    const createActivity = {
                        "@context": "https://www.w3.org/ns/activitystreams",
                        "type": "Create",
                        "id": `${this.baseUrl}/activities/wiki/${page.slug}`,
                        "actor": `${this.baseUrl}/actor.json`,    
                        "published": new Date(page.lastModified).toISOString(),
                        "to": ["https://www.w3.org/ns/activitystreams#Public"],
                        "cc": [followerUrl],
                        "object": {
                            "type": "Article",
                            "id": `${this.baseUrl}/wiki/${page.slug}`,
                            "url": `${this.baseUrl}/wiki/${page.slug}`,
                            "name": `📖 ${page.title}`,
                            "content": page.content,
                            "summary": page.description || `Wiki page: ${page.title}`,
                            "published": new Date(page.lastModified).toISOString(),
                            "attributedTo": `${this.baseUrl}/actor.json`, 
                            "to": ["https://www.w3.org/ns/activitystreams#Public"],
                            "cc": [followerUrl],
                            "mediaType": "text/html"
                        }
                    };
                    
                    const success = await this.sendActivityToFollower(followerUrl, createActivity);
                    if (success) {
                        console.log(`✅ Sent wiki page "${page.title}" to ${followerUrl}`);
                    } else {
                        console.log(`❌ Failed to send wiki page "${page.title}" to ${followerUrl}`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            console.log(`✅ [ACTIVITYPUB] Finished sending recent content to ${followerUrl}`);
            
        } catch (error) {
            console.error(`❌ Error sending recent posts to ${followerUrl}:`, error);
        }
    }
}

module.exports = { ActivityPubServer };