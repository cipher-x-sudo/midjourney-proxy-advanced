import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import * as path from 'path';
import { config } from './config';
import { SubmitController } from './controllers/submitController';
import { TaskController } from './controllers/taskController';
import { AccountController } from './controllers/accountController';
import { authMiddleware } from './middleware/authMiddleware';
import { TaskService, TaskServiceImpl } from './services/taskService';
import { TaskStoreService } from './services/store/taskStoreService';
import { InMemoryTaskStoreService } from './services/store/inMemoryTaskStoreService';
import { RedisTaskStoreService } from './services/store/redisTaskStoreService';
import { NotifyService, NotifyServiceImpl } from './services/notifyService';
import { DiscordLoadBalancer } from './loadbalancer/discordLoadBalancer';
import { RoundRobinRule } from './loadbalancer/rules/roundRobinRule';
import { BestWaitIdleRule } from './loadbalancer/rules/bestWaitIdleRule';
import { TranslateService } from './services/translate/translateService';
import { NoTranslateService } from './services/translate/noTranslateService';
import { BaiduTranslateService } from './services/translate/baiduTranslateService';
import { GPTTranslateService } from './services/translate/gptTranslateService';
import { TranslateWay } from './enums/TranslateWay';
import { DiscordHelper } from './support/discordHelper';
import { DiscordAccountHelper } from './support/discordAccountHelper';
import { TaskTimeoutSchedule } from './support/taskTimeoutSchedule';
import { DiscordAccount } from './models/DiscordAccount';
import { getTaskStoreTimeoutMs } from './config';
import { waitForLock } from './utils/asyncLock';
import { ReturnCode } from './constants';

/**
 * Create Fastify application
 */
export async function createApp(): Promise<FastifyInstance> {
  // Default body limit is 25MB to handle base64-encoded images
  const bodyLimit = config.server.bodyLimit || 25 * 1024 * 1024;
  
  const app = Fastify({
    logger: {
      level: config.logging.level,
    },
    bodyLimit: bodyLimit,
  });

  // Register CORS
  await app.register(fastifyCors, {
    origin: true,
  });

  // API routes with authentication
  const apiPrefix = config.server.contextPath || '/mj';

  // Register static files (only for doc.html and other static assets)
  // Register at root level
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
    decorateReply: false,
  });

  // Also register at context path for compatibility
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: apiPrefix,
    decorateReply: false,
  });

  // Register WebSocket
  await app.register(fastifyWebsocket);

  // Initialize services
  const taskStoreService = await createTaskStoreService();
  const notifyService = new NotifyServiceImpl(config.mj.notifyPoolSize);
  const translateService = createTranslateService();
  const discordHelper = new DiscordHelper();
  const discordAccountHelper = new DiscordAccountHelper(
    discordHelper,
    taskStoreService,
    notifyService
  );

  // Create load balancer
  const rule = config.mj.accountChooseRule === 'RoundRobinRule'
    ? new RoundRobinRule()
    : new BestWaitIdleRule();
  const discordLoadBalancer = new DiscordLoadBalancer(rule);

  // Initialize accounts
  await initializeAccounts(discordLoadBalancer, discordAccountHelper);

  // Create task service
  const taskService = new TaskServiceImpl(taskStoreService, discordLoadBalancer);

  // Create controllers
  const submitController = new SubmitController(taskService, taskStoreService, translateService);
  const taskController = new TaskController(taskStoreService, discordLoadBalancer);
  const accountController = new AccountController(discordLoadBalancer);

  // Start task timeout schedule
  const taskTimeoutSchedule = new TaskTimeoutSchedule(discordLoadBalancer);
  taskTimeoutSchedule.start();

  // Health check endpoint (both at root and context path for compatibility)
  app.get('/health', async (request, reply) => {
    return { status: 'ok' };
  });
  
  app.get(`${apiPrefix}/health`, async (request, reply) => {
    return { status: 'ok' };
  });

  // Submit routes
  app.post(`${apiPrefix}/submit/imagine`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return submitController.imagine(request as any, reply);
  });

  app.post(`${apiPrefix}/submit/change`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return submitController.change(request as any, reply);
  });

  app.post(`${apiPrefix}/submit/simple-change`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return submitController.simpleChange(request as any, reply);
  });

  app.post(`${apiPrefix}/submit/describe`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return submitController.describe(request as any, reply);
  });

  app.post(`${apiPrefix}/submit/shorten`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return submitController.shorten(request as any, reply);
  });

  app.post(`${apiPrefix}/submit/blend`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return submitController.blend(request as any, reply);
  });

  // Generic action + modal endpoints
  app.post(`${apiPrefix}/submit/action`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return submitController.action(request as any, reply);
  });

  app.post(`${apiPrefix}/submit/modal`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return submitController.modal(request as any, reply);
  });

  // New image action routes - removed in favor of generic action/modal

  // Task routes
  app.get(`${apiPrefix}/task/:id/fetch`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return taskController.fetch(request as any, reply);
  });

  app.get(`${apiPrefix}/task/queue`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return taskController.queue(request as any, reply);
  });

  app.get(`${apiPrefix}/task/list`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return taskController.list(request as any, reply);
  });

  app.post(`${apiPrefix}/task/list-by-condition`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return taskController.listByIds(request as any, reply);
  });

  app.get(`${apiPrefix}/task/:id/image-seed`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return taskController.imageSeed(request as any, reply);
  });

  // Account routes
  app.get(`${apiPrefix}/account/:id/fetch`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return accountController.fetch(request as any, reply);
  });

  app.get(`${apiPrefix}/account/list`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return accountController.list(request as any, reply);
  });

  app.get(`${apiPrefix}/account/:id/status`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return accountController.getStatus(request as any, reply);
  });

  app.get(`${apiPrefix}/account/status`, {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return accountController.getAllStatus(request as any, reply);
  });

  // Root redirect to doc.html
  app.get('/', async (request, reply) => {
    return reply.redirect('/doc.html');
  });

  // Also redirect context path root to doc.html
  app.get(apiPrefix, async (request, reply) => {
    return reply.redirect(`${apiPrefix}/doc.html`);
  });

  return app;
}

/**
 * Create task store service
 */
async function createTaskStoreService(): Promise<TaskStoreService> {
  const timeoutMs = getTaskStoreTimeoutMs();
  
  if (config.mj.taskStore.type === 'redis') {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    return new RedisTaskStoreService(timeoutMs, redisUrl);
  } else {
    return new InMemoryTaskStoreService(timeoutMs);
  }
}

/**
 * Create translate service
 */
function createTranslateService(): TranslateService {
  switch (config.mj.translateWay) {
    case TranslateWay.BAIDU:
      return new BaiduTranslateService(config.mj.baiduTranslate);
    case TranslateWay.GPT:
      return new GPTTranslateService(config.mj.openai, config.mj.proxy);
    default:
      return new NoTranslateService();
  }
}

/**
 * Initialize Discord accounts
 */
async function initializeAccounts(
  discordLoadBalancer: DiscordLoadBalancer,
  discordAccountHelper: DiscordAccountHelper
): Promise<void> {
  // Set up proxy if configured
  if (config.mj.proxy.host && config.mj.proxy.port) {
    // Proxy configuration would be set in axios/HTTP client
    // For now, we'll skip proxy setup as it's complex in Node.js
  }

  // Get accounts from config
  const configAccounts = [...config.mj.accounts];
  if (config.mj.discord.channelId) {
    configAccounts.push(config.mj.discord);
  }

  const instances = [];

  for (const configAccount of configAccounts) {
    const account = new DiscordAccount();
    account.guildId = configAccount.guildId;
    account.channelId = configAccount.channelId;
    account.userToken = configAccount.userToken;
    account.userAgent = configAccount.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
    account.enable = configAccount.enable !== false;
    account.coreSize = configAccount.coreSize || 3;
    account.queueSize = configAccount.queueSize || 10;
    account.timeoutMinutes = configAccount.timeoutMinutes || 5;
    account.id = configAccount.channelId;

    if (!account.guildId || !account.channelId || !account.userToken) {
      console.error(`Account(${account.getDisplay()}) init fail: guildId, channelId, userToken must not be blank`);
      account.enable = false;
      continue;
    }

    try {
      const instance = discordAccountHelper.createDiscordInstance(account);
      if (!account.enable) {
        continue;
      }

      // Start WebSocket connection
      instance.startWss().catch((error: any) => {
        console.error(`[${account.getDisplay()}] WebSocket start error:`, error);
      });
      
      // Wait for WebSocket connection (with timeout - increased for decompressor initialization)
      try {
        const lock = await waitForLock(`wss:${account.id}`, 30000); // 30 seconds timeout
        const code = lock.getProperty('code') || 0;
        if (code !== ReturnCode.SUCCESS) {
          const description = lock.getProperty('description') || '';
          throw new Error(description || 'WebSocket connection failed');
        }
        console.debug(`[${account.getDisplay()}] WebSocket connection established`);
      } catch (error: any) {
        if (error.message === 'Wait Timeout') {
          throw new Error('WebSocket connection timeout');
        }
        throw new Error(error.message || 'WebSocket connection failed');
      }

      instances.push(instance);
      discordLoadBalancer.addInstance(instance);
    } catch (error: any) {
      console.error(`Account(${account.getDisplay()}) init fail, disabled: ${error.message}`);
      account.enable = false;
    }
  }

  const enableInstanceIds = instances
    .filter(instance => instance.isAlive())
    .map(instance => instance.getInstanceId());
  console.info(`Current available account count [${enableInstanceIds.length}] - ${enableInstanceIds.join(', ')}`);
}

