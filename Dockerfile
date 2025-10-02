# Use a Node image matching your dev environment
FROM node:22-bullseye-slim

# Install git, bash, curl and CA certificates
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      git \
      bash \
      curl \
      ca-certificates \
      build-essential \
      python3 && \
    rm -rf /var/lib/apt/lists/*

ENV NVM_DIR=/root/.nvm
RUN mkdir -p $NVM_DIR && \
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash

ENV NODE_ENV=production
ENV NVM_DIR=/root/.nvm
ENV PATH=$NVM_DIR/versions/node/v22.19.1/bin:$NVM_DIR/versions/node/v20.22.1/bin:$NVM_DIR/versions/node/v18.17.1/bin:$NVM_DIR/versions/node/v16.20.2/bin:$NVM_DIR/versions/node/v14.21.3/bin:$PATH

# Create app directory
WORKDIR /usr/src/app

# Copy package manifests and install deps
COPY package*.json ./
RUN . $NVM_DIR/nvm.sh && nvm use 22 && npm ci

# Copy source code
COPY . .

# Expose HTTP server port
# ALB with ACM listens on HTTPS 443 and forwards to 8080
EXPOSE 8080

# Default command: start server
CMD ["node", "server.js"]
