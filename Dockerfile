FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    curl \
    ca-certificates \
    libc6 \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
