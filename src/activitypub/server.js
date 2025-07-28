const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { access } = require('fs');

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
                `${this.baseUrl}/actor`,
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
            "id": `${this.baseUrl}/actor`,
            "name": this.displayName,
            "preferredUsername": this.username,
            "summary": this.description,
            "url": this.baseUrl,
            "outbox": `${this.baseUrl}/outbox`,
            "followers": `${this.baseUrl}/followers`,
            "following": `${this.baseUrl}/following`,
            "inbox": `${this.baseUrl}/inbox`,
            "icon": {
                "type": "Image",
                "mediaType": "image/jpeg",
                "url": `${this.baseUrl}/assets/img/avatar.jpg`
            },
            "publicKey": {
                "id": `${this.baseUrl}/actor#main-key`,
                "owner": `${this.baseUrl}/actor.json`,
                "publicKeyPem": this.publicKey
            },
            "manuallyApprovesFollowers": false,
            "alsoKnownAs": [
                `${this.baseUrl}/actor.json`
            ]
        };
    }

    generateOutbox(blogPosts = [], wikiPages = []) {
        console.log(`[ACTIVITYPUB] Generating outbox with ${blogPosts.length} blog posts and ${wikiPages.length} wiki pages`);
        
        const blogActivities = blogPosts.map(post => ({
            "type": "Create",
            "id": `${this.baseUrl}/activities/blog/${post.slug}`,
            "actor": `${this.baseUrl}/actor`,
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
                "attributedTo": `${this.baseUrl}/actor`,
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
        console.log(`[ACTIVITYPUB] INCLUDE_WIKI_IN_ACTIVITYPUB = ${process.env.INCLUDE_WIKI_IN_ACTIVITYPUB} (includeWiki: ${includeWiki})`);
        
        let wikiActivities = [];
        
        if (includeWiki && wikiPages.length > 0) {
            console.log(`[ACTIVITYPUB] Including ${wikiPages.length} wiki pages in outbox`);
            
            const filteredWikiPages = wikiPages.filter(page => page.slug !== 'home');
            console.log(`[ACTIVITYPUB] Wiki pages after filtering out home: ${filteredWikiPages.length}`);
            
            wikiActivities = filteredWikiPages.map(page => {
                console.log(`[ACTIVITYPUB] Processing wiki page: ${page.title} (${page.slug})`);
                return {
                    "type": "Create",
                    "id": `${this.baseUrl}/activities/wiki/${page.slug}`,
                    "actor": `${this.baseUrl}/actor`,
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
                        "attributedTo": `${this.baseUrl}/actor`,
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
                };
            });
        } else {
            console.log(`[ACTIVITYPUB] Wiki pages excluded from outbox (INCLUDE_WIKI_IN_ACTIVITYPUB=${process.env.INCLUDE_WIKI_IN_ACTIVITYPUB}, wikiPages.length=${wikiPages.length})`);
        }

        const allActivities = [...blogActivities, ...wikiActivities];
        allActivities.sort((a, b) => new Date(b.published) - new Date(a.published));

        console.log(`[ACTIVITYPUB] Generated outbox with ${allActivities.length} total activities (${blogActivities.length} blog + ${wikiActivities.length} wiki)`);

        return {
            "@context": "https://www.w3.org/ns/activitystreams",
            "type": "OrderedCollection",
            "id": `${this.baseUrl}/outbox`,
            "totalItems": allActivities.length,
            "orderedItems": allActivities
        };
    }

    generateCollection(type) {
        const items = type === 'followers' ? [...this.followers] : [...this.following];
        return {
            "@context": "https://www.w3.org/ns/activitystreams",
            "type": "OrderedCollection",
            "id": `${this.baseUrl}/${type}`,
            "totalItems": items.length,
            "orderedItems": items
        };
    }

    signRequest(method, url, body) {
        if (!this.privateKey) {
            console.error('[ACTIVITYPUB] No private key available for signing');
            return null;
        }

        try {
            const urlObj = new URL(url);
            const date = new Date().toUTCString();
            
            const digest = body ? 'SHA-256=' + crypto
                .createHash('sha256')
                .update(body, 'utf8')
                .digest('base64') : null;
            
            const requestTarget = `${method.toLowerCase()} ${urlObj.pathname}`;
            const headersToSign = [
                `(request-target): ${requestTarget}`,
                `host: ${urlObj.hostname}`,
                `date: ${date}`
            ];
            
            if (digest) {
                headersToSign.push(`digest: ${digest}`);
            }
            
            const signingString = headersToSign.join('\n');
            
            const signature = crypto
                .sign('sha256', Buffer.from(signingString, 'utf8'), this.privateKey)
                .toString('base64');
            
            const signatureHeaders = digest ? 
                '(request-target) host date digest' : 
                '(request-target) host date';
            
            const signatureHeader = `keyId="${this.baseUrl}/actor#main-key",algorithm="rsa-sha256",headers="${signatureHeaders}",signature="${signature}"`;
            
            const headers = {
                'Host': urlObj.hostname,
                'Date': date,
                'Content-Type': 'application/activity+json',
                'User-Agent': 'BlogWikiActivityPub/1.0',
                'Signature': signatureHeader
            };
            
            if (digest) {
                headers['Digest'] = digest;
            }
            
            return headers;
        } catch (error) {
            console.error('[ACTIVITYPUB] Error signing request:', error);
            return null;
        }
    }

    async sendActivityToFollower(followerUrl, activity) {
        try {
            console.log(`📤 [ACTIVITYPUB] Sending activity to ${followerUrl}`);
            
            const actorResponse = await fetch(followerUrl, {
                headers: {
                    'Accept': 'application/activity+json, application/ld+json',
                    'User-Agent': 'BlogWikiActivityPub/1.0'
                }
            });
            
            if (!actorResponse.ok) {
                console.error(`❌ Failed to fetch actor: ${actorResponse.status}`);
                return false;
            }
            
            const actorData = await actorResponse.json();
            const inboxUrl = actorData.inbox;
            
            if (!inboxUrl) {
                console.error(`❌ No inbox found for ${followerUrl}`);
                return false;
            }
            
            const body = JSON.stringify(activity);
            const headers = this.signRequest('POST', inboxUrl, body);
            
            if (!headers) {
                console.error(`❌ Failed to sign request for ${inboxUrl}`);
                return false;
            }
            
            const response = await fetch(inboxUrl, {
                method: 'POST',
                headers: headers,
                body: body
            });
            
            console.log(`📤 Response from ${inboxUrl}: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Error response: ${errorText}`);
            }
            
            return response.ok;
        } catch (error) {
            console.error(`❌ Error sending activity to ${followerUrl}:`, error);
            return false;
        }
    }

    async handleFollow(activity) {
        try {
            console.log(`[ACTIVITYPUB] Processing Follow from ${activity.actor}`);
            
            this.followers.add(activity.actor);
            this.activities.push({
                ...activity,
                received: new Date().toISOString()
            });
            
            await this.saveData();

            const acceptActivity = {
                "@context": "https://www.w3.org/ns/activitystreams",
                "type": "Accept",
                "id": `${this.baseUrl}/activities/accept/${Date.now()}`,
                "actor": `${this.baseUrl}/actor`,
                "object": activity,
                "to": [activity.actor],
                "published": new Date().toISOString()
            };

            const sent = await this.sendActivityToFollower(activity.actor, acceptActivity);
            if (sent) {
                console.log(`✅ [ACTIVITYPUB] Accept sent to ${activity.actor}`);
            } else {
                console.log(`❌ [ACTIVITYPUB] Failed to send Accept to ${activity.actor}`);
            }
            
            return acceptActivity;
        } catch (error) {
            console.error('[ACTIVITYPUB] Error handling Follow:', error);
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
            "actor": `${this.baseUrl}/actor`,
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
                "attributedTo": `${this.baseUrl}/actor`,
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
                } else {
                    console.log(`❌ Failed to send to ${followerUrl}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`❌ Error broadcasting to ${followerUrl}:`, error);
            }
        }
        
        console.log(`✅ [ACTIVITYPUB] Broadcast complete: ${successCount}/${this.followers.size} successful`);
    }

    async broadcastNewWikiPage(page) {
        if (this.followers.size === 0 || page.slug === 'home') {
            return;
        }

        console.log(`📤 [ACTIVITYPUB] Broadcasting new wiki page "${page.title}" to ${this.followers.size} followers`);
        
        const createActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            "type": "Create",
            "id": `${this.baseUrl}/activities/wiki/${page.slug}`,
            "actor": `${this.baseUrl}/actor`,
            "published": new Date(page.lastModified).toISOString(),
            "to": ["https://www.w3.org/ns/activitystreams#Public"],
            "cc": [`${this.baseUrl}/followers`],
            "object": {
                "type": "Article",
                "id": `${this.baseUrl}/wiki/${page.slug}`,
                "url": `${this.baseUrl}/wiki/${page.slug}`,
                "name": `📖 ${page.title}`,
                "content": page.content,
                "summary": page.description,
                "published": new Date(page.lastModified).toISOString(),
                "attributedTo": `${this.baseUrl}/actor`,
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
                console.error(`❌ Error broadcasting wiki page to ${followerUrl}:`, error);
            }
        }
        
        console.log(`✅ [ACTIVITYPUB] Wiki broadcast complete: ${successCount}/${this.followers.size} successful`);
    }

    async sendRecentPostsToNewFollower(followerUrl, blogPosts = [], wikiPages = []) {
        try {
            console.log(`📤 [ACTIVITYPUB] Sending recent posts (blog + wiki) to new follower: ${followerUrl}`);
            
            // Blog Posts
            const recentBlogPosts = blogPosts.slice(0, 3);
            console.log(`📝 [ACTIVITYPUB] Sending ${recentBlogPosts.length} recent blog posts`);
            
            for (const post of recentBlogPosts) {
                const createActivity = {
                    "@context": "https://www.w3.org/ns/activitystreams",
                    "type": "Create",
                    "id": `${this.baseUrl}/activities/blog/${post.slug}`,
                    "actor": `${this.baseUrl}/actor`,
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
                        "attributedTo": `${this.baseUrl}/actor`,
                        "to": ["https://www.w3.org/ns/activitystreams#Public"],
                        "cc": [followerUrl],
                        "mediaType": "text/html"
                    }
                };
                
                await this.sendActivityToFollower(followerUrl, createActivity);
                await new Promise(resolve => setTimeout(resolve, 150));
            }
            
            // Wiki Pages (when enabled)
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
                        "actor": `${this.baseUrl}/actor`,
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
                            "attributedTo": `${this.baseUrl}/actor`,
                            "to": ["https://www.w3.org/ns/activitystreams#Public"],
                            "cc": [followerUrl],
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
                    };
                    
                    await this.sendActivityToFollower(followerUrl, createActivity);
                    await new Promise(resolve => setTimeout(resolve, 150));
                }
            }
            
            console.log(`✅ [ACTIVITYPUB] Sent recent content (blog + wiki) to ${followerUrl}`);
            
        } catch (error) {
            console.error(`❌ Error sending recent posts to ${followerUrl}:`, error);
        }
    }
}

module.exports = { ActivityPubServer };