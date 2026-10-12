# Stage 1: Build static assets
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Pass build-time environment variables
ARG VITE_API_BASE_URL=""
ARG VITE_GOOGLE_MAPS_API_KEY=""
ARG VITE_GOOGLE_MAP_ID=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}     VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}     VITE_GOOGLE_MAP_ID=${VITE_GOOGLE_MAP_ID}

# Copy frontend source code and build production bundle
COPY . .
RUN npm run build

# Stage 2: Serve with lightweight Nginx web server
FROM nginx:alpine

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled SPA assets from build stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
