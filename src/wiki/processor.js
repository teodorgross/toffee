const path = require('path');
const fs = require('fs-extra');
const marked = require('marked');
const fm = require('front-matter');
const chokidar = require('chokidar');

class WikiProcessor {
    constructor() {
        this.wikiDir = path.join(__dirname, '../../wiki');
        this.isLoading = false;
        this.wikiPages = [];
        this.ensureWikiDir();
        this.loadPages();
        this.watchPages();
    }

    ensureWikiDir() {
        if (!fs.existsSync(this.wikiDir)) {
            fs.mkdirSync(this.wikiDir, { recursive: true });
            console.log(`[WIKI] Created wiki directory: ${this.wikiDir}`);
            this.createDefaultStructure();
        }
    }

    async createDefaultStructure() {
        const defaultPages = {
            'home.md': `---
title: Wiki Home
category: general
order: 1
tags: [home, welcome]
---

# Welcome to the Wiki

This is your documentation hub with ActivityPub support.

## Features

- Create new .md files in the wiki/ directory
- Use frontmatter for metadata
- Content is automatically shared via ActivityPub
- Search and categorize your content
`,
            'activitypub.md': `---
title: ActivityPub Integration
category: features
order: 1
tags: [activitypub, fediverse, social]
---

# ActivityPub Integration

This blog and wiki supports ActivityPub, making it part of the fediverse.

## Features

- Follow this account from Mastodon, Pleroma, or other ActivityPub clients
- New blog posts and wiki pages are automatically shared
- Followers receive updates in their timeline
- Fully decentralized social networking

## How to Follow

Follow @${process.env.FEDIVERSE_USERNAME || 'blog'}@${process.env.FEDIVERSE_DOMAIN || 'localhost'} from your favorite fediverse client.
`
        };

        for (const [filename, content] of Object.entries(defaultPages)) {
            const filePath = path.join(this.wikiDir, filename);
            if (!fs.existsSync(filePath)) {
                await fs.writeFile(filePath, content);
                console.log(`[WIKI] Created default page: ${filename}`);
            }
        }
    }

    async loadPages() {
        if (this.isLoading) return;
        this.isLoading = true;
        
        try {
            const newWikiPages = [];
            let detectedNewPages = []; // Changed from const to let
            await this.loadPagesRecursive(this.wikiDir, '', newWikiPages);
            
            newWikiPages.sort((a, b) => {
                if (a.category !== b.category) {
                    return a.category.localeCompare(b.category);
                }
                if (a.order !== b.order) {
                    return (a.order || 999) - (b.order || 999);
                }
                return a.title.localeCompare(b.title);
            });
            
            if (!this.arraysEqual(this.wikiPages, newWikiPages)) {
                if (this.wikiPages.length > 0) {
                    detectedNewPages = newWikiPages.filter(newPage => 
                        !this.wikiPages.find(oldPage => oldPage.slug === newPage.slug)
                    );
                }
                
                this.wikiPages = newWikiPages;
                console.log(`[WIKI] Loaded ${this.wikiPages.length} wiki pages`);
                
                // Notify about new pages for ActivityPub broadcasting
                if (detectedNewPages.length > 0 && this.onNewPage) {
                    for (const page of detectedNewPages) {
                        if (page.slug !== 'home') {
                            console.log(`🚀 [WIKI] New wiki page detected: "${page.title}"`);
                            this.onNewPage(page);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[WIKI] Error loading pages:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async loadPagesRecursive(dir, basePath = '', pagesArray) {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = await fs.stat(fullPath);
            
            if (stat.isDirectory()) {
                await this.loadPagesRecursive(fullPath, path.join(basePath, file), pagesArray);
            } else if (file.endsWith('.md')) {
                const page = await this.processPage(fullPath, basePath);
                if (page) {
                    const existingIndex = pagesArray.findIndex(p => p.slug === page.slug);
                    if (existingIndex >= 0) {
                        pagesArray[existingIndex] = page;
                    } else {
                        pagesArray.push(page);
                    }
                }
            }
        }
    }

    async processPage(filePath, basePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = fm(content);
            
            const filename = path.basename(filePath, '.md');
            const slug = path.join(basePath, filename).replace(/\\/g, '/');
            const stats = await fs.stat(filePath);
            
            return {
                slug,
                title: parsed.attributes.title || this.slugToTitle(filename),
                category: parsed.attributes.category || 'general',
                order: parsed.attributes.order || 999,
                tags: parsed.attributes.tags || [],
                description: parsed.attributes.description || this.generateExcerpt(parsed.body),
                content: marked.parse(parsed.body),
                rawContent: parsed.body,
                lastModified: stats.mtime,
                filePath: filePath
            };
        } catch (error) {
            console.error(`[WIKI] Error processing ${filePath}:`, error);
            return null;
        }
    }

    slugToTitle(slug) {
        return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    generateExcerpt(content, maxLength = 200) {
        const text = content.replace(/[#*`]/g, '').trim();
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    watchPages() {
        const watcher = chokidar.watch(this.wikiDir + '/**/*.md');
        
        watcher.on('add', () => setTimeout(() => this.loadPages(), 100));
        watcher.on('change', () => setTimeout(() => this.loadPages(), 100));
        watcher.on('unlink', (filePath) => {
            const slug = this.filePathToSlug(filePath);
            this.wikiPages = this.wikiPages.filter(p => p.slug !== slug);
        });
    }

    filePathToSlug(filePath) {
        const relativePath = path.relative(this.wikiDir, filePath);
        return relativePath.replace(/\.md$/, '').replace(/\\/g, '/');
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

    // Getter for pages
    get pages() {
        return this.wikiPages;
    }

    // Find specific page
    findPage(slug) {
        return this.wikiPages.find(p => p.slug === slug);
    }

    // Get home page
    getHomePage() {
        return this.wikiPages.find(p => p.slug === 'home');
    }

    // Get pages by category
    getPagesByCategory() {
        const categories = {};
        this.wikiPages.forEach(page => {
            if (page.slug === 'home') return;
            
            if (!categories[page.category]) {
                categories[page.category] = [];
            }
            categories[page.category].push(page);
        });
        return categories;
    }

    // Search pages
    searchPages(query) {
        const searchTerm = query.toLowerCase();
        return this.wikiPages.filter(page => 
            page.title.toLowerCase().includes(searchTerm) ||
            page.description.toLowerCase().includes(searchTerm) ||
            page.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
            page.rawContent.toLowerCase().includes(searchTerm)
        );
    }

    // Get recent pages
    getRecentPages(limit = 3) {
        return this.wikiPages
            .filter(p => p.slug !== 'home')
            .slice(0, limit);
    }

    // Get related pages
    getRelatedPages(page, limit = 5) {
        return this.wikiPages
            .filter(p => p.category === page.category && p.slug !== page.slug)
            .slice(0, limit);
    }

    // Set callback for new pages (for ActivityPub integration)
    setNewPageCallback(callback) {
        this.onNewPage = callback;
    }
}

module.exports = { WikiProcessor };