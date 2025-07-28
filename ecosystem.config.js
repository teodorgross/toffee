module.exports = {
    apps: [{
        name: 'blog-wiki-activitypub',
        script: 'index.js',
        
        instances: 1,
        exec_mode: 'fork',
        
        env: {
            NODE_ENV: 'development',
            PORT: 3000
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        

        watch: false,
        ignore_watch: [
            'node_modules',
            'logs',
            'activitypub-data', 
            '*.log',
            '*.pem',          
            '.git'
        ],
        
        autorestart: true,
        max_memory_restart: '1G',
        restart_delay: 5000,
        max_restarts: 10,
        min_uptime: '10s',
        
        log_file: './logs/combined.log',
        out_file: './logs/out.log',
        error_file: './logs/err.log',
        time: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        
        kill_timeout: 5000,
        listen_timeout: 8000,
        
        node_args: [
            '--max-old-space-size=1024'
        ]
    }]
};
