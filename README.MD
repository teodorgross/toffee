![Banner Image](/public/assets/img/Image.png)

# Toffee
## Blog & Wiki with ActivityPub/Fediverse Integration

![GitHub stars](https://img.shields.io/github/stars/teodorgross/toffee?style=social)
![GitHub forks](https://img.shields.io/github/forks/teodorgross/toffee?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/teodorgross/toffee?style=social)
![GitHub repo size](https://img.shields.io/github/repo-size/teodorgross/toffee)
![GitHub language count](https://img.shields.io/github/languages/count/teodorgross/toffee)
![GitHub top language](https://img.shields.io/github/languages/top/teodorgross/toffee)
![GitHub last commit](https://img.shields.io/github/last-commit/teodorgross/toffee?color=red)


A complete blog and wiki server with native ActivityPub support that automatically shares your content in the Fediverse (Mastodon, Pleroma, etc.).



## 🚀 Quick Installation

### Prerequisites
- **Node.js 16+** and **npm**
- **Git** for cloning the repository
- **Domain** pointing to your server (for ActivityPub integration)

### Installation Steps

# 1. Clone the repository
```
git clone https://github.com/teodorgross/toffee.git
cd toffee
```
# 2. Copy example configuration
```
cp .env.example .env
```
# 3. Edit configuration file
```
nano .env
```
Essential settings:
```
# Server Configuration
PORT=3000
NODE_ENV=production

# Site Information
SITE_NAME=Your Blog Name
SITE_DESCRIPTION=Your blog description
AUTHOR_NAME=Your Name
AUTHOR_EMAIL=your@email.com

# Domain Configuration (required for ActivityPub)
DOMAIN=yourdomain.com
BASE_URL=https://yourdomain.com
```
# 4. Install dependencies
```
npm install
```
# 5. Run in background (automatically via PM2)

```
npm run background
```

**Alternative - Run without background process:**

```
npm run start
```

### Adding Content

Once installed, you can add content by placing Markdown files in:

- **Blog posts**: Add `.md` files to `/blog/` directory
- **Wiki pages**: Add `.md` files to `/wiki/` directory

Content is automatically detected and published to the Fediverse!

---

## ✨ Features

### 📝 Blog & Wiki
- **Markdown-based**: Write blog posts and wiki pages in Markdown
- **Hot Reload**: Changes are automatically detected and reloaded
- **Categories & Tags**: Organize your content
- **Search Function**: Search across all content
- **Responsive Design**: Works on all devices

### 🌍 ActivityPub/Fediverse Integration
- **Full ActivityPub Implementation**: Native Fediverse support
- **Followable Account**: Users can follow you from Mastodon, Pleroma, etc.
- **Automatic Sharing**: New blog posts and wiki pages are automatically shared
- **WebFinger Support**: Discoverable via `@username@domain`
- **JSON Feed**: Modern RSS alternative for compatible clients

### 🔧 Technical Details
- **Single Application**: All-in-one Node.js application
- **No Database Required**: File system-based
- **Automatic Key Generation**: ActivityPub keys are generated automatically
- **Secure Implementation**: Follows ActivityPub standards

## 📋 Detailed Setup

### 1. PM2 Management Commands

```
# Start in background
npm run background

# Control PM2 process
npm run pm2:start      # Start the application
npm run pm2:stop       # Stop the application
npm run pm2:restart    # Restart the application
npm run pm2:logs       # View live logs
npm run pm2:status     # Show status
npm run pm2:monit      # Open monitoring dashboard
```

### 2. Content Structure

#### Blog Posts
Create `.md` files in `/blog/` directory:

```markdown
---
title: My First Post
description: This is my first blog post
date: 2025-07-28 12:00:00 +0200
tags: #welcome #blog #firstpost
author: 'Your Name'
---

# Your content here

Write your blog post content in Markdown...
```

#### Wiki Pages
Create `.md` files in `/wiki/` directory:

```markdown
---
title: Documentation Page
category: getting-started
order: 1
tags: [documentation, guide, wiki]
---

# Your Documentation

Write your wiki content in Markdown...
```
## 🌐 ActivityPub Integration

### Following Your Blog

Once configured with a proper domain, users can follow your blog from any ActivityPub-compatible client:

- **From Mastodon**: Search for `@username@yourdomain.com`
- **From Pleroma**: Search for `@username@yourdomain.com`
- **Any Fediverse client**: Look up your domain's WebFinger endpoint

### Available Endpoints

- **Actor**: `https://yourdomain.com/actor`
- **WebFinger**: `https://yourdomain.com/.well-known/webfinger`
- **Outbox**: `https://yourdomain.com/outbox`
- **Inbox**: `https://yourdomain.com/inbox`
- **JSON Feed**: `https://yourdomain.com/feed.json`

## 🛠️ Development


### Project Structure

```
toffee/
├── blog/              # Blog posts (.md files)
├── wiki/              # Wiki pages (.md files)
├── public/            # Static assets
├── views/             # EJS templates
├── src/               # Source code
├── activitypub-data/  # ActivityPub keys and data
├── logs/              # Application logs
└── ecosystem.config.js # PM2 configuration
```


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


---

**Made with ❤️ for the decentralized web**
