import { Message } from '../result/Message';
import { BlendDimensions, getBlendDimensionsValue } from '../enums/BlendDimensions';
import { DataUrl } from '../utils/convertUtils';
import { DiscordAccount } from '../models/DiscordAccount';
import { DiscordHelper } from '../support/discordHelper';
import axios, { AxiosInstance } from 'axios';
import { ReturnCode } from '../constants';

/**
 * Discord service interface
 */
export interface DiscordService {
  imagine(prompt: string, nonce: string): Promise<Message<void>>;
  upscale(messageId: string, index: number, messageHash: string, messageFlags: number, nonce: string): Promise<Message<void>>;
  variation(messageId: string, index: number, messageHash: string, messageFlags: number, nonce: string): Promise<Message<void>>;
  reroll(messageId: string, messageHash: string, messageFlags: number, nonce: string): Promise<Message<void>>;
  describe(finalFileName: string, nonce: string): Promise<Message<void>>;
  shorten(prompt: string, nonce: string): Promise<Message<void>>;
  blend(finalFileNames: string[], dimensions: BlendDimensions, nonce: string): Promise<Message<void>>;
  upload(fileName: string, dataUrl: DataUrl): Promise<Message<string>>;
  sendImageMessage(content: string, finalFileName: string): Promise<Message<string>>;
  reactWithEmoji(messageId: string, channelId: string, emoji: string): Promise<Message<void>>;
  removeOwnReaction(messageId: string, channelId: string, emoji: string): Promise<Message<void>>;
  customComponent(messageId: string, messageFlags: number, customId: string, nonce: string): Promise<Message<void>>;
}

/**
 * Discord service implementation
 */
export class DiscordServiceImpl implements DiscordService {
  private static readonly DEFAULT_SESSION_ID = 'f1a313a09ce079ce252459dc70231f30';
  private account: DiscordAccount;
  private paramsMap: Map<string, any>;
  private httpClient: AxiosInstance;
  private discordHelper: DiscordHelper;
  private discordInteractionUrl: string;
  private discordAttachmentUrl: string;
  private discordMessageUrl: string;
  private sessionId: string | null = null;
  private getSessionIdCallback: (() => string | null) | null = null;

