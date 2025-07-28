function setupActivityPubRoutes(app, activityPubServer) {
    
    // WebFinger
    app.get('/.well-known/webfinger', (req, res) => {
        const resource = req.query.resource;
        const expected = `acct:${activityPubServer.username}@${activityPubServer.domain}`;
        
        console.log(`[ACTIVITYPUB] WebFinger request for: ${resource}`);
        
        if (resource === expected) {
            res.set('Content-Type', 'application/jrd+json; charset=utf-8');
            res.json(activityPubServer.generateWebFinger());
        } else {
            console.log(`[ACTIVITYPUB] Account not found: ${resource} (expected: ${expected})`);
            res.status(404).json({ "error": "Account not found" });
        }
    });

    // Actor - Both variants
    app.get('/actor', (req, res) => {
        console.log(`[ACTIVITYPUB] Actor request from ${req.get('User-Agent') || 'Unknown'}`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        res.json(activityPubServer.generateActor());
    });

    app.get('/actor.json', (req, res) => {
        console.log(`[ACTIVITYPUB] Actor.json request from ${req.get('User-Agent') || 'Unknown'}`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        res.json(activityPubServer.generateActor());
    });

    // Outbox - Both variants
    app.get('/outbox', (req, res) => {
        console.log(`[ACTIVITYPUB] Outbox request from ${req.get('User-Agent') || 'Unknown'}`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        const blogPosts = app.locals.blogProcessor ? app.locals.blogProcessor.posts : [];
        const wikiPages = app.locals.wikiProcessor ? app.locals.wikiProcessor.pages : [];
        res.json(activityPubServer.generateOutbox(blogPosts, wikiPages));
    });

    app.get('/outbox.json', (req, res) => {
        console.log(`[ACTIVITYPUB] Outbox.json request from ${req.get('User-Agent') || 'Unknown'}`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        const blogPosts = app.locals.blogProcessor ? app.locals.blogProcessor.posts : [];
        const wikiPages = app.locals.wikiProcessor ? app.locals.wikiProcessor.pages : [];
        res.json(activityPubServer.generateOutbox(blogPosts, wikiPages));
    });

    // Followers - Both variants
    app.get('/followers', (req, res) => {
        console.log(`[ACTIVITYPUB] Followers request - Current: ${activityPubServer.followers.size}`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        res.json(activityPubServer.generateCollection('followers'));
    });

    app.get('/followers.json', (req, res) => {
        console.log(`[ACTIVITYPUB] Followers.json request - Current: ${activityPubServer.followers.size}`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        res.json(activityPubServer.generateCollection('followers'));
    });

    // Following - Both variants
    app.get('/following', (req, res) => {
        console.log(`[ACTIVITYPUB] Following request - Current: ${activityPubServer.following.size}`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        res.json(activityPubServer.generateCollection('following'));
    });

    app.get('/following.json', (req, res) => {
        console.log(`[ACTIVITYPUB] Following.json request - Current: ${activityPubServer.following.size}`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        res.json(activityPubServer.generateCollection('following'));
    });

    // Inbox GET (for info) - Both variants
    app.get('/inbox', (req, res) => {
        console.log(`[ACTIVITYPUB] GET request to /inbox`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            "type": "OrderedCollection",
            "id": `${activityPubServer.baseUrl}/inbox`,
            "totalItems": activityPubServer.activities.length,
            "summary": `ActivityPub inbox. ${activityPubServer.followers.size} followers. Follow requests automatically accepted.`
        });
    });

    app.get('/inbox.json', (req, res) => {
        console.log(`[ACTIVITYPUB] GET request to /inbox.json`);
        res.set('Content-Type', 'application/activity+json; charset=utf-8');
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            "type": "OrderedCollection",
            "id": `${activityPubServer.baseUrl}/inbox`,
            "totalItems": activityPubServer.activities.length,
            "summary": `ActivityPub inbox. ${activityPubServer.followers.size} followers. Follow requests automatically accepted.`
        });
    });

    // Inbox POST (ActivityPub interactions)
    app.post('/inbox', async (req, res) => {
        const activity = req.body;
        
        console.log(`[ACTIVITYPUB] Incoming activity:`, JSON.stringify(activity, null, 2));
        
        if (!activity || typeof activity !== 'object' || !activity.type) {
            return res.status(400).json({ error: 'Invalid activity' });
        }
        
        try {
            switch (activity.type) {
                case 'Follow':
                    console.log(`[ACTIVITYPUB] Processing Follow from: ${activity.actor}`);
                    
                    const blogPosts = getBlogPosts(app);
                    const wikiPages = getWikiPages(app);
                    
                    const result = await activityPubServer.handleFollow(
                        activity, 
                        blogPosts, 
                        wikiPages
                    );
                    
                    res.status(202).json({ 
                        message: result.success ? 'Follow accepted and recent content shared' : 'Follow accepted (content sharing failed)',
                        follower: activity.actor,
                        totalFollowers: activityPubServer.followers.size,
                        contentShared: result.success
                    });
                    break;
                    
                case 'Undo':
                    if (activity.object?.type === 'Follow') {
                        console.log(`[ACTIVITYPUB] Processing Unfollow from: ${activity.actor}`);
                        await activityPubServer.handleUndo(activity);
                        res.json({ 
                            message: 'Unfollow processed',
                            totalFollowers: activityPubServer.followers.size
                        });
                    } else {
                        res.json({ message: 'Undo processed' });
                    }
                    break;
                    
                case 'Like':
                    console.log(`[ACTIVITYPUB] Like from ${activity.actor} on ${activity.object}`);
                    activityPubServer.activities.push({
                        ...activity,
                        received: new Date().toISOString()
                    });
                    await activityPubServer.saveData();
                    res.json({ message: 'Like received' });
                    break;
                    
                case 'Announce':
                    console.log(`[ACTIVITYPUB] Boost from ${activity.actor} on ${activity.object}`);
                    activityPubServer.activities.push({
                        ...activity,
                        received: new Date().toISOString()
                    });
                    await activityPubServer.saveData();
                    res.json({ message: 'Boost received' });
                    break;
                    
                default:
                    console.log(`[ACTIVITYPUB] Other activity type: ${activity.type}`);
                    activityPubServer.activities.push({
                        ...activity,
                        received: new Date().toISOString()
                    });
                    await activityPubServer.saveData();
                    res.json({ message: 'Activity received' });
            }
        } catch (error) {
            console.error('[ACTIVITYPUB] Error processing activity:', error);
            res.status(500).json({ error: 'Failed to process activity' });
        }
    });

    // JSON Feed
    app.get('/feed.json', (req, res) => {
        console.log(`[FEED] JSON Feed request`);
        
        const blogPosts = app.locals.blogProcessor ? app.locals.blogProcessor.posts : [];
        const wikiPages = app.locals.wikiProcessor ? app.locals.wikiProcessor.pages : [];
        
        const blogItems = blogPosts.map(post => ({
            "id": `${activityPubServer.baseUrl}/blog/${post.slug}`,
            "url": `${activityPubServer.baseUrl}/blog/${post.slug}`,
            "title": post.title,
            "content_html": post.content,
            "summary": post.excerpt,
            "date_published": new Date(post.date).toISOString(),
            "tags": post.tags || [],
            "_type": "blog"
        }));

        const wikiItems = wikiPages
            .filter(page => page.slug !== 'home')
            .map(page => ({
                "id": `${activityPubServer.baseUrl}/wiki/${page.slug}`,
                "url": `${activityPubServer.baseUrl}/wiki/${page.slug}`,
                "title": `📖 ${page.title}`,
                "content_html": page.content,
                "summary": page.description,
                "date_published": new Date(page.lastModified).toISOString(),
                "tags": [`wiki-${page.category}`, ...page.tags],
                "_type": "wiki"
            }));

        const allItems = [...blogItems, ...wikiItems];
        allItems.sort((a, b) => new Date(b.date_published) - new Date(a.date_published));

        res.set('Content-Type', 'application/json; charset=utf-8');
        res.json({
            "version": "https://jsonfeed.org/version/1.1",
            "title": activityPubServer.displayName,
            "home_page_url": activityPubServer.baseUrl,
            "feed_url": `${activityPubServer.baseUrl}/feed.json`,
            "description": activityPubServer.description,
            "icon": `${activityPubServer.baseUrl}/assets/img/avatar.jpg`,
            "authors": [{
                "name": activityPubServer.displayName,
                "url": activityPubServer.baseUrl
            }],
            "items": allItems
        });
    });

    // Admin routes (for debugging)
    app.get('/admin/activitypub', (req, res) => {
        res.json({
            server: {
                domain: activityPubServer.domain,
                username: activityPubServer.username,
                displayName: activityPubServer.displayName,
                baseUrl: activityPubServer.baseUrl,
                publicKey: !!activityPubServer.publicKey,
                privateKey: !!activityPubServer.privateKey
            },
            stats: {
                followers: activityPubServer.followers.size,
                following: activityPubServer.following.size,
                activities: activityPubServer.activities.length,
                blogPosts: app.locals.blogProcessor ? app.locals.blogProcessor.posts.length : 0,
                wikiPages: app.locals.wikiProcessor ? app.locals.wikiProcessor.pages.length : 0
            },
            followers: [...activityPubServer.followers],
            following: [...activityPubServer.following],
            recentActivities: activityPubServer.activities.slice(-5)
        });
    });
}
function getBlogPosts(app) {
    if (app.locals && app.locals.blogProcessor && app.locals.blogProcessor.posts) {
        return app.locals.blogProcessor.posts;
    }
    
    if (typeof blogPosts !== 'undefined' && Array.isArray(blogPosts)) {
        return blogPosts;
    }
    
    console.warn('⚠️ [ACTIVITYPUB] Could not find blog posts data');
    return [];
}

function getWikiPages(app) {
    if (app.locals && app.locals.wikiProcessor && app.locals.wikiProcessor.pages) {
        return app.locals.wikiProcessor.pages;
    }
    
    if (typeof wikiPages !== 'undefined' && Array.isArray(wikiPages)) {
        return wikiPages;
    }
    
    console.warn('⚠️ [ACTIVITYPUB] Could not find wiki pages data');
    return [];
}

module.exports = { setupActivityPubRoutes };