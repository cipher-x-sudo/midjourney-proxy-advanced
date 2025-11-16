# Railway Redis Setup - Quick Start

## Step-by-Step Guide (5 minutes)

### 1. Add Redis Service

1. Open your Railway project: https://railway.app
2. Click the **"+ New"** button (top right)
3. Select **"Database"**
4. Choose **"Add Redis"**
5. Wait ~30 seconds for Railway to provision Redis ✅

### 2. Configure Your App

**Option A: Railway Auto-Inject (Easiest - Most Common)**

If both services are in the same Railway project:

1. Go to your **main app service** (the MidJourney Proxy service)
2. Click **"Variables"** tab
3. Click **"+ New Variable"**
4. Add:
   - **Key**: `MJ_TASK_STORE_TYPE`
   - **Value**: `redis`
5. Click **"Add"**

**That's it!** Railway automatically injects `REDIS_URL` when services are in the same project.

**Option B: Manual Setup (If auto-inject doesn't work)**

1. Click on your **Redis service**
2. Go to **"Variables"** tab
3. Find `REDIS_URL` variable
4. Copy the value (looks like: `redis://default:xxxxx@redis.railway.internal:6379`)
5. Go back to your **app service** → **"Variables"** tab
6. Add/Update:
   - **Key**: `MJ_TASK_STORE_TYPE`
   - **Value**: `redis`
   - **Key**: `REDIS_URL`
   - **Value**: `<paste the Redis URL from step 4>`

### 3. Redeploy

Railway should automatically redeploy when you add environment variables. 

If not:
1. Go to your app service
2. Click **"Deployments"** tab
3. Click **"Redeploy"**

### 4. Verify It's Working

After redeploy, check your app logs:

1. Go to your app service → **"Deployments"** tab
2. Click on the latest deployment
3. Check the logs

**✅ Success**: You should see:
```
[task-store-redis] Saving task ... to Redis
```

**❌ Still using memory**: You'll see:
```
[task-store-inmemory] Updated task ...
```

If you see `[task-store-inmemory]`, check:
- `MJ_TASK_STORE_TYPE` is set to `redis` (not `in_memory`)
- Redeploy the app
- Check `REDIS_URL` is set (if Option B)

### 5. Test Task Persistence

1. **Submit a test task**:
   ```bash
   curl -X POST https://your-railway-url.up.railway.app/mj/submit/imagine \
     -H "Content-Type: application/json" \
     -H "mj-api-secret: your-secret" \
     -d '{"prompt": "test image"}'
   ```

2. **Note the task ID** from response (e.g., `1763252292246080`)

3. **Wait for task to complete**

4. **Trigger a redeploy** (to simulate server restart)

5. **Query the task again**:
   ```bash
   curl https://your-railway-url.up.railway.app/mj/task/1763252292246080 \
     -H "mj-api-secret: your-secret"
   ```

6. **✅ If using Redis**: Task should still be found!
7. **❌ If using memory**: Task will be gone after redeploy

## Troubleshooting

### "Still seeing [task-store-inmemory] in logs"

1. Double-check `MJ_TASK_STORE_TYPE=redis` in Variables tab
2. Ensure the app was redeployed after adding the variable
3. Check for typos: should be `redis` not `in_memory`

### "REDIS_URL not found"

1. Make sure Redis service is created and running
2. Check both services are in the same Railway project
3. Manually add `REDIS_URL` variable (Option B above)

### "Connection refused" or Redis errors

1. Check Redis service is running (should show green status)
2. Verify `REDIS_URL` format matches Railway's generated format
3. Ensure both services are in the same project (for internal network)

## Summary

✅ Add Redis service in Railway  
✅ Set `MJ_TASK_STORE_TYPE=redis` in app variables  
✅ Redeploy app  
✅ Check logs for `[task-store-redis]`  
✅ Tasks now persist across redeploys! 🎉

## Environment Variables Summary

In your **app service** Variables tab, you need:

```
MJ_TASK_STORE_TYPE=redis
REDIS_URL=<auto-injected by Railway, or manual>
```

That's all! 🚀


