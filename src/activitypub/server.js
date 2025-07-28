const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

class ActivityPubServer {
    constructor() {
        this.domain = process.env.FEDIVERSE_DOMAIN || new URL(process.env.BASE_URL || 'http://localhost:3000').hostname;
        this.username = process.env.FEDIVERSE_USERNAME || 'blog';
        this.displayName = process.env.FEDIVERSE_DISPLAY_NAME || 'Blog & Wiki';
        this.description = process.env.FEDIVERSE_DESCRIPTION || 'A blog and wiki with ActivityPub support';
        this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        this.dataDir = path.join(__dirname, '../../activitypub-data');
        
        this.publicKey = this.getPublicKey();
        this.privateKey = null;
        
        this.followers = new Set();
        this.following = new Set();
        this.activities = [];
        
        this.loadData();
        this.loadPrivateKey();
    }

    getPublicKey() {
        if (process.env.ACTIVITYPUB_PUBLIC_KEY) {
            return process.env.ACTIVITYPUB_PUBLIC_KEY.replace(/\\n/g, '\n');
        }
        return null;
    }

    async loadPrivateKey() {
        try {
            const privateKeyFile = path.join(this.dataDir, 'private-key.pem');
            
            if (await fs.pathExists(privateKeyFile)) {
                this.privateKey = await fs.readFile(privateKeyFile, 'utf8');
                console.log('🔑 [ACTIVITYPUB] Private key loaded');
            } else {
                console.log('🔑 [ACTIVITYPUB] No private key found');
                
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

    async loadData() {
        try {
            await fs.ensureDir(this.dataDir);

            // Load followers
            try {
                const followersData = await fs.readFile(path.join(this.dataDir, 'followers.json'), 'utf8');
                this.followers = new Set(JSON.parse(followersData));
            } catch (e) {
                console.log('[ACTIVITYPUB] No existing followers file');
            }

            // Load following
            try {
                const followingData = await fs.readFile(path.join(this.dataDir, 'following.json'), 'utf8');
                this.following = new Set(JSON.parse(followingData));
            } catch (e) {
                console.log('[ACTIVITYPUB] No existing following file');
            }

            // Load activities
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

    generateActor() {
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
            "inbox": `${this.baseUrl}/inbox.json`,
            "icon": {
                "type": "Image",
                "mediaType": "image/jpeg",
                "url": `${this.baseUrl}/assets/img/avatar.jpg`
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
        if (!this.privateKey) {
            console.error('❌ No private key for signing!');
            return null;
        }

        try {
            const urlObj = new URL(url);
            const date = new Date().toUTCString();
            
            // SHA-256 Digest
            const bodyBuffer = Buffer.from(body || '', 'utf8');
            const digest = 'SHA-256=' + crypto.createHash('sha256').update(bodyBuffer).digest('base64');
            
            // Request Target
            const requestTarget = `${method.toLowerCase()} ${urlObj.pathname}`;
            
            // Headers to sign
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

            // 1. Get follower's actor info
            const actorResponse = await fetch(followerUrl, {
                headers: { 
                    'Accept': 'application/activity+json, application/ld+json',
                    'User-Agent': 'ActivityPubServer/1.0'
                }
            });
            
            if (!actorResponse.ok) {
                console.error(`❌ Failed to fetch actor: ${actorResponse.status}`);
                return false;
            }
            
            const actorData = await actorResponse.json();
            const inboxUrl = actorData.inbox;
            
            if (!inboxUrl) {
                console.error(`❌ No inbox found`);
                return false;
            }

            // 2. Sign and send activity
            const body = JSON.stringify(activity, null, 0); // No formatting!
            const headers = this.signRequest('POST', inboxUrl, body);
            
            if (!headers) {
                console.error(`❌ Failed to sign request`);
                return false;
            }

            const response = await fetch(inboxUrl, {
                method: 'POST',
                headers: headers,
                body: body
            });

            console.log(`📤 Response: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Error response: ${errorText}`);
            }
            
            return response.ok;
            
        } catch (error) {
            console.error(`❌ Send error:`, error);
            return false;
        }
    }

    async handleFollow(activity, blogPosts = [], wikiPages = []) {
        try {
            console.log(`👤 Processing Follow from: ${activity.actor}`);
            console.log(`📊 Available content: ${blogPosts.length} blog posts, ${wikiPages.length} wiki pages`);
            
            // Add follower
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
            
            // Send Accept activity
            const sent = await this.sendActivityToFollower(activity.actor, acceptActivity);
            
            if (sent) {
                console.log(`✅ Accept activity sent to ${activity.actor}`);
                
                // ✅ Sende sofort die aktuellen Posts nach erfolgreichem Accept
                console.log(`📤 Sending recent posts to new follower: ${activity.actor}`);
                
                // Verwende setTimeout, um sicherzustellen dass Accept verarbeitet wurde
                setTimeout(async () => {
                    try {
                        await this.sendRecentPostsToNewFollower(activity.actor, blogPosts, wikiPages);
                    } catch (error) {
                        console.error(`❌ Error sending recent posts: ${error.message}`);
                    }
                }, 1000); // 1 Sekunde warten
                
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
            console.log(`📤 [ACTIVITYPUB] Starting content push to new follower: ${followerUrl}`);
            console.log(`📊 [ACTIVITYPUB] Available: ${blogPosts.length} blog posts, ${wikiPages.length} wiki pages`);
            
            if (blogPosts.length === 0 && wikiPages.length === 0) {
                console.log(`⚠️ [ACTIVITYPUB] No content available to send to ${followerUrl}`);
                return;
            }
            
            let sentCount = 0;
            
            // Send recent blog posts (last 3)
            if (blogPosts.length > 0) {
                const recentBlogPosts = blogPosts.slice(0, 3);
                console.log(`📝 [ACTIVITYPUB] Sending ${recentBlogPosts.length} recent blog posts`);
                
                for (const post of recentBlogPosts) {
                    console.log(`📝 [ACTIVITYPUB] Preparing blog post: "${post.title}" (${post.slug})`);
                    
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
                        sentCount++;
                        console.log(`✅ [ACTIVITYPUB] Sent blog post "${post.title}" to ${followerUrl}`);
                    } else {
                        console.log(`❌ [ACTIVITYPUB] Failed to send blog post "${post.title}" to ${followerUrl}`);
                    }
                    
                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } else {
                console.log(`📝 [ACTIVITYPUB] No blog posts available to send`);
            }
            
            // Send recent wiki pages (if enabled)
            const includeWiki = process.env.INCLUDE_WIKI_IN_ACTIVITYPUB !== 'false';
            if (includeWiki && wikiPages.length > 0) {
                const recentWikiPages = wikiPages
                    .filter(page => page.slug !== 'home')
                    .slice(0, 2);
                
                console.log(`📖 [ACTIVITYPUB] Sending ${recentWikiPages.length} recent wiki pages`);
                
                for (const page of recentWikiPages) {
                    console.log(`📖 [ACTIVITYPUB] Preparing wiki page: "${page.title}" (${page.slug})`);
                    
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
                        sentCount++;
                        console.log(`✅ [ACTIVITYPUB] Sent wiki page "${page.title}" to ${followerUrl}`);
                    } else {
                        console.log(`❌ [ACTIVITYPUB] Failed to send wiki page "${page.title}" to ${followerUrl}`);
                    }
                    
                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } else if (includeWiki) {
                console.log(`📖 [ACTIVITYPUB] No wiki pages available to send`);
            } else {
                console.log(`📖 [ACTIVITYPUB] Wiki sharing disabled`);
            }
            
            console.log(`✅ [ACTIVITYPUB] Content push completed: ${sentCount} items sent to ${followerUrl}`);
            
        } catch (error) {
            console.error(`❌ [ACTIVITYPUB] Error sending recent posts to ${followerUrl}:`, error);
        }
    }
 }
module.exports = { ActivityPubServer };