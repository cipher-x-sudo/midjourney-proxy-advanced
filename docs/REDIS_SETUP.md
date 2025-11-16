# Redis Setup and Configuration Guide

This guide will help you set up Redis for persistent task storage in your MidJourney Proxy application.

## Why Use Redis?

- **Persistent Storage**: Tasks survive server restarts
- **Scalability**: Share tasks across multiple server instances
- **Reliability**: Data is stored on disk (with Redis persistence enabled)
- **Production Ready**: Better for production deployments

## Option 1: Local Development Setup

### Using Docker (Recommended)

1. **Install Docker** (if not already installed)
   - Download from: https://www.docker.com/products/docker-desktop

2. **Run Redis using Docker**:
   ```bash
   docker run -d \
     --name midjourney-redis \
     -p 6379:6379 \
     -v redis-data:/data \
     redis:7-alpine \
     redis-server --appendonly yes
   ```

3. **Verify Redis is running**:
   ```bash
   docker ps | grep redis
   ```

4. **Test Redis connection**:
   ```bash
   docker exec -it midjourney-redis redis-cli ping
   # Should return: PONG
   ```

### Using Docker Compose (Already Configured)

Your `docker-compose.yml` already includes Redis! Just run:

```bash
docker-compose up -d
```

This will start both the app and Redis containers.

### Manual Installation (Linux/Mac)

1. **Install Redis**:
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install redis-server

   # macOS
   brew install redis
   ```

2. **Start Redis**:
   ```bash
   # Ubuntu/Debian
   sudo systemctl start redis-server
   sudo systemctl enable redis-server

   # macOS
   redis-server
   ```

3. **Verify**:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

## Option 2: Railway Setup (Cloud Hosting)

Since you're using Railway, here's how to add Redis:

### Step 1: Add Redis Service to Railway

1. Go to your Railway project dashboard
2. Click **"+ New"** button
3. Select **"Database"** → **"Add Redis"**
4. Railway will automatically provision a Redis instance

### Step 2: Get Redis Connection URL

1. Click on the Redis service you just created
2. Go to the **"Variables"** tab
3. Find the `REDIS_URL` variable (Railway auto-generates this)
4. Copy the `REDIS_URL` value (e.g., `redis://default:password@redis.railway.internal:6379`)

### Step 3: Configure Your App Service

1. Go back to your main app service in Railway
2. Navigate to **"Variables"** tab
3. Add/Update these environment variables:
   ```
   MJ_TASK_STORE_TYPE=redis
   REDIS_URL=<the Redis URL from Step 2>
   ```

**Note**: If your Redis and App are in the same Railway project, Railway should automatically inject the `REDIS_URL` variable. Just set `MJ_TASK_STORE_TYPE=redis`.

## Option 3: External Redis Services (Alternative)

### Upstash Redis (Recommended for Serverless)

1. Sign up at https://upstash.com
2. Create a new Redis database
3. Copy the `REDIS_URL` from the dashboard
4. Set environment variables:
   ```
   MJ_TASK_STORE_TYPE=redis
   REDIS_URL=<your-upstash-redis-url>
   ```

### Redis Cloud

1. Sign up at https://redis.com/cloud
2. Create a free database
3. Copy the connection URL
4. Set environment variables:
   ```
   MJ_TASK_STORE_TYPE=redis
   REDIS_URL=<your-redis-cloud-url>
   ```

## Configuration

### Method 1: Environment Variables (Recommended)

Set these environment variables:

```bash
# Required
MJ_TASK_STORE_TYPE=redis

# Required (if not auto-detected by Railway)
REDIS_URL=redis://localhost:6379

# Optional: Custom timeout (default: 30d)
MJ_TASK_STORE_TIMEOUT=30d
```

### Method 2: Update default.yaml

Edit `src/config/default.yaml`:

```yaml
mj:
  taskStore:
    type: redis  # Change from 'in_memory' to 'redis'
    timeout: 30d
```

**Note**: Environment variables override YAML config, so prefer environment variables for production.