  constructor(account: DiscordAccount, paramsMap: Map<string, any>, discordHelper: DiscordHelper) {
    this.account = account;
    this.paramsMap = paramsMap;
    this.discordHelper = discordHelper;
    
    const discordServer = this.discordHelper.getServer();
    this.discordInteractionUrl = `${discordServer}/api/v9/interactions`;
    this.discordAttachmentUrl = `${discordServer}/api/v9/channels/${account.channelId}/attachments`;
    this.discordMessageUrl = `${discordServer}/api/v9/channels/${account.channelId}/messages`;

    // Create HTTP client with Discord headers
    this.httpClient = axios.create({
      headers: {
        'Authorization': account.userToken,
        'Content-Type': 'application/json',
        'User-Agent': account.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Set session ID getter callback
   */
  setSessionIdGetter(callback: () => string | null): void {
    this.getSessionIdCallback = callback;
  }

  /**
   * Set session ID directly
   */
  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  /**
   * Get current session ID
   */
  private getSessionId(): string {
    // Try callback first (dynamic from gateway)
    if (this.getSessionIdCallback) {
      const callbackSessionId = this.getSessionIdCallback();
      if (callbackSessionId) {
        console.debug(`[discord-service-${this.account.getDisplay()}] Using session ID from gateway: ${callbackSessionId}`);
        return callbackSessionId;
      }
    }
    // Try stored session ID
    if (this.sessionId) {
      console.debug(`[discord-service-${this.account.getDisplay()}] Using stored session ID: ${this.sessionId}`);
      return this.sessionId;
    }
    // Fall back to default (for backward compatibility, though this should not happen in normal operation)
    console.warn(`[discord-service-${this.account.getDisplay()}] WARNING: No session ID available, using default. This should not happen in normal operation.`);
    return DiscordServiceImpl.DEFAULT_SESSION_ID;
  }

  /**
   * Replace interaction parameters
   */
  private replaceInteractionParams(template: string, nonce: string): string {
    const sessionId = this.getSessionId();
    return template
      .replace('$guild_id', this.account.guildId || '')
      .replace('$channel_id', this.account.channelId || '')
      .replace('$session_id', sessionId)
      .replace('$nonce', nonce);
  }

  /**
   * Post JSON and check status
   */
  private async postJsonAndCheckStatus(json: string): Promise<Message<void>> {
    try {
      const payload = JSON.parse(json);
      const sessionId = payload.session_id;
      console.debug(`[discord-service-${this.account.getDisplay()}] Sending interaction to Discord - sessionId:${sessionId}, type:${payload.type}, guildId:${payload.guild_id}, channelId:${payload.channel_id}`);
      
      const response = await this.httpClient.post(this.discordInteractionUrl, payload);
      if (response.status === 200 || response.status === 204) {
        console.debug(`[discord-service-${this.account.getDisplay()}] Interaction sent successfully - status:${response.status}`);
        return Message.success<void>();
      }
      console.warn(`[discord-service-${this.account.getDisplay()}] Interaction failed - HTTP ${response.status}`);
      return Message.failureWithDescription<void>(`HTTP ${response.status}`);
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        const errorData = error.response.data;
        console.error(`[discord-service-${this.account.getDisplay()}] Discord API error - HTTP ${status}: ${statusText}`, errorData);
        return Message.failureWithDescription<void>(`HTTP ${status}: ${statusText}`);
      }
      console.error(`[discord-service-${this.account.getDisplay()}] Request error:`, error.message);
      return Message.failureWithDescription<void>(error.message);
    }
  }

  async imagine(prompt: string, nonce: string): Promise<Message<void>> {
    const paramsStr = this.replaceInteractionParams(this.paramsMap.get('imagine'), nonce);
    const params = JSON.parse(paramsStr);
    params.data.options[0].value = prompt;
    return this.postJsonAndCheckStatus(JSON.stringify(params));
  }

  async upscale(messageId: string, index: number, messageHash: string, messageFlags: number, nonce: string): Promise<Message<void>> {
    let paramsStr = this.replaceInteractionParams(this.paramsMap.get('upscale'), nonce)
      .replace('$message_id', messageId)
      .replace('$index', String(index))
      .replace('$message_hash', messageHash);
    const params = JSON.parse(paramsStr);
    params.message_flags = messageFlags;
    return this.postJsonAndCheckStatus(JSON.stringify(params));
  }

  async variation(messageId: string, index: number, messageHash: string, messageFlags: number, nonce: string): Promise<Message<void>> {
    let paramsStr = this.replaceInteractionParams(this.paramsMap.get('variation'), nonce)
      .replace('$message_id', messageId)
      .replace('$index', String(index))
      .replace('$message_hash', messageHash);
    const params = JSON.parse(paramsStr);
    params.message_flags = messageFlags;
    return this.postJsonAndCheckStatus(JSON.stringify(params));
  }

  async reroll(messageId: string, messageHash: string, messageFlags: number, nonce: string): Promise<Message<void>> {
    let paramsStr = this.replaceInteractionParams(this.paramsMap.get('reroll'), nonce)
      .replace('$message_id', messageId)
      .replace('$message_hash', messageHash);
    const params = JSON.parse(paramsStr);
    params.message_flags = messageFlags;
    return this.postJsonAndCheckStatus(JSON.stringify(params));
  }

  async describe(finalFileName: string, nonce: string): Promise<Message<void>> {
    const fileName = finalFileName.substring(finalFileName.lastIndexOf('/') + 1);
    const paramsStr = this.replaceInteractionParams(this.paramsMap.get('describe'), nonce)
      .replace('$file_name', fileName)
      .replace('$final_file_name', finalFileName);
    return this.postJsonAndCheckStatus(paramsStr);
  }

  async shorten(prompt: string, nonce: string): Promise<Message<void>> {
    const paramsStr = this.replaceInteractionParams(this.paramsMap.get('shorten'), nonce);
    const params = JSON.parse(paramsStr);
    params.data.options[0].value = prompt;
    return this.postJsonAndCheckStatus(JSON.stringify(params));
  }

  async blend(finalFileNames: string[], dimensions: BlendDimensions, nonce: string): Promise<Message<void>> {
    const paramsStr = this.replaceInteractionParams(this.paramsMap.get('blend'), nonce);
    const params = JSON.parse(paramsStr);
    const options = params.data.options || [];
    const attachments = params.data.attachments || [];
    
    for (let i = 0; i < finalFileNames.length; i++) {
      const finalFileName = finalFileNames[i];
      const fileName = finalFileName.substring(finalFileName.lastIndexOf('/') + 1);
      attachments.push({
        id: String(i),
        filename: fileName,
        uploaded_filename: finalFileName,
      });
      options.push({
        type: 11,
        name: `image${i + 1}`,
        value: i,
      });
    }
    
    // Add dimensions option
    options.push({
      type: 3,
      name: 'dimensions',
      value: `--ar ${getBlendDimensionsValue(dimensions)}`,
    });
    
    params.data.options = options;
    params.data.attachments = attachments;
    return this.postJsonAndCheckStatus(JSON.stringify(params));
  }

  async customComponent(messageId: string, messageFlags: number, customId: string, nonce: string): Promise<Message<void>> {
    try {
      const payload = {
        type: 3,
        nonce: nonce,
        guild_id: this.account.guildId || '',
        channel_id: this.account.channelId || '',
        message_flags: messageFlags || 0,
        message_id: messageId,
        application_id: '936929561302675456',
        session_id: this.getSessionId(),
        data: {
          component_type: 2,
          custom_id: customId,
        },
      };
      return this.postJsonAndCheckStatus(JSON.stringify(payload));
    } catch (error: any) {
      console.error('Failed to send custom component interaction:', error);
      return Message.failureWithDescription<void>(error.message);
    }
  }

  async upload(fileName: string, dataUrl: DataUrl): Promise<Message<string>> {
    try {
      // First, request upload URL
      const fileObj = {
        filename: fileName,
        file_size: dataUrl.data.length,
        id: '0',
      };
      const params = {
        files: [fileObj],
      };

      const response = await this.httpClient.post(this.discordAttachmentUrl, params);
      if (response.status !== 200 || !response.data.attachments || response.data.attachments.length === 0) {
        return Message.failureWithDescription<string>('Failed to get upload URL');
      }

      const attachment = response.data.attachments[0];
      const uploadUrl = attachment.upload_url;
      const uploadFilename = attachment.upload_filename;

      // Replace upload URL if ngDiscord upload server is configured
      const actualUploadUrl = this.discordHelper.getDiscordUploadUrl(uploadUrl);

      // Upload file
      await this.httpClient.put(actualUploadUrl, dataUrl.data, {
        headers: {
          'Content-Type': dataUrl.mimeType,
          'Content-Length': String(dataUrl.data.length),
          'User-Agent': this.account.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      return Message.successWithResult<string>(uploadFilename);
    } catch (error: any) {
      console.error('Failed to upload image to Discord:', error);
      return Message.failureWithDescription<string>(error.message);
    }
  }

  async sendImageMessage(content: string, finalFileName: string): Promise<Message<string>> {
    try {
      const fileName = finalFileName.substring(finalFileName.lastIndexOf('/') + 1);
      const messageTemplate = this.paramsMap.get('message');
      if (!messageTemplate) {
        return Message.failureWithDescription<string>('Message template not found');
      }
      
      const payloadStr = messageTemplate
        .replace('$content', content)
        .replace('$channel_id', this.account.channelId || '')
        .replace('$file_name', fileName)
        .replace('$final_file_name', finalFileName);
      
      const payload = JSON.parse(payloadStr);
      const response = await this.httpClient.post(this.discordMessageUrl, payload);
      
      if (response.status === 200) {
        const attachments = response.data.attachments;
        if (attachments && attachments.length > 0) {
          return Message.successWithResult<string>(attachments[0].url);
        }
      }
      return Message.failureWithDescription<string>('Failed to send image message: image does not exist');
    } catch (error: any) {
      console.error('Failed to send image message to Discord:', error);
      return Message.failureWithDescription<string>(error.message);
    }
  }

  async reactWithEmoji(messageId: string, channelId: string, emoji: string): Promise<Message<void>> {
    try {
      const discordServer = this.discordHelper.getServer();
      // URL encode the emoji for the API endpoint
      const encodedEmoji = encodeURIComponent(emoji);
      const reactionUrl = `${discordServer}/api/v9/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`;
      
      console.debug(`[discord-service-${this.account.getDisplay()}] Reacting with emoji ${emoji} to message ${messageId} in channel ${channelId}`);
      
      const response = await this.httpClient.put(reactionUrl, {});
      
      if (response.status === 204) {
        console.debug(`[discord-service-${this.account.getDisplay()}] Reaction sent successfully`);
        return Message.success<void>();
      }
      console.warn(`[discord-service-${this.account.getDisplay()}] Reaction failed - HTTP ${response.status}`);
      return Message.failureWithDescription<void>(`HTTP ${response.status}`);
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        const errorData = error.response.data;
        console.error(`[discord-service-${this.account.getDisplay()}] Discord reaction API error - HTTP ${status}: ${statusText}`, errorData);
        return Message.failureWithDescription<void>(`HTTP ${status}: ${statusText}`);
      }
      console.error(`[discord-service-${this.account.getDisplay()}] Reaction request error:`, error.message);
      return Message.failureWithDescription<void>(error.message);
    }
  }

  async removeOwnReaction(messageId: string, channelId: string, emoji: string): Promise<Message<void>> {
    try {
      const discordServer = this.discordHelper.getServer();
      const encodedEmoji = encodeURIComponent(emoji);
      const reactionUrl = `${discordServer}/api/v9/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`;
      
      console.debug(`[discord-service-${this.account.getDisplay()}] Removing own reaction ${emoji} from message ${messageId} in channel ${channelId}`);
      
      const response = await this.httpClient.delete(reactionUrl);
      if (response.status === 204) {
        console.debug(`[discord-service-${this.account.getDisplay()}] Reaction removed successfully`);
        return Message.success<void>();
      }
      console.warn(`[discord-service-${this.account.getDisplay()}] Remove reaction failed - HTTP ${response.status}`);
      return Message.failureWithDescription<void>(`HTTP ${response.status}`);
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        const errorData = error.response.data;
        console.error(`[discord-service-${this.account.getDisplay()}] Discord remove reaction API error - HTTP ${status}: ${statusText}`, errorData);
        return Message.failureWithDescription<void>(`HTTP ${status}: ${statusText}`);
      }
      console.error(`[discord-service-${this.account.getDisplay()}] Remove reaction request error:`, error.message);
      return Message.failureWithDescription<void>(error.message);
    }
  }
}

