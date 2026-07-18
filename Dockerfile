FROM python:3.12-slim AS history-builder

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY history ./history
COPY filtered_weather_data.csv ./
RUN python -m history.build_records --generated-at 2026-07-11T00:00:00Z

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js ./
COPY controllers ./controllers
COPY routes ./routes
COPY snapshots ./snapshots
COPY utils ./utils
COPY views ./views
COPY public ./public
COPY styles ./styles
COPY data ./data
COPY weather_dataFull_7.json resorts_for_forecast.json freeride_terrain.json ./
COPY --from=history-builder /app/history_season_records.json ./

EXPOSE 3002
CMD ["node", "app.js"]
