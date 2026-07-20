module.exports = {
  apps: [
    {
      name: 'web-cloner',
      script: 'npm',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // 每天凌晨 2 点执行清理
      cron_restart: '0 2 * * *',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'puppeteer-cleanup',
      script: './scripts/cleanup-puppeteer-profiles.sh',
      instances: 1,
      autorestart: false,
      // 每 6 小时执行一次清理
      cron_restart: '0 */6 * * *'
    }
  ]
};
