module.exports = {
  apps: [
    {
      name: "jabishop-web",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/root/jabishop",
      env: {
        NODE_ENV: "production",
        PORT: "3013",
      },
    },
    {
      name: "jabishop-bot",
      script: "scripts/start-bot.sh",
      interpreter: "none",
      cwd: "/root/jabishop",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
