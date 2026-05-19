FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_SUPERSET_URL
ARG VITE_SUPERSET_DASHBOARD_ID
ENV VITE_SUPERSET_URL=$VITE_SUPERSET_URL
ENV VITE_SUPERSET_DASHBOARD_ID=$VITE_SUPERSET_DASHBOARD_ID
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]