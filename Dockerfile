# Use Node.js 20 as the base image
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Environment variables that need to be set
ENV DISCORD_TOKEN=""
ENV DISCORD_CLIENT_ID=""
ENV DISCORD_CHANNEL_ID=""
ENV PUBG_API_KEY=""
ENV PUBG_API_URL="https://api.pubg.com/shards/"
ENV DEFAULT_SHARD="steam"
ENV MONGODB_URI=""

# Start the bot
CMD ["npm", "start"] 