const moment = require('moment');
const { renderWithLayout } = require('../utils/renderer');

function setupWebRoutes(app, activityPubServer, blogProcessor, wikiProcessor) {
    
    // Homepage
    app.get('/', (req, res) => {
        renderWithLayout(res, 'index', {
            currentPage: 'home',
            title: '',
            recentPosts: blogProcessor ? blogProcessor.getRecentPosts(3) : [],
            recentWiki: wikiProcessor ? wikiProcessor.getRecentPages(3) : []
        }, activityPubServer, blogProcessor, wikiProcessor);
    });

    // Fediverse page
    app.get('/fediverse', (req, res) => {
        renderWithLayout(res, 'fediverse', {
            currentPage: 'fediverse',
            title: 'Fediverse',
            activityPubServer: activityPubServer,
            followers: [...activityPubServer.followers],
            following: [...activityPubServer.following],
            recentActivities: activityPubServer.activities.slice(-10).reverse()
        }, activityPubServer, blogProcessor, wikiProcessor);
    });

    // Privacy & Legal
    app.get('/privacy', (req, res) => {
        renderWithLayout(res, 'privacy', {
            currentPage: 'privacy',
            title: 'Privacy'
        }, activityPubServer, blogProcessor, wikiProcessor);
    });

    app.get('/imprint', (req, res) => {
        renderWithLayout(res, 'imprint', {
            currentPage: 'imprint',
            title: 'Imprint'
        }, activityPubServer, blogProcessor, wikiProcessor);
    });

    app.get('/about', (req, res) => {
        renderWithLayout(res, 'about', {
            currentPage: 'about',
            title: 'About'
        }, activityPubServer, blogProcessor, wikiProcessor);
    });

    // Sitemap
    app.get('/sitemap.xml', (req, res) => {
        const baseUrl = activityPubServer.baseUrl;
        const blogPosts = blogProcessor ? blogProcessor.posts : [];
        const wikiPages = wikiProcessor ? wikiProcessor.pages : [];
        
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        
        // Static pages
        const staticPages = ['/', '/blog', '/wiki', '/fediverse', '/about', '/privacy', '/imprint'];
        staticPages.forEach(url => {
            xml += `  <url>
    <loc>${baseUrl}${url}</loc>
    <lastmod>${moment().format('YYYY-MM-DD')}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
        });
        
        // Blog posts
        blogPosts.forEach(post => {
            xml += `  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${moment(post.lastModified).format('YYYY-MM-DD')}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;
        });
        
        // Wiki pages
        wikiPages.forEach(page => {
            xml += `  <url>
    <loc>${baseUrl}/wiki/${page.slug}</loc>
    <lastmod>${moment(page.lastModified).format('YYYY-MM-DD')}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
        });
        
        xml += '</urlset>';
        
        res.set('Content-Type', 'application/xml');
        res.send(xml);
    });

    // Robots.txt
    app.get('/robots.txt', (req, res) => {
        const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /activitypub-data/

Sitemap: ${activityPubServer.baseUrl}/sitemap.xml`;
        
        res.set('Content-Type', 'text/plain');
        res.send(robotsTxt);
    });

    // Health check
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            service: 'blog-wiki-activitypub',
            uptime: process.uptime(),
            stats: {
                blogPosts: blogProcessor ? blogProcessor.posts.length : 0,
                wikiPages: wikiProcessor ? wikiProcessor.pages.length : 0,
                followers: activityPubServer.followers.size,
                following: activityPubServer.following.size,
                activities: activityPubServer.activities.length
            },
            activitypub: {
                enabled: true,
                domain: activityPubServer.domain,
                username: activityPubServer.username,
                actor: `${activityPubServer.baseUrl}/actor`,
                webfinger: `@${activityPubServer.username}@${activityPubServer.domain}`
            },
            endpoints: [
                '/.well-known/webfinger',
                '/actor',
                '/outbox',
                '/followers',
                '/following',
                '/inbox',
                '/feed.json'
            ]
        });
    });
}

module.exports = { setupWebRoutes };