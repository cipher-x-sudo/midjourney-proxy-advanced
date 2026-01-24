import { Message } from '../result/Message';
import { BlendDimensions, getBlendDimensionsValue } from '../enums/BlendDimensions';
import { DataUrl } from '../utils/convertUtils';
import { DiscordAccount } from '../models/DiscordAccount';
import { DiscordHelper } from '../support/discordHelper';
import axios, { AxiosInstance } from 'axios';
import { ReturnCode } from '../constants';

/**
 * Iframe data extracted from Discord message
 */
export interface IframeData {
  custom_id: string;
  instance_id?: string;
  frame_id?: string;
}

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
  customAction(messageId: string, messageFlags: number, customId: string, nonce: string): Promise<Message<void>>;
  modalSubmit(taskId: string, fields: { prompt?: string; maskBase64?: string }, nonce: string): Promise<Message<void>>;
  edits(messageId: string, customId: string, nonce: string): Promise<Message<void>>;
  submitInpaint(customId: string, maskBase64: string, prompt: string): Promise<Message<void>>;
  fetchMessage(messageId: string): Promise<Message<any>>;
  extractIframeCustomId(message: any): IframeData | null;
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

  async customAction(messageId: string, messageFlags: number, customId: string, nonce: string): Promise<Message<void>> {
    let paramsStr = this.replaceInteractionParams(this.paramsMap.get('custom-action'), nonce)
      .replace('$message_id', messageId)
      .replace('$custom_id', customId);
    const params = JSON.parse(paramsStr);
    params.message_flags = messageFlags;
    return this.postJsonAndCheckStatus(JSON.stringify(params));
  }

  async modalSubmit(taskId: string, fields: { prompt?: string; maskBase64?: string }, nonce: string): Promise<Message<void>> {
    let paramsStr = this.replaceInteractionParams(this.paramsMap.get('modal-submit'), nonce)
      .replace('$task_id', taskId);
    const params = JSON.parse(paramsStr);

    // Fill fields if present
    if (fields && params.data) {
      if (typeof fields.prompt === 'string') {
        params.data.prompt = fields.prompt;
      }
      if (typeof fields.maskBase64 === 'string') {
        params.data.maskBase64 = fields.maskBase64;
      }
    }
    return this.postJsonAndCheckStatus(JSON.stringify(params));
  }

  async edits(messageId: string, customId: string, nonce: string): Promise<Message<void>> {
    // Use edits template (button interaction format)
    const editsTemplate = this.paramsMap.get('edits');
    if (editsTemplate) {
      let paramsStr = this.replaceInteractionParams(editsTemplate, nonce)
        .replace('$message_id', messageId)
        .replace('$custom_id', customId);
      const params = JSON.parse(paramsStr);
      return this.postJsonAndCheckStatus(JSON.stringify(params));
    }

    // Fallback: Use custom action format
    const customActionTemplate = this.paramsMap.get('custom-action');
    if (customActionTemplate) {
      let paramsStr = this.replaceInteractionParams(customActionTemplate, nonce)
        .replace('$message_id', messageId)
        .replace('$custom_id', customId);
      const params = JSON.parse(paramsStr);
      return this.postJsonAndCheckStatus(JSON.stringify(params));
    }

    return Message.failureWithDescription<void>('Edits template not found');
  }

  async submitInpaint(customId: string, maskBase64: string, prompt: string): Promise<Message<void>> {
    try {
      // Strip "MJ::iframe::" prefix from customId if present
      let processedCustomId = customId;
      if (processedCustomId.startsWith('MJ::iframe::')) {
        processedCustomId = processedCustomId.replace('MJ::iframe::', '');
      }

      // Extract raw base64 from data URL if needed
      let maskData = maskBase64;
      if (maskBase64.startsWith('data:')) {
        const base64Match = maskBase64.match(/base64,(.+)$/);
        if (base64Match) {
          maskData = base64Match[1];
        }
      }

      // Call the direct inpaint API endpoint (without .proxy)
      const inpaintUrl = `https://936929561302675456.discordsays.com/inpaint/api/submit-job`;
      
      const payload = {
        username: '0',
        userId: '0',
        customId: processedCustomId,
        mask: maskData,
        prompt: prompt,
        full_prompt: null
      };

      const response = await this.httpClient.post(inpaintUrl, payload, {
        headers: {
          'Authorization': this.account.userToken,
          'Content-Type': 'application/json',
          'User-Agent': this.account.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (response.status === 200 || response.status === 201) {
        console.debug(`[discord-service-${this.account.getDisplay()}] Inpaint job submitted successfully`);
        return Message.success<void>();
      }
      
      console.warn(`[discord-service-${this.account.getDisplay()}] Inpaint submission failed - HTTP ${response.status}`);
      return Message.failureWithDescription<void>(`HTTP ${response.status}`);
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        const errorData = error.response.data;
        console.error(`[discord-service-${this.account.getDisplay()}] Inpaint API error - HTTP ${status}: ${statusText}`, errorData);
        return Message.failureWithDescription<void>(`HTTP ${status}: ${statusText}`);
      }
      console.error(`[discord-service-${this.account.getDisplay()}] Inpaint request error:`, error.message);
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
          // Return image URL for use in imagine commands
          // The URL is what's needed for referencing images in prompts
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

  async fetchMessage(messageId: string): Promise<Message<any>> {
    try {
      const discordServer = this.discordHelper.getServer();
      const messageUrl = `${discordServer}/api/v9/channels/${this.account.channelId}/messages/${messageId}`;
      
      console.debug(`[discord-service-${this.account.getDisplay()}] Fetching message ${messageId} from channel ${this.account.channelId}`);
      
      const response = await this.httpClient.get(messageUrl);
      
      if (response.status === 200) {
        console.debug(`[discord-service-${this.account.getDisplay()}] Message fetched successfully`);
        return Message.successWithResult<any>(response.data);
      }
      
      console.warn(`[discord-service-${this.account.getDisplay()}] Fetch message failed - HTTP ${response.status}`);
      return Message.failureWithDescription<any>(`HTTP ${response.status}`);
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        const errorData = error.response.data;
        console.error(`[discord-service-${this.account.getDisplay()}] Discord fetch message API error - HTTP ${status}: ${statusText}`, errorData);
        return Message.failureWithDescription<any>(`HTTP ${status}: ${statusText}`);
      }
      console.error(`[discord-service-${this.account.getDisplay()}] Fetch message request error:`, error.message);
      return Message.failureWithDescription<any>(error.message);
    }
  }

  /**
   * Extract iframe data (custom_id, instance_id, frame_id) from Discord message
   * Looks for iframe URL pattern: https://936929561302675456.discordsays.com/.proxy/inpaint/index.html?custom_id=MJ::iframe::...
   * @param message Discord message object
   * @returns IframeData object with custom_id (required) and optionally instance_id and frame_id, or null if not found
   */
  extractIframeCustomId(message: any): IframeData | null {
    console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId called`);
    
    if (!message) {
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Message is null/undefined`);
      return null;
    }

    const foundUrls: Array<{ url: string; location: string }> = [];
    const checkedLocations: string[] = [];

    // Check embeds for iframe URL
    if (message.embeds && Array.isArray(message.embeds)) {
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Checking ${message.embeds.length} embed(s)`);
      
      for (let i = 0; i < message.embeds.length; i++) {
        const embed = message.embeds[i];
        
        // Log embed structure
        const embedType = embed.type || 'unknown';
        const embedTitle = embed.title ? `title="${embed.title.substring(0, 50)}${embed.title.length > 50 ? '...' : ''}"` : 'no title';
        const embedDescription = embed.description ? `description length=${embed.description.length}` : 'no description';
        const embedFieldsCount = embed.fields?.length || 0;
        console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Embed[${i}]: type=${embedType}, ${embedTitle}, ${embedDescription}, fields=${embedFieldsCount}`);
        
        // Check embed URL
        if (embed.url) {
          const location = `embed[${i}].url`;
          checkedLocations.push(location);
          foundUrls.push({ url: embed.url, location });
          console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Checking ${location}: ${embed.url.substring(0, 100)}${embed.url.length > 100 ? '...' : ''}`);
          const iframeData = this.extractIframeDataFromUrl(embed.url);
          if (iframeData) {
            console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data in ${location}: custom_id=${iframeData.custom_id.substring(0, 50)}...`);
            return iframeData;
          }
        }
        
        // Check embed fields for URLs
        if (embed.fields && Array.isArray(embed.fields)) {
          console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Checking ${embed.fields.length} field(s) in embed[${i}]`);
          
          for (let j = 0; j < embed.fields.length; j++) {
            const field = embed.fields[j];
            if (field.value && typeof field.value === 'string') {
              const location = `embed[${i}].fields[${j}].value`;
              checkedLocations.push(location);
              
              // Extract URLs from field value
              const urlMatches = field.value.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi);
              if (urlMatches) {
                urlMatches.forEach((url: string) => foundUrls.push({ url, location }));
              }
              
              console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Checking ${location} (length: ${field.value.length}, URLs found: ${urlMatches?.length || 0})`);
              const iframeData = this.extractIframeDataFromUrl(field.value);
              if (iframeData) {
                console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data in ${location}: custom_id=${iframeData.custom_id.substring(0, 50)}...`);
                return iframeData;
              }
            }
          }
        }
      }
    } else {
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - No embeds found or embeds is not an array`);
    }

    // Check components for iframe URL
    if (message.components && Array.isArray(message.components)) {
      for (let i = 0; i < message.components.length; i++) {
        const component = message.components[i];
        
        // Check component-level URL (for iframe components)
        if (component.url) {
          const location = `component[${i}].url`;
          checkedLocations.push(location);
          foundUrls.push({ url: component.url, location });
          const iframeData = this.extractIframeDataFromUrl(component.url);
          if (iframeData) {
            console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data in ${location}: custom_id=${iframeData.custom_id.substring(0, 50)}...`);
            return iframeData;
          }
        }
        
        // Check component-level custom_id
        if (component.custom_id && component.custom_id.includes('MJ::iframe::')) {
          const location = `component[${i}].custom_id`;
          checkedLocations.push(location);
          console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe custom_id in ${location}: ${component.custom_id}`);
          return { custom_id: component.custom_id };
        }
        
        // Deep search in component data/metadata
        if (component.data) {
          const location = `component[${i}].data`;
          checkedLocations.push(location);
          const iframeDataFromData = this.extractIframeDataFromObject(component.data);
          if (iframeDataFromData) {
            console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data in ${location}: custom_id=${iframeDataFromData.custom_id.substring(0, 50)}...`);
            return iframeDataFromData;
          }
        }
        
        if (component.components && Array.isArray(component.components)) {
          for (let j = 0; j < component.components.length; j++) {
            const subComponent = component.components[j];
            
            // Check button URL
            if (subComponent.url) {
              const location = `component[${i}].components[${j}].url`;
              checkedLocations.push(location);
              foundUrls.push({ url: subComponent.url, location });
              const iframeData = this.extractIframeDataFromUrl(subComponent.url);
              if (iframeData) {
                console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data in ${location}: custom_id=${iframeData.custom_id.substring(0, 50)}...`);
                return iframeData;
              }
            }
            
            // Check if custom_id itself is an iframe custom_id
            if (subComponent.custom_id) {
              const location = `component[${i}].components[${j}].custom_id`;
              checkedLocations.push(location);
              if (subComponent.custom_id.includes('MJ::iframe::')) {
                console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe custom_id directly in ${location}: ${subComponent.custom_id}`);
                return { custom_id: subComponent.custom_id };
              }
            }
            
            // Check subComponent data/metadata
            if (subComponent.data) {
              const location = `component[${i}].components[${j}].data`;
              checkedLocations.push(location);
              const iframeDataFromData = this.extractIframeDataFromObject(subComponent.data);
              if (iframeDataFromData) {
                console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data in ${location}: custom_id=${iframeDataFromData.custom_id.substring(0, 50)}...`);
                return iframeDataFromData;
              }
            }
          }
        }
      }
    }
    
    // Check interaction metadata (if present)
    if (message.interaction_metadata) {
      const location = 'message.interaction_metadata';
      checkedLocations.push(location);
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Checking ${location}`);
      const iframeDataFromMetadata = this.extractIframeDataFromObject(message.interaction_metadata);
      if (iframeDataFromMetadata) {
        console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data in ${location}: custom_id=${iframeDataFromMetadata.custom_id.substring(0, 50)}...`);
        return iframeDataFromMetadata;
      }
    }

    // Check message content for iframe URL
    if (message.content && typeof message.content === 'string') {
      const location = 'message.content';
      checkedLocations.push(location);
      
      // Extract URLs from content
      const urlMatches = message.content.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi);
      if (urlMatches) {
        urlMatches.forEach((url: string) => foundUrls.push({ url, location }));
      }
      
            console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Checking ${location} (length: ${message.content.length}, URLs found: ${urlMatches?.length || 0})`);
            const iframeData = this.extractIframeDataFromUrl(message.content);
            if (iframeData) {
              console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data in ${location}: custom_id=${iframeData.custom_id.substring(0, 50)}...`);
              return iframeData;
      }
    } else {
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - No message.content or content is not a string`);
    }

      // Final fallback: Recursively search the entire message object for iframe custom_id
      // This catches any iframe data in unexpected locations
      const location = 'message (recursive search)';
      checkedLocations.push(location);
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Performing recursive search of entire message object...`);
      const recursiveResult = this.extractIframeDataFromObject(message);
      if (recursiveResult) {
        console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUCCESS - Found iframe data via recursive search: custom_id=${recursiveResult.custom_id.substring(0, 50)}...`);
        return recursiveResult;
      }

    // Summary: Log what was checked and what URLs were found
    console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - SUMMARY: Checked ${checkedLocations.length} location(s), found ${foundUrls.length} URL(s)`);
    console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - Checked locations: ${checkedLocations.join(', ')}`);
    
    if (foundUrls.length > 0) {
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - All URLs found (${foundUrls.length} total):`);
      const uniqueUrls = Array.from(new Set(foundUrls.map(u => u.url)));
      uniqueUrls.forEach((url, idx) => {
        const locations = foundUrls.filter(u => u.url === url).map(u => u.location).join(', ');
        const truncated = url.length > 200 ? url.substring(0, 200) + '...' : url;
        console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId -   URL[${idx}] (found in: ${locations}): ${truncated}`);
      });
    } else {
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - No URLs found in message`);
    }

    console.log(`[discord-service-${this.account.getDisplay()}] extractIframeCustomId - No iframe custom_id found in message`);
    return null;
  }

  /**
   * Recursively search an object for iframe data
   * @param obj Object to search
   * @param depth Current recursion depth (max 5 to prevent infinite loops)
   * @param parentObj Parent object to search for URLs when custom_id is found
   * @returns IframeData object if found, null otherwise
   */
  private extractIframeDataFromObject(obj: any, depth: number = 0, parentObj?: any): IframeData | null {
    if (depth > 5 || !obj || typeof obj !== 'object') {
      return null;
    }

    // Check if obj itself is a string containing iframe custom_id or URL
    if (typeof obj === 'string') {
      if (obj.includes('MJ::iframe::')) {
        // Extract the full custom_id - matches alphanumeric, hyphens, underscores, and other URL-safe chars
        const match = obj.match(/MJ::iframe::[A-Za-z0-9_.-]+/);
        if (match) {
          // If we found custom_id in a string, try to find URL in parent object
          if (parentObj) {
            const urlData = this.findUrlInObject(parentObj);
            if (urlData) {
              return urlData; // URL extraction will have all three values
            }
          }
          return { custom_id: match[0] };
        }
      }
      // Also check if it's a URL (only if it looks like one)
      if (this.looksLikeUrl(obj)) {
        return this.extractIframeDataFromUrl(obj);
      }
      return null;
    }

    // Check direct properties - prefer URL over custom_id (URL has all three values)
    if (obj.url && typeof obj.url === 'string') {
      const iframeData = this.extractIframeDataFromUrl(obj.url);
      if (iframeData) {
        return iframeData;
      }
    }

    // Check for custom_id in direct properties
    if (obj.custom_id && typeof obj.custom_id === 'string' && obj.custom_id.includes('MJ::iframe::')) {
      const iframeData: IframeData = { custom_id: obj.custom_id };
      // Try to find URL in the same object or extract instance_id/frame_id from object properties
      if (obj.url && typeof obj.url === 'string') {
        const urlData = this.extractIframeDataFromUrl(obj.url);
        if (urlData) {
          return urlData; // URL extraction has all three values
        }
      }
      // Also check for instance_id and frame_id as direct properties
      if (obj.instance_id) {
        iframeData.instance_id = obj.instance_id;
      }
      if (obj.frame_id) {
        iframeData.frame_id = obj.frame_id;
      }
      // If we have custom_id but no URL, try to find URL in parent or sibling properties
      if (!iframeData.instance_id || !iframeData.frame_id) {
        const urlData = this.findUrlInObject(obj);
        if (urlData) {
          // Merge: use custom_id from obj, but instance_id and frame_id from URL
          iframeData.instance_id = urlData.instance_id || iframeData.instance_id;
          iframeData.frame_id = urlData.frame_id || iframeData.frame_id;
        }
      }
      return iframeData;
    }

    if (obj.customid && typeof obj.customid === 'string' && obj.customid.includes('MJ::iframe::')) {
      const iframeData: IframeData = { custom_id: obj.customid };
      if (obj.url && typeof obj.url === 'string') {
        const urlData = this.extractIframeDataFromUrl(obj.url);
        if (urlData) {
          return urlData;
        }
      }
      if (obj.instance_id) {
        iframeData.instance_id = obj.instance_id;
      }
      if (obj.frame_id) {
        iframeData.frame_id = obj.frame_id;
      }
      if (!iframeData.instance_id || !iframeData.frame_id) {
        const urlData = this.findUrlInObject(obj);
        if (urlData) {
          iframeData.instance_id = urlData.instance_id || iframeData.instance_id;
          iframeData.frame_id = urlData.frame_id || iframeData.frame_id;
        }
      }
      return iframeData;
    }

    // Recursively search nested objects and arrays
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value && typeof value === 'object') {
          const result = this.extractIframeDataFromObject(value, depth + 1, obj);
          if (result) {
            return result;
          }
        } else if (typeof value === 'string') {
          if (value.includes('MJ::iframe::')) {
            // Extract the full custom_id - matches alphanumeric, hyphens, underscores, and other URL-safe chars
            const match = value.match(/MJ::iframe::[A-Za-z0-9_.-]+/);
            if (match) {
              // Found custom_id in a string value, try to find URL in the same object
              const urlData = this.findUrlInObject(obj);
              if (urlData) {
                return urlData; // URL extraction has all three values
              }
              return { custom_id: match[0] };
            }
          }
          // Check if it's a URL (only if it looks like one to avoid checking every string)
          if (this.looksLikeUrl(value)) {
            const iframeData = this.extractIframeDataFromUrl(value);
            if (iframeData) {
              return iframeData;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Helper method to find iframe URL in an object (searches recursively but shallow)
   * @param obj Object to search
   * @returns IframeData from URL if found, null otherwise
   */
  private findUrlInObject(obj: any): IframeData | null {
    if (!obj || typeof obj !== 'object') {
      return null;
    }

    // Check direct properties
    if (obj.url && typeof obj.url === 'string' && this.looksLikeUrl(obj.url)) {
      const urlData = this.extractIframeDataFromUrl(obj.url);
      if (urlData) {
        return urlData;
      }
    }

    // Check common URL property names
    const urlProperties = ['src', 'href', 'iframeUrl', 'iframe_url', 'url', 'source'];
    for (const prop of urlProperties) {
      if (obj[prop] && typeof obj[prop] === 'string' && this.looksLikeUrl(obj[prop])) {
        const urlData = this.extractIframeDataFromUrl(obj[prop]);
        if (urlData) {
          return urlData;
        }
      }
    }

    // Check first level of nested objects/arrays (shallow search)
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Check nested object's direct properties
          if (value.url && typeof value.url === 'string' && this.looksLikeUrl(value.url)) {
            const urlData = this.extractIframeDataFromUrl(value.url);
            if (urlData) {
              return urlData;
            }
          }
        } else if (Array.isArray(value)) {
          // Check array items for URLs
          for (const item of value) {
            if (item && typeof item === 'object' && item.url && typeof item.url === 'string' && this.looksLikeUrl(item.url)) {
              const urlData = this.extractIframeDataFromUrl(item.url);
              if (urlData) {
                return urlData;
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if a string looks like a URL (to avoid checking every string)
   * @param str String to check
   * @returns true if it looks like a URL
   */
  private looksLikeUrl(str: string): boolean {
    if (!str || str.length < 10) {
      return false;
    }
    // Must start with http:// or https:// or contain discordsays.com
    return str.startsWith('http://') || str.startsWith('https://') || str.includes('discordsays.com');
  }

  /**
   * Extract iframe data (custom_id, instance_id, frame_id) from URL if it matches the inpaint iframe pattern
   * Handles both URL-encoded and plain custom_id parameters
   * @param url URL string to check
   * @returns IframeData object with custom_id (required) and optionally instance_id and frame_id, or null if not found
   */
  private extractIframeDataFromUrl(url: string): IframeData | null {
    try {
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - Checking URL: ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
      
      // Pattern: https://936929561302675456.discordsays.com/.proxy/inpaint/index.html?custom_id=MJ::iframe::...
      const iframeUrlPattern = /936929561302675456\.discordsays\.com\/\.proxy\/inpaint\/index\.html/;
      
      if (!iframeUrlPattern.test(url)) {
        console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - URL does not match iframe pattern`);
        return null;
      }

      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - URL matches iframe pattern, parsing...`);

      // Ensure URL has protocol for parsing
      let urlToParse = url;
      if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
        urlToParse = 'https://' + urlToParse;
        console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - Added https:// protocol: ${urlToParse.substring(0, 100)}...`);
      }

      // Extract all iframe parameters from URL query parameters (handles URL-encoded values)
      const urlObj = new URL(urlToParse);
      let customId = urlObj.searchParams.get('custom_id');
      let instanceId = urlObj.searchParams.get('instance_id');
      let frameId = urlObj.searchParams.get('frame_id');
      
      // Decode URL-encoded values
      if (customId) {
        try {
          const decoded = decodeURIComponent(customId);
          if (decoded !== customId) {
            console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - Decoded custom_id from URL-encoded: ${decoded.substring(0, 50)}...`);
            customId = decoded;
          }
        } catch (e) {
          console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - Could not decode custom_id, using as-is`);
        }
      }
      
      if (instanceId) {
        try {
          instanceId = decodeURIComponent(instanceId);
        } catch (e) {
          // Use as-is if decoding fails
        }
      }
      
      if (frameId) {
        try {
          frameId = decodeURIComponent(frameId);
        } catch (e) {
          // Use as-is if decoding fails
        }
      }
      
      console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - Extracted params: custom_id=${customId ? customId.substring(0, 50) + '...' : 'null'}, instance_id=${instanceId ? instanceId.substring(0, 50) + '...' : 'null'}, frame_id=${frameId || 'null'}`);
      
      if (customId && customId.includes('MJ::iframe::')) {
        const iframeData: IframeData = { custom_id: customId };
        if (instanceId) {
          iframeData.instance_id = instanceId;
        }
        if (frameId) {
          iframeData.frame_id = frameId;
        }
        console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - SUCCESS - Found iframe data: custom_id=${iframeData.custom_id.substring(0, 50)}..., instance_id=${iframeData.instance_id ? 'present' : 'missing'}, frame_id=${iframeData.frame_id || 'missing'}`);
        return iframeData;
      } else {
        console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - custom_id param does not contain 'MJ::iframe::'`);
        
        // Also try to extract from the raw URL string in case it's embedded differently
        // Look for MJ::iframe:: pattern directly in the URL (handles URL-encoded and plain)
        // Matches alphanumeric, hyphens, underscores, dots, and other URL-safe chars
        const directMatch = url.match(/MJ%3A%3Aiframe%3A%3A([A-Za-z0-9_.-]+)/i) || url.match(/MJ::iframe::([A-Za-z0-9_.-]+)/i);
        if (directMatch) {
          const extractedCustomId = `MJ::iframe::${directMatch[1]}`;
          const iframeData: IframeData = { custom_id: extractedCustomId };
          if (instanceId) {
            iframeData.instance_id = instanceId;
          }
          if (frameId) {
            iframeData.frame_id = frameId;
          }
          console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - Found iframe custom_id via direct pattern match: ${extractedCustomId}`);
          return iframeData;
        }
      }
    } catch (error: any) {
      // URL parsing failed, not a valid URL or doesn't match pattern
      console.error(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - Error parsing URL: ${error.message}`, error);
      
      // Try regex extraction as fallback
      try {
        // Matches alphanumeric, hyphens, underscores, dots, and other URL-safe chars
        const fallbackMatch = url.match(/MJ%3A%3Aiframe%3A%3A([A-Za-z0-9_.-]+)/i) || url.match(/MJ::iframe::([A-Za-z0-9_.-]+)/i);
        if (fallbackMatch) {
          const extractedCustomId = `MJ::iframe::${fallbackMatch[1]}`;
          const iframeData: IframeData = { custom_id: extractedCustomId };
          // Try to extract instance_id and frame_id from URL if present
          const instanceIdMatch = url.match(/instance_id=([^&]+)/i);
          const frameIdMatch = url.match(/frame_id=([^&]+)/i);
          if (instanceIdMatch) {
            try {
              iframeData.instance_id = decodeURIComponent(instanceIdMatch[1]);
            } catch (e) {
              iframeData.instance_id = instanceIdMatch[1];
            }
          }
          if (frameIdMatch) {
            try {
              iframeData.frame_id = decodeURIComponent(frameIdMatch[1]);
            } catch (e) {
              iframeData.frame_id = frameIdMatch[1];
            }
          }
          console.log(`[discord-service-${this.account.getDisplay()}] extractIframeDataFromUrl - Fallback: Found iframe data via regex: custom_id=${extractedCustomId.substring(0, 50)}...`);
          return iframeData;
        }
      } catch (regexError) {
        // Ignore regex errors
      }
      
      return null;
    }

    return null;
  }
}

