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
      script: "node_modules/.bin/tsx",
      args: "src/bot/index.ts",
      cwd: "/root/jabishop",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
