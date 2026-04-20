FROM mcr.microsoft.com/playwright:v1.52.0-noble

# Install unzip (required by Bun installer) and Bun 1.3.11
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.11"
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy entire monorepo (simplest for workspace resolution)
COPY . .

# Install all workspace deps
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Default: run realtime tests from packages/opencode
WORKDIR /app/packages/opencode

# Install @playwright/test locally (must match base image browser versions)
RUN bun add -d @playwright/test@1.52.0

# Install Playwright deps (chromium is pre-installed in the image)
RUN npx playwright install-deps chromium 2>/dev/null || true