### Redis URL Format

```
# No password (local)
redis://localhost:6379

# With password
redis://:password@localhost:6379

# With username and password
redis://username:password@host:6379

# Railway/internal
redis://default:password@redis.railway.internal:6379

# Upstash
redis://default:token@host:port
```

## Verification

### 1. Check Application Logs

After starting your application with Redis configured, look for:

```
✅ Good: [task-store-redis] Saving task ... to Redis
❌ Bad: [task-store-inmemory] ... (still using in-memory)
```

### 2. Test Task Persistence

1. **Submit a task**:
   ```bash
   curl -X POST http://localhost:8080/mj/submit/imagine \
     -H "Content-Type: application/json" \
     -H "mj-api-secret: your-secret" \
     -d '{"prompt": "test image"}'
   ```

2. **Note the task ID** from the response

3. **Restart your application**

4. **Query the same task**:
   ```bash
   curl http://localhost:8080/mj/task/<task-id> \
     -H "mj-api-secret: your-secret"
   ```

5. **If using Redis**: Task should still be found ✅
6. **If using in-memory**: Task will be gone ❌

### 3. Direct Redis Check (Optional)

```bash
# Connect to Redis
redis-cli
# Or if using Docker:
docker exec -it midjourney-redis redis-cli

# List all task keys
KEYS mj-task-store::*

# Get a specific task (replace with actual task ID)
GET mj-task-store::1763252292246080

# Exit
exit
```

## Troubleshooting

### Error: "ECONNREFUSED" or "Connection refused"

**Problem**: Application can't connect to Redis

**Solutions**:
1. Verify Redis is running:
   ```bash
   # Docker
   docker ps | grep redis
   
   # Linux
   sudo systemctl status redis-server
   ```

2. Check `REDIS_URL` is correct:
   ```bash
   echo $REDIS_URL
   ```

3. Test connection manually:
   ```bash
   redis-cli -u $REDIS_URL ping
   ```

### Error: "NOAUTH Authentication required"

**Problem**: Redis requires a password

**Solutions**:
1. Update `REDIS_URL` to include password:
   ```
   redis://:your-password@host:6379
   ```

2. Or set Redis password:
   ```bash
   redis-cli CONFIG SET requirepass your-password
   ```

### Tasks Still Not Persisting

1. **Check environment variable is set**:
   ```bash
   echo $MJ_TASK_STORE_TYPE
   # Should output: redis
   ```

2. **Check logs on startup**:
   Look for `[task-store-redis]` in logs, not `[task-store-inmemory]`

3. **Verify Redis URL**:
   ```bash
   echo $REDIS_URL
   ```

4. **Test Redis connection**:
   ```bash
   redis-cli -u $REDIS_URL ping
   ```

### Railway-Specific Issues

1. **Redis URL not auto-injected**:
   - Ensure both services are in the same Railway project
   - Manually add `REDIS_URL` variable in app service

2. **Using Railway Internal Network**:
   - Use `redis.railway.internal` hostname if both services are in same project
   - External services should use public Redis URL

## Production Recommendations

1. **Enable Redis Persistence**:
   - Docker: Already enabled with `--appendonly yes`
   - Railway: Automatic
   - Manual: Edit `redis.conf` → `appendonly yes`

2. **Set Appropriate Timeout**:
   ```bash
   MJ_TASK_STORE_TIMEOUT=30d  # 30 days
   ```

3. **Monitor Redis Memory**:
   - Check memory usage regularly
   - Set max memory policy if needed

4. **Backup Strategy**:
   - Regular Redis backups
   - Or use managed Redis with automatic backups

## Summary

- **Local Dev**: Use Docker or Docker Compose (easiest)
- **Railway**: Add Redis service, set `MJ_TASK_STORE_TYPE=redis`
- **Verify**: Check logs for `[task-store-redis]` messages
- **Test**: Submit task → Restart app → Query task → Should still exist ✅

Tasks will now persist across restarts! 🎉


