const express = require('express');
require('dotenv').config();
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const expressLayouts = require('express-ejs-layouts');

const { ActivityPubKeyManager } = require('./src/activitypub/keyManager');
const { ActivityPubServer } = require('./src/activitypub/server');
const { BlogProcessor } = require('./src/blog/processor');
const { WikiProcessor } = require('./src/wiki/processor');
const { setupActivityPubRoutes } = require('./src/routes/activitypub');
const { setupWebRoutes } = require('./src/routes/web');
const { setupBlogRoutes } = require('./src/routes/blog');
const { setupWikiRoutes } = require('./src/routes/wiki');
const { marked } = require('marked');

async function startServer() {
    const app = express();
    const PORT = process.env.PORT || 3000;

    app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
    app.use(expressLayouts);
    app.set('view engine', 'ejs');
    app.set('layout', 'layout');
    app.set('views', path.join(__dirname, 'views'));

    marked.setOptions({
        mangle: false,
        headerIds: false,
        breaks: true,
        gfm: true,
    });

    app.use(helmet({
        contentSecurityPolicy: false
    }));
    app.use(compression());

    app.use('/assets', express.static('assets'));
    app.use('/css', express.static('css'));

    console.log('🔑 [INIT] Setting up ActivityPub keys...');
    const keyManager = new ActivityPubKeyManager();
    await keyManager.generateKeysIfNeeded();

    console.log('🔑 [INIT] Ensuring keys are available...');
    let keysReady = await keyManager.hasKeysWithRefresh();
    
    if (!keysReady) {
        console.log('⏳ [INIT] Waiting for keys to be ready...');
        
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            keysReady = await keyManager.hasKeysWithRefresh();
            
            if (keysReady) {
                console.log('✅ [INIT] Keys are now ready!');
                break;
            }
        }
        
        if (!keysReady) {
            throw new Error('Failed to generate or load keys within timeout');
        }
    }

    console.log('🔧 [INIT] Creating ActivityPub server...');
    const activityPubServer = new ActivityPubServer(keyManager);
    const blogProcessor = new BlogProcessor();
    const wikiProcessor = new WikiProcessor();

    console.log('⏳ [INIT] Waiting for server initialization...');
    await activityPubServer.ensureInitialized();

    const finalCheck = activityPubServer.areKeysAvailable();
    console.log(`🔍 [INIT] Final key check: ${finalCheck ? '✅ Available' : '❌ Not available'}`);
    
    if (!finalCheck) {
        console.error('❌ [INIT] Keys still not available after initialization!');
        process.exit(1);
    }

    app.use((req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Signature, Date, Host');
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        if (req.method === 'POST' && req.url === '/inbox') {
            let body = '';
            req.setEncoding('utf8');
            
            req.on('data', chunk => {
                body += chunk;
            });
            
            req.on('end', () => {
                try {
                    req.body = JSON.parse(body);
                    req.rawBody = body;
                } catch (e) {
                    req.body = {};
                }
                next();
            });
        } else {
            express.json()(req, res, next);
        }
    });

    app.use(express.urlencoded({ extended: true }));

    app.locals.activityPubServer = activityPubServer;
    app.locals.blogProcessor = blogProcessor;
    app.locals.wikiProcessor = wikiProcessor;

    setupActivityPubRoutes(app, activityPubServer);
    setupWebRoutes(app, activityPubServer, blogProcessor, wikiProcessor);
    setupBlogRoutes(app, blogProcessor);
    setupWikiRoutes(app, wikiProcessor);

    app.use((req, res) => {
        const { renderWithLayout } = require('./src/utils/renderer');
        renderWithLayout(res, '404', {
            currentPage: 'error',
            title: '404 - Page Not Found'
        }, activityPubServer, blogProcessor, wikiProcessor);
    });

    app.use((err, req, res, next) => {
        console.error('[SERVER] Error:', err);
        const { renderWithLayout } = require('./src/utils/renderer');
        renderWithLayout(res, 'error', {
            error: err,
            currentPage: 'error',
            title: 'Server Error'
        }, activityPubServer, blogProcessor, wikiProcessor);
    });

    app.listen(PORT, () => {
        console.log(`🚀 [SERVER] Blog & Wiki with ActivityPub running on port ${PORT}`);
        console.log(`📁 [SERVER] Blog posts directory: ${path.join(__dirname, 'posts')}`);
        console.log(`📁 [SERVER] Wiki pages directory: ${path.join(__dirname, 'wiki')}`);
        console.log(`📁 [SERVER] ActivityPub data directory: ${path.join(__dirname, 'activitypub-data')}`);
        console.log(`🌐 [ACTIVITYPUB] Follow: @${activityPubServer.username}@${activityPubServer.domain}`);
        console.log(`👥 [ACTIVITYPUB] Current followers: ${activityPubServer.followers.size}`);
        console.log(`🔗 [ACTIVITYPUB] Current following: ${activityPubServer.following.size}`);
        console.log(`📋 [ACTIVITYPUB] Activities: ${activityPubServer.activities.length}`);
        console.log(`🔑 [ACTIVITYPUB] Keys available: ${activityPubServer.areKeysAvailable()}`);
        console.log(`\n📊 Available endpoints:`);
        console.log(`   🌐 Homepage: ${activityPubServer.baseUrl}/`);
        console.log(`   📝 Blog: ${activityPubServer.baseUrl}/blog`);
        console.log(`   📖 Wiki: ${activityPubServer.baseUrl}/wiki`);
        console.log(`   🌍 Fediverse: ${activityPubServer.baseUrl}/fediverse`);
        console.log(`   👤 Actor: ${activityPubServer.baseUrl}/actor`);
        console.log(`   📤 Outbox: ${activityPubServer.baseUrl}/outbox`);
        console.log(`   📥 Inbox: ${activityPubServer.baseUrl}/inbox`);
        console.log(`   💙 WebFinger: ${activityPubServer.baseUrl}/.well-known/webfinger`);
        console.log(`   📰 JSON Feed: ${activityPubServer.baseUrl}/feed.json`);
        console.log(`   🔍 Health: ${activityPubServer.baseUrl}/health`);
        console.log(`   🛠️  Admin: ${activityPubServer.baseUrl}/admin/activitypub`);
    });

    return app;
}

startServer().catch(error => {
    console.error('❌ [INIT] Server startup failed:', error);
    process.exit(1);
});

module.exports = startServer;