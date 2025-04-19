# Docker Guide for PUBG Tracker Bot

This guide provides detailed instructions on how to set up and run the PUBG Tracker Bot using Docker.

## Docker Implementation Details

The project uses a modern Docker setup with the following features:

### Multi-Stage Builds
- The Dockerfile uses multi-stage builds to create a smaller, more efficient production image
- The first stage builds the TypeScript code
- The second stage only includes the compiled code and production dependencies

### Security Enhancements
- The application runs as a non-root user (nodejs)
- Uses dumb-init as an init system to properly handle signals
- Sets NODE_ENV=production by default

### Monitoring and Reliability
- Includes health checks to verify the Node.js process is running
- Configures log rotation to manage disk space
- Uses restart policies to ensure the application stays running

## Prerequisites

Before you begin, ensure you have the following installed:
- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Environment Variables

The application requires several environment variables to function properly. These can be provided in two ways:

### Option 1: Using a .env file

1. Create a `.env` file in the root directory of the project with the following variables:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CHANNEL_ID=your_discord_channel_id
PUBG_API_KEY=your_pubg_api_key
PUBG_API_URL=https://api.pubg.com/shards/
DEFAULT_SHARD=steam
MONGODB_URI=your_mongodb_connection_string
```

2. Docker Compose will automatically use these variables when you run the container.

### Option 2: Setting environment variables directly

You can also set the environment variables directly in the `docker-compose.yml` file:

```yaml
services:
  bot:
    build: .
    environment:
      - DISCORD_TOKEN=your_discord_bot_token
      - DISCORD_CLIENT_ID=your_discord_client_id
      - DISCORD_CHANNEL_ID=your_discord_channel_id
      - PUBG_API_KEY=your_pubg_api_key
      - PUBG_API_URL=https://api.pubg.com/shards/
      - DEFAULT_SHARD=steam
      - MONGODB_URI=your_mongodb_connection_string
    restart: unless-stopped
```

## Building and Running the Container

### Using Docker Compose (Recommended)

1. Build and start the container:

```bash
docker-compose up --build
```

This command builds the Docker image and starts the container. The `--build` flag ensures that the image is rebuilt if there are any changes.

2. To run the container in the background (detached mode):

```bash
docker-compose up --build -d
```

3. To stop the container:

```bash
docker-compose down
```

### Using Docker Directly

If you prefer to use Docker commands directly:

1. Build the Docker image:

```bash
docker build -t pubg-tracker-bot .
```

2. Run the container:

```bash
docker run -d --name pubg-tracker-bot \
  -e DISCORD_TOKEN=your_discord_bot_token \
  -e DISCORD_CLIENT_ID=your_discord_client_id \
  -e DISCORD_CHANNEL_ID=your_discord_channel_id \
  -e PUBG_API_KEY=your_pubg_api_key \
  -e PUBG_API_URL=https://api.pubg.com/shards/ \
  -e DEFAULT_SHARD=steam \
  -e MONGODB_URI=your_mongodb_connection_string \
  --restart unless-stopped \
  pubg-tracker-bot
```

3. To stop the container:

```bash
docker stop pubg-tracker-bot
docker rm pubg-tracker-bot
```

## Viewing Logs

To view the logs of the running container:

```bash
# Using Docker Compose
docker-compose logs

# Using Docker directly
docker logs pubg-tracker-bot
```

To follow the logs in real-time:

```bash
# Using Docker Compose
docker-compose logs -f

# Using Docker directly
docker logs -f pubg-tracker-bot
```

## Troubleshooting

### Container exits immediately

If the container exits immediately after starting, check the logs for error messages:

```bash
docker-compose logs
```

Common issues include:
- Missing or incorrect environment variables
- Connection issues with Discord or MongoDB
- Permission problems

### MongoDB connection issues

If you're having trouble connecting to MongoDB, ensure that:
- The MongoDB URI is correct
- The MongoDB server is accessible from the Docker container
- The database user has the necessary permissions

## Updating the Bot

To update the bot after making changes to the code:

1. Stop the container:

```bash
docker-compose down
```

2. Rebuild and start the container:

```bash
docker-compose up --build -d
```

## Production Deployment

For production deployments, consider:
- Using Docker volumes to persist data
- Setting up monitoring and alerting
- Implementing proper logging
- Using a container orchestration system like Kubernetes for larger deployments

## Security Considerations

- Never commit your `.env` file or any files containing sensitive information to version control
- Use Docker secrets or a secure environment variable management system for production deployments
- Regularly update the Docker image and dependencies to patch security vulnerabilities
