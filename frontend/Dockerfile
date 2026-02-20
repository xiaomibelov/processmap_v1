FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

EXPOSE 5177

CMD ["sh", "-c", "if [ ! -f node_modules/tailwindcss/package.json ]; then npm ci --include=dev; fi && npm run dev -- --host 0.0.0.0 --port 5177"]
