FROM mcr.microsoft.com/playwright:v1.57.0-noble

# Install unzip (required by Bun installer) and Bun
RUN apt-get update && apt-get install -y unzip curl && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.11"
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy entire monorepo
COPY . .

# Install all workspace deps
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Install Playwright deps (chromium is pre-installed in the image)
RUN npx playwright install-deps chromium 2>/dev/null || true

# Default: run the realtime E2E test
CMD ["bash", "packages/app/e2e/run-realtime.sh"]
