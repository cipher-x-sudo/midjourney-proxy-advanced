<div align="center">

<h1 align="center">midjourney-proxy</h1>

English | [中文](./README.md)

Proxy the Discord channel for MidJourney to enable API-based calls for AI drawing

[![GitHub release](https://img.shields.io/static/v1?label=release&message=v2.6.3&color=blue)](https://www.github.com/novicezk/midjourney-proxy)
[![License](https://img.shields.io/badge/license-Apache%202-4EB1BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)

</div>

## Main Functions

- [x] Supports Imagine instructions and related actions
- [x] Supports adding image base64 as a placeholder when using the Imagine command
- [x] Supports Blend (image blending) and Describe (image to text) commands
- [x] Supports real-time progress tracking of tasks
- [x] Supports translation of Chinese prompts, requires configuration of Baidu Translate or GPT
- [x] Prompt sensitive word pre-detection, supports override adjustment
- [x] User-token connects to WSS (WebSocket Secure), allowing access to error messages and full functionality
- [x] Supports multi-account configuration, with each account able to set up corresponding task queues
- [x] Supports Shorten (prompt analysis) command
- [x] Supports retrieving the seed value of images

**🚀 For more features, please refer to [midjourney-proxy-plus](https://github.com/litter-coder/midjourney-proxy-plus)**
> - [x] Supports focus shifting: Pan ⬅️ ➡️ ⬆️ ⬇️
> - [x] Supports image zooming: Zoom 🔍
> - [x] Supports local redrawing: Vary (Region) 🖌
> - [x] Supports nearly all associated button actions and the 🎛️ Remix mode
> - [x] Account pool persistence, dynamic maintenance
> - [x] Supports retrieving account /info and /settings information
> - [x] Account settings configuration
> - [x] Supports Niji bot robot
> - [x] Supports InsightFace face replacement robot
> - [x] Embedded management dashboard page
> - [x] Backend supports dynamic configuration
> - [x] Resolves the issue of frequent token disconnections
> - [x] Supports automatic pop-up verification
> - [x] Supports automatic appeal for prohibited word 'Action needed to continue'
> - [x] Supports the latest MidJourney V7 Alpha version
> - [x] Supports video generation related interfaces

## Prerequisites for use

1. Register and subscribe to MidJourney, create `your own server and channel`, refer
   to https://docs.midjourney.com/docs/quick-start
2. Obtain user Token, server ID, channel ID: [Method of acquisition](./docs/discord-params.md)

## Quick Start

### Using Docker (Recommended)

```bash
# Build the image
docker build -t midjourney-proxy .

# Run with docker-compose (includes Redis)
docker-compose up -d

# Or run directly
docker run -p 8080:8080 \
  -e MJ_DISCORD_GUILD_ID=your_guild_id \
  -e MJ_DISCORD_CHANNEL_ID=your_channel_id \
  -e MJ_DISCORD_USER_TOKEN=your_token \
  midjourney-proxy
```

### Using Node.js directly

```bash
# Install dependencies
npm install

# Configure your Discord credentials in src/config/default.yaml
# Or use environment variables:
# MJ_DISCORD_GUILD_ID, MJ_DISCORD_CHANNEL_ID, MJ_DISCORD_USER_TOKEN

# Build and start
npm run build
npm start
```

### Cloud Platforms

1. `Railway`: Based on the Railway platform, no need for your own server: [Deployment method](./docs/railway-start.md)
2. `Zeabur`: Based on the Zeabur platform, no need for your own server: [Deployment method](./docs/zeabur-start.md)

## Local development

- Requires Node.js 18+ and npm 9+
- Install dependencies: `npm install`
- Change configuration items: Edit `src/config/default.yaml` or use environment variables
- Development mode: `npm run dev` (runs with hot reload)
- Build project: `npm run build`
- Start production server: `npm start`
- Docker build: `docker build -t midjourney-proxy .`

## Configuration items

Configuration can be done via `src/config/default.yaml` or environment variables:

### Key Configuration Options

- **mj.discord.guildId**: Discord server (guild) ID
- **mj.discord.channelId**: Discord channel ID
- **mj.discord.userToken**: Discord user token
- **mj.accounts**: Account pool configuration (array of Discord accounts)
- **mj.taskStore.type**: Task storage method (`in_memory` or `redis`), default is `in_memory`
- **mj.taskStore.timeout**: Task storage expiration time (e.g., `30d`), default is 30 days
- **mj.apiSecret**: API key for authentication (optional). If set, include header `mj-api-secret` in API requests
- **mj.translateWay**: Translation method for Chinese prompts (`NULL`, `BAIDU`, or `GPT`), default is `NULL`
- **mj.server.port**: Server port (default: 8080)
- **mj.server.contextPath**: API context path (default: `/mj`)

### Environment Variables

You can override configuration using environment variables:
- `MJ_DISCORD_GUILD_ID`: Discord guild ID
- `MJ_DISCORD_CHANNEL_ID`: Discord channel ID
- `MJ_DISCORD_USER_TOKEN`: Discord user token
- `MJ_API_SECRET`: API secret key
- `MJ_TASK_STORE_TYPE`: Task store type (`in_memory` or `redis`)
- `MJ_TRANSLATE_WAY`: Translation method (`NULL`, `BAIDU`, `GPT`)
- `PORT`: Server port
- `REDIS_URL`: Redis connection URL (if using Redis)

For more configuration options, see the `src/config/default.yaml` file.

## Related documentation

1. [API Interface Description](./docs/api.md)
2. [Version Update Log](https://github.com/novicezk/midjourney-proxy/wiki/%E6%9B%B4%E6%96%B0%E8%AE%B0%E5%BD%95)

## Precautions

1. Frequent image generation and similar behaviors may trigger warnings on your Midjourney account. Please use with
   caution.
2. For common issues and solutions, see [Wiki / FAQ](https://github.com/novicezk/midjourney-proxy/wiki/FAQ)
3. Interested friends are also welcome to join the discussion group. If the group is full from scanning the code, you
   can add the administrator’s WeChat to be invited into the group. Please remark: mj join group.

 <img src="https://raw.githubusercontent.com/novicezk/midjourney-proxy/main/docs/manager-qrcode.png" width="220" alt="微信二维码"/>

## Application Project

If you have a project that depends on this one and is open source, feel free to contact the author to be added here for
display.

- [wechat-midjourney](https://github.com/novicezk/wechat-midjourney) : A proxy WeChat client that connects to
  MidJourney, intended only as an example application scenario, will no longer be updated.
- [chatgpt-web-midjourney-proxy](https://github.com/Dooy/chatgpt-web-midjourney-proxy) : chatgpt web, midjourney,
  gpts,tts, whisper A complete UI solution
- [chatnio](https://github.com/Deeptrain-Community/chatnio) : The next-generation AI one-stop solution for B/C end, an
  aggregated model platform with exquisite UI and powerful functions
- [new-api](https://github.com/Calcium-Ion/new-api) : An API interface management and distribution system compatible
  with the Midjourney Proxy
- [stable-diffusion-mobileui](https://github.com/yuanyuekeji/stable-diffusion-mobileui) : SDUI, based on this interface
  and SD (System Design), can be packaged with one click to generate H5 and mini-programs.
- [MidJourney-Web](https://github.com/ConnectAI-E/MidJourney-Web) : 🍎 Supercharged Experience For MidJourney On Web UI
- [midjourney-captcha-bot](https://github.com/ye4241/midjourney-captcha-bot) : Bypass Midjourney captcha

## Open API

Provides unofficial MJ/SD open API, add administrator WeChat for inquiries, please remark: api

## Others

If you find this project helpful, please consider giving it a star.

[![Star History Chart](https://api.star-history.com/svg?repos=novicezk/midjourney-proxy&type=Date)](https://star-history.com/#novicezk/midjourney-proxy&Date)
