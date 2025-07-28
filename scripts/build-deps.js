// scripts/build-deps.js
const fs = require('fs-extra');
const path = require('path');

async function buildDependencies() {
    try {
        console.log('🔧 Building frontend dependencies...');

        // Verzeichnisse erstellen falls sie nicht existieren
        const projectRoot = process.cwd();
        console.log(`📂 Working in: ${projectRoot}`);
        
        const dirs = [
            path.join(projectRoot, 'public', 'assets', 'css'),
            path.join(projectRoot, 'public', 'assets', 'js'),
            path.join(projectRoot, 'public', 'assets', 'webfonts')
        ];

        for (const dir of dirs) {
            await fs.ensureDir(dir);
            console.log(`📁 Created directory: ${path.relative(projectRoot, dir)}`);
        }

        // Bootstrap CSS kopieren
        const bootstrapCssSource = path.join(projectRoot, 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.min.css');
        const bootstrapCssTarget = path.join(projectRoot, 'public', 'assets', 'css', 'bootstrap.min.css');
        
        if (await fs.pathExists(bootstrapCssSource)) {
            await fs.copy(bootstrapCssSource, bootstrapCssTarget);
            console.log('✅ Bootstrap CSS copied');
        } else {
            console.log('❌ Bootstrap CSS not found - run: npm install bootstrap');
        }

        // Bootstrap JS kopieren
        const bootstrapJsSource = path.join(projectRoot, 'node_modules', 'bootstrap', 'dist', 'js', 'bootstrap.bundle.min.js');
        const bootstrapJsTarget = path.join(projectRoot, 'public', 'assets', 'js', 'bootstrap.bundle.min.js');
        
        if (await fs.pathExists(bootstrapJsSource)) {
            await fs.copy(bootstrapJsSource, bootstrapJsTarget);
            console.log('✅ Bootstrap JS copied');
        } else {
            console.log('❌ Bootstrap JS not found - run: npm install bootstrap');
        }

        // Font Awesome CSS kopieren
        const fontAwesomeCssSource = path.join(projectRoot, 'node_modules', '@fortawesome', 'fontawesome-free', 'css', 'all.min.css');
        const fontAwesomeCssTarget = path.join(projectRoot, 'public', 'assets', 'css', 'all.min.css');
        
        if (await fs.pathExists(fontAwesomeCssSource)) {
            await fs.copy(fontAwesomeCssSource, fontAwesomeCssTarget);
            console.log('✅ Font Awesome CSS copied');
        } else {
            console.log('❌ Font Awesome CSS not found - run: npm install @fortawesome/fontawesome-free');
        }

        // Font Awesome Webfonts kopieren
        const fontAwesomeWebfontsSource = path.join(projectRoot, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts');
        const fontAwesomeWebfontsTarget = path.join(projectRoot, 'public', 'assets', 'webfonts');
        
        if (await fs.pathExists(fontAwesomeWebfontsSource)) {
            await fs.copy(fontAwesomeWebfontsSource, fontAwesomeWebfontsTarget);
            console.log('✅ Font Awesome webfonts copied');
        } else {
            console.log('❌ Font Awesome webfonts not found');
        }

        console.log('🎉 All frontend dependencies built successfully!');

        // Zeige was erstellt wurde
        console.log('\n📋 Created files:');
        const files = [
            path.join(projectRoot, 'public', 'assets', 'css', 'bootstrap.min.css'),
            path.join(projectRoot, 'public', 'assets', 'css', 'all.min.css'),
            path.join(projectRoot, 'public', 'assets', 'js', 'bootstrap.bundle.min.js')
        ];

        for (const file of files) {
            if (await fs.pathExists(file)) {
                const stats = await fs.stat(file);
                const relativePath = path.relative(projectRoot, file);
                console.log(`   ✅ ${relativePath} (${Math.round(stats.size / 1024)}KB)`);
            } else {
                const relativePath = path.relative(projectRoot, file);
                console.log(`   ❌ ${relativePath} (missing)`);
            }
        }

    } catch (error) {
        console.error('❌ Error building dependencies:', error);
        process.exit(1);
    }
}

// Führe das Script aus wenn es direkt aufgerufen wird
if (require.main === module) {
    buildDependencies();
}

module.exports = buildDependencies;