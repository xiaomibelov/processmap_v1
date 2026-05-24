FROM python:3.12-slim

# Install system dependencies + Node.js 18
RUN apt-get update && apt-get install -y \
    bash \
    git \
    openssh-client \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install kimi-cli (same version as on server)
RUN pip install --no-cache-dir kimi-cli==1.44.0

# Create deploy user to match server environment
RUN useradd -m -s /bin/bash deploy && \
    mkdir -p /home/deploy/.local/bin && \
    chown -R deploy:deploy /home/deploy

# Ensure kimi is in PATH for deploy user
RUN ln -sf $(which kimi) /home/deploy/.local/bin/kimi

USER deploy
WORKDIR /opt/processmap-test

# Copy agent launcher
COPY --chown=deploy:deploy processmap-agent-pane.sh /usr/local/bin/processmap-agent-pane.sh
RUN chmod +x /usr/local/bin/processmap-agent-pane.sh

# Copy entrypoint
COPY --chown=deploy:deploy docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
