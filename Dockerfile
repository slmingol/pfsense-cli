FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Make CLI executable
RUN chmod +x /app/cli.js

# Set the entrypoint to the CLI
ENTRYPOINT ["node", "/app/cli.js"]
