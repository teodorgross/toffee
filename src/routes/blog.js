const { renderWithLayout } = require('../utils/renderer');

function setupBlogRoutes(app, blogProcessor) {
    
    // Blog list page
    app.get('/blog', (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const perPage = 6;
        
        const { posts, pagination } = blogProcessor.getPaginatedPosts(page, perPage);
        
        renderWithLayout(res, 'blog', {
            posts: posts,
            currentPage: 'blog',
            title: 'Blog',
            page: pagination.currentPage,
            totalPages: pagination.totalPages,
            hasNext: pagination.hasNext,
            hasPrev: pagination.hasPrev
        }, app.locals.activityPubServer, app.locals.blogProcessor, app.locals.wikiProcessor);
    });

    // Individual blog post
    app.get('/blog/:slug', (req, res) => {
        const post = blogProcessor.findPost(req.params.slug);
        
        if (!post) {
            return renderWithLayout(res, '404', {
                currentPage: 'blog',
                title: '404 - Post Not Found'
            }, app.locals.activityPubServer, app.locals.blogProcessor, app.locals.wikiProcessor);
        }
        
        renderWithLayout(res, 'post', {
            post: post,
            currentPage: 'blog',
            title: post.title
        }, app.locals.activityPubServer, app.locals.blogProcessor, app.locals.wikiProcessor);
    });

    // Setup ActivityPub integration for new posts
    if (app.locals.activityPubServer) {
        blogProcessor.setNewPostCallback(async (post) => {
            await app.locals.activityPubServer.broadcastNewPost(post);
        });
    }
}

module.exports = { setupBlogRoutes };