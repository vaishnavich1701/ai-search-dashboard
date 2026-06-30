# AI Search Dashboard

AI Search Dashboard is a self-hosted AI search and answer dashboard. It combines web search with chat models so users can ask questions, review cited sources, upload documents, and manage model-provider connections from the application settings.

This project is based on Vane and includes support for local and hosted model providers such as Ollama, OpenAI-compatible servers, OpenRouter, Groq, Gemini, Anthropic, LM Studio, and others.

## Features

- AI-powered search with cited sources.
- Multiple search modes for speed, balanced answers, or higher-quality research.
- Model-provider setup from the web UI.
- Web search through bundled SearxNG when using the full Docker image.
- Optional connection to your own SearxNG instance.
- Chat history stored locally in the app data directory.
- File uploads for asking questions about documents.
- Widgets for useful lookups such as weather, calculations, and stocks.
- Admin analytics pages protected by an admin token.

## Startup Commands

Docker is the recommended way to run the application.

### Option 1: Docker Compose

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set a strong admin analytics token:

   ```bash
   ADMIN_ANALYTICS_TOKEN=replace-with-a-long-random-secret
   ```

3. Build and start the app:

   ```bash
   docker compose up --build -d
   ```

4. Open the app:

   ```text
   http://localhost:3000
   ```

5. View logs if needed:

   ```bash
   docker compose logs -f vane
   ```

6. Stop the app:

   ```bash
   docker compose down
   ```

The Docker Compose setup persists app data in the named Docker volume `vane-data`.

### Option 2: Docker CLI

Build the local Docker image:

```bash
docker build -t ai-search-dashboard .
```

Run the container:

```bash
docker run -d \
  --name ai-search-dashboard \
  -p 3000:3000 \
  -e ADMIN_ANALYTICS_TOKEN=replace-with-a-long-random-secret \
  -v ai-search-dashboard-data:/home/vane/data \
  ai-search-dashboard
```

Open the app at:

```text
http://localhost:3000
```

View logs:

```bash
docker logs -f ai-search-dashboard
```

Stop and remove the container:

```bash
docker rm -f ai-search-dashboard
```

The Docker CLI setup persists app data in the named Docker volume `ai-search-dashboard-data`.

## Using Your Own SearxNG Instance

The bundled Docker image starts SearxNG inside the container and sets `SEARXNG_API_URL` to `http://localhost:8080` by default.

If you want to use your own SearxNG instance instead, pass `SEARXNG_API_URL` when starting the container:

```bash
docker run -d \
  --name ai-search-dashboard \
  -p 3000:3000 \
  -e ADMIN_ANALYTICS_TOKEN=replace-with-a-long-random-secret \
  -e SEARXNG_API_URL=http://your-searxng-url:8080 \
  -v ai-search-dashboard-data:/home/vane/data \
  ai-search-dashboard
```

Make sure your SearxNG instance has JSON output enabled.

## Local Development Without Docker

Use Docker for deployment when possible. For local development without Docker:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

For a production-style local run without Docker:

```bash
npm run build
npm run start
```

## First-Time Setup

After the app starts, open `http://localhost:3000` and complete setup in the browser.

You can configure:

- AI provider connections and API keys.
- Chat and embedding models.
- Search settings.
- Preferences and personalization.

Do not commit or share real `.env` files, API keys, provider secrets, local databases, or uploaded files unless the recipient is supposed to receive that data.

## Runtime Data

Runtime data is stored in the app data directory. In Docker, that directory is mounted at:

```text
/home/vane/data
```

Depending on usage, runtime data can include:

- App configuration.
- Provider connection settings.
- Chat history.
- Query analytics.
- Uploaded files and extracted document chunks.

When using Docker Compose, the data is stored in the `vane-data` Docker volume. When using the Docker CLI example above, it is stored in the `ai-search-dashboard-data` Docker volume.

## Useful Maintenance Commands

Rebuild and restart with Docker Compose:

```bash
docker compose up --build -d
```

Restart the Docker Compose service:

```bash
docker compose restart vane
```

Remove the Docker Compose container but keep persistent data:

```bash
docker compose down
```

Remove the Docker Compose container and delete the persistent `vane-data` volume:

```bash
docker compose down -v
```

Only run `docker compose down -v` when you intentionally want to delete local runtime data.
