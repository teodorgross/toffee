const { renderWithLayout } = require('../utils/renderer');

function setupWikiRoutes(app, wikiProcessor) {
    
    // Wiki main page
    app.get('/wiki', (req, res) => {
        const categories = wikiProcessor.getPagesByCategory();
        const homePage = wikiProcessor.getHomePage();
        
        renderWithLayout(res, 'wiki', {
            currentPage: 'wiki',
            title: 'Wiki',
            categories: categories,
            homePage: homePage
        }, app.locals.activityPubServer, app.locals.blogProcessor, app.locals.wikiProcessor);
    });

    // Wiki search
    app.get('/wiki/search', (req, res) => {
        const query = req.query.q || '';
        const results = query ? wikiProcessor.searchPages(query) : [];
        
        renderWithLayout(res, 'wiki-search', {
            currentPage: 'wiki',
            title: `Search: ${query}`,
            query: query,
            results: results
        }, app.locals.activityPubServer, app.locals.blogProcessor, app.locals.wikiProcessor);
    });

    // Individual wiki page (catch-all for nested pages)
    app.get('/wiki/:slug(*)', (req, res) => {
        const slug = req.params.slug;
        const page = wikiProcessor.findPage(slug);
        
        if (!page) {
            return renderWithLayout(res, '404', {
                currentPage: 'wiki',
                title: '404 - Wiki Page Not Found'
            }, app.locals.activityPubServer, app.locals.blogProcessor, app.locals.wikiProcessor);
        }
        
        const relatedPages = wikiProcessor.getRelatedPages(page, 5);
        
        renderWithLayout(res, 'wiki-page', {
            currentPage: 'wiki',
            title: page.title,
            page: page,
            relatedPages: relatedPages
        }, app.locals.activityPubServer, app.locals.blogProcessor, app.locals.wikiProcessor);
    });

    // Setup ActivityPub integration for new wiki pages
    if (app.locals.activityPubServer) {
        wikiProcessor.setNewPageCallback(async (page) => {
            await app.locals.activityPubServer.broadcastNewWikiPage(page);
        });
    }
}

module.exports = { setupWikiRoutes };