const path = require('path');
const fs = require('fs-extra');
const marked = require('marked');
const fm = require('front-matter');
const chokidar = require('chokidar');

class BlogProcessor {
    constructor() {
        this.postsDir = path.join(__dirname, '../../posts');
        this.isLoading = false;
        this.blogPosts = [];
        this.ensurePostsDir();
        this.loadPosts();
        this.watchPosts();
    }

    ensurePostsDir() {
        if (!fs.existsSync(this.postsDir)) {
            fs.mkdirSync(this.postsDir);
            console.log(`[BLOG] Created posts directory: ${this.postsDir}`);
        }
    }

    async loadPosts() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const files = await fs.readdir(this.postsDir);
            const markdownFiles = files.filter(file => file.endsWith('.md'));
            const newBlogPosts = [];
            const newPosts = [];
            
            for (const file of markdownFiles) {
                const post = await this.processPost(file);
                if (post) {
                    const existingIndex = newBlogPosts.findIndex(p => p.slug === post.slug);
                    if (existingIndex >= 0) {
                        newBlogPosts[existingIndex] = post;
                    } else {
                        newBlogPosts.push(post);
                        if (this.blogPosts.length > 0 && !this.blogPosts.find(p => p.slug === post.slug)) {
                            newPosts.push(post);
                        }
                    }
                }
            }
            
            newBlogPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            if (!this.arraysEqual(this.blogPosts, newBlogPosts)) {
                this.blogPosts = newBlogPosts;
                console.log(`[BLOG] Loaded ${this.blogPosts.length} posts`);
                
                // Notify about new posts for ActivityPub broadcasting
                if (newPosts.length > 0 && this.onNewPost) {
                    for (const post of newPosts) {
                        console.log(`🚀 [BLOG] New post detected: "${post.title}"`);
                        this.onNewPost(post);
                    }
                }
            }
        } catch (error) {
            console.error('[BLOG] Error loading posts:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async processPost(filename) {
        try {
            const filePath = path.join(this.postsDir, filename);
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = fm(content);
            
            const slug = filename.replace('.md', '');
            const stats = await fs.stat(filePath);
            
            return {
                slug,
                title: parsed.attributes.title || slug.replace(/-/g, ' '),
                date: parsed.attributes.date || stats.mtime,
                author: parsed.attributes.author || 'Team',
                tags: parsed.attributes.tags || [],
                excerpt: parsed.attributes.excerpt || this.generateExcerpt(parsed.body),
                content: marked.parse(parsed.body),
                rawContent: parsed.body,
                filename,
                lastModified: stats.mtime
            };
        } catch (error) {
            console.error(`[BLOG] Error processing ${filename}:`, error);
            return null;
        }
    }

    generateExcerpt(content, maxLength = 150) {
        const text = content.replace(/[#*`]/g, '').trim();
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    watchPosts() {
        const watcher = chokidar.watch(this.postsDir + '/*.md');
        
        watcher.on('add', () => setTimeout(() => this.loadPosts(), 100));
        watcher.on('change', () => setTimeout(() => this.loadPosts(), 100));
        watcher.on('unlink', (filePath) => {
            const filename = path.basename(filePath);
            const slug = filename.replace('.md', '');
            this.blogPosts = this.blogPosts.filter(p => p.slug !== slug);
        });
    }

    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i].slug !== b[i].slug || 
                a[i].lastModified.getTime() !== b[i].lastModified.getTime()) {
                return false;
            }
        }
        return true;
    }

    // Getter for posts
    get posts() {
        return this.blogPosts;
    }

    // Find specific post
    findPost(slug) {
        return this.blogPosts.find(p => p.slug === slug);
    }

    // Get posts with pagination
    getPaginatedPosts(page = 1, perPage = 6) {
        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage;
        
        return {
            posts: this.blogPosts.slice(startIndex, endIndex),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(this.blogPosts.length / perPage),
                hasNext: endIndex < this.blogPosts.length,
                hasPrev: page > 1,
                total: this.blogPosts.length
            }
        };
    }

    // Get recent posts
    getRecentPosts(limit = 3) {
        return this.blogPosts.slice(0, limit);
    }

    // Set callback for new posts (for ActivityPub integration)
    setNewPostCallback(callback) {
        this.onNewPost = callback;
    }
}

module.exports = { BlogProcessor };