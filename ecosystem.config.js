// ecosystem.config.js - Debug Version
module.exports = {
    apps: [{
        name: 'blog-wiki-activitypub',
        script: 'index.js', // Überprüfe ob das der richtige Dateiname ist!
        
        // Debug-spezifische Einstellungen
        instances: 1,
        exec_mode: 'fork',
        
        // Environment variables
        env: {
            NODE_ENV: 'development',
            PORT: 3000,
            DEBUG: '*' // Aktiviert Debug-Logs
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        
        // WICHTIG: Restart-Verhalten anpassen für Debugging
        autorestart: false, // Deaktiviere Auto-Restart zum Debuggen
        watch: false,
        max_memory_restart: '1G',
        restart_delay: 10000, // Erhöhte Delay
        max_restarts: 3, // Reduzierte max restarts
        min_uptime: '30s', // Erhöhte min uptime
        
        // Erweiterte Logging
        log_file: './logs/combined.log',
        out_file: './logs/out.log',
        error_file: './logs/err.log',
        time: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        
        // Erweiterte Timeouts
        kill_timeout: 10000, // Erhöht von 5000
        listen_timeout: 15000, // Erhöht von 8000
        
        // Error handling
        exp_backoff_restart_delay: 100,
        
        // Node.js spezifische Optionen
        node_args: [
            '--max-old-space-size=1024',
            '--unhandled-rejections=strict' // Zeigt unhandled promise rejections
        ]
    }]
};