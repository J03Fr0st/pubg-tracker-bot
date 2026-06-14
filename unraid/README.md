# Unraid templates

This folder contains a Docker template XML file for installing PUBG Tracker Bot on Unraid.

## Template

- `pubg-tracker-bot.xml` runs the Discord/PUBG bot.

## Requirements

This template assumes you already have a PostgreSQL database available. The bot will run Prisma migrations on startup using the `DATABASE_URL` you provide.

## Install

1. Copy or publish `pubg-tracker-bot.xml` so Unraid can read it.
   For local testing, place it under:

   ```text
   /boot/config/plugins/dockerMan/templates-user/
   ```

2. Install `pubg-tracker-bot`.
3. Fill in the required Discord, PUBG API, and PostgreSQL values.

## Required bot settings

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CHANNEL_ID`
- `PUBG_API_KEY`
- `DATABASE_URL`

`DATABASE_URL` should point to your existing Postgres instance, for example:

```text
postgresql://user:password@postgres:5432/pubg_tracker
```

If your Postgres container is on a custom Docker network, put this app on the same network or use an address the container can reach.

## Image

The bot template uses:

```text
joevreug/pubg-tracker-bot:latest
```

That image is published by the repository's Docker release workflow.
