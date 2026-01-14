FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace files from root
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/realtime ./apps/realtime

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package
RUN cd packages/shared && pnpm build

# Generate Prisma client from realtime's own schema
RUN cd apps/realtime && npx prisma generate

# Build realtime server
RUN cd apps/realtime && pnpm build

WORKDIR /app/apps/realtime

EXPOSE 3001

CMD ["node", "dist/index.js"]
