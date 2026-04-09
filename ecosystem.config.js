module.exports = {
  apps: [
    {
      name: 'discord-selfbot',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Health check
      health_check_grace_period: 30000,
      // Auto restart on failure
      exp_backoff_restart_delay: 100,
      // Monitoring
      monitoring: true,
      // Cluster mode settings
      wait_ready: true,
      // Advanced settings
      instance_var: 'INSTANCE_ID',
      // Cron restart (optional)
      cron_restart: '0 4 * * *', // Restart at 4 AM daily
      // Source map support
      source_map_support: true
    },
    {
      name: 'discord-selfbot-dashboard',
      script: './dashboard/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        DASHBOARD_PORT: 3000
      },
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 5
    }
  ]
};
