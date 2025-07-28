const moment = require('moment');

function renderWithLayout(res, view, data = {}, activityPubServer, blogProcessor, wikiProcessor) {
    const socialLinks = {
        github: process.env.SOCIAL_GITHUB || null,
        git: process.env.SOCIAL_GIT || null,
        mastodon: process.env.SOCIAL_MASTODON || null,
        twitter: process.env.SOCIAL_TWITTER || null,
        linkedin: process.env.SOCIAL_LINKEDIN || null,
        email: process.env.SOCIAL_EMAIL || null
    };

    // Remove empty social links
    Object.keys(socialLinks).forEach(key => {
        if (!socialLinks[key]) {
            delete socialLinks[key];
        }
    });

    const templateData = {
        posts: blogProcessor ? blogProcessor.posts : [],
        wikiPages: wikiProcessor ? wikiProcessor.pages : [],
        moment: moment,
        socialLinks: socialLinks,
        sitename: process.env.SITE_NAME || 'Blog & Wiki',
        fediverse: {
            username: activityPubServer ? activityPubServer.username : '',
            domain: activityPubServer ? activityPubServer.domain : '',
            followersCount: activityPubServer ? activityPubServer.followers.size : 0,
            followingCount: activityPubServer ? activityPubServer.following.size : 0
        },
        fediverseConfig: {
            username: activityPubServer ? activityPubServer.username : '',
            domain: activityPubServer ? activityPubServer.domain : '',
            baseUrl: activityPubServer ? activityPubServer.baseUrl : '',
            socialLinks: socialLinks,
            sitename: process.env.SITE_NAME || 'Blog & Wiki'
        },
        ...data
    };
    
    res.render(view, templateData);
}

module.exports = { renderWithLayout };