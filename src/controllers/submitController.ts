import { FastifyRequest, FastifyReply } from 'fastify';
import { SubmitResultVO } from '../models/SubmitResultVO';
import { Task } from '../models/Task';
import { TaskAction } from '../enums/TaskAction';
import { TaskStatus } from '../enums/TaskStatus';
import { ReturnCode } from '../constants';
import { SubmitImagineDTO } from '../dto/SubmitImagineDTO';
import { SubmitChangeDTO } from '../dto/SubmitChangeDTO';
import { SubmitSimpleChangeDTO } from '../dto/SubmitSimpleChangeDTO';
import { SubmitDescribeDTO } from '../dto/SubmitDescribeDTO';
import { SubmitShortenDTO } from '../dto/SubmitShortenDTO';
import { SubmitBlendDTO } from '../dto/SubmitBlendDTO';
// Removed specific DTO imports in favor of generic action/modal
import { SubmitActionDTO } from '../dto/SubmitActionDTO';
import { SubmitModalDTO } from '../dto/SubmitModalDTO';
import { TaskService } from '../services/taskService';
import { TaskStoreService } from '../services/store/taskStoreService';
import { TranslateService } from '../services/translate/translateService';
import { config } from '../config';
import { BannedPromptException } from '../exceptions/BannedPromptException';
import { checkBanned } from '../utils/bannedPromptUtils';
import { convertBase64Array, convertChangeParams, getPrimaryPrompt } from '../utils/convertUtils';
import { guessFileSuffix } from '../utils/mimeTypeUtils';
import { SnowFlake } from '../utils/snowflake';
import { TaskChangeParams } from '../utils/taskChangeParams';
import {
  TASK_PROPERTY_NOTIFY_HOOK,
  TASK_PROPERTY_NONCE,
  TASK_PROPERTY_FINAL_PROMPT,
  TASK_PROPERTY_PROGRESS_MESSAGE_ID,
  TASK_PROPERTY_DISCORD_INSTANCE_ID,
  TASK_PROPERTY_FLAGS,
  TASK_PROPERTY_MESSAGE_ID,
  TASK_PROPERTY_MESSAGE_HASH,
  TASK_PROPERTY_REFERENCED_MESSAGE_ID,
} from '../constants';

/**
 * Submit controller
 */
export class SubmitController {
  private taskService: TaskService;
  private taskStoreService: TaskStoreService;
  private translateService: TranslateService;

  constructor(taskService: TaskService, taskStoreService: TaskStoreService, translateService: TranslateService) {
    this.taskService = taskService;
    this.taskStoreService = taskStoreService;
    this.translateService = translateService;
  }

  async imagine(request: FastifyRequest<{ Body: SubmitImagineDTO }>, reply: FastifyReply): Promise<SubmitResultVO> {
    const imagineDTO = request.body;
    let prompt = imagineDTO.prompt;

    if (!prompt || prompt.trim().length === 0) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'prompt cannot be empty');
    }

    prompt = prompt.trim();
    const task = this.newTask(imagineDTO);
    task.action = TaskAction.IMAGINE;
    task.prompt = prompt;

    const promptEn = await this.translatePrompt(prompt);
    try {
      checkBanned(promptEn);
    } catch (e) {
      if (e instanceof BannedPromptException) {
        return SubmitResultVO.fail(ReturnCode.BANNED_PROMPT, 'may contain sensitive words')
          .setProperty('promptEn', promptEn)
          .setProperty('bannedWord', e.message);
      }
      throw e;
    }

    const base64Array = imagineDTO.base64Array || [];
    if (imagineDTO.base64) {
      base64Array.push(imagineDTO.base64);
    }

    let dataUrls;
    try {
      dataUrls = convertBase64Array(base64Array);
    } catch (e) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'base64 format error');
    }

    task.promptEn = promptEn;
    task.description = `/imagine ${prompt}`;
    return this.taskService.submitImagine(task, dataUrls);
  }

  async simpleChange(request: FastifyRequest<{ Body: SubmitSimpleChangeDTO }>, reply: FastifyReply): Promise<SubmitResultVO> {
    const simpleChangeDTO = request.body;
    const changeParams = convertChangeParams(simpleChangeDTO.content || '');

    if (!changeParams) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'content parameter error');
    }

    const changeDTO: SubmitChangeDTO = {
      action: changeParams.action,
      taskId: changeParams.id,
      index: changeParams.index,
      state: simpleChangeDTO.state,
      notifyHook: simpleChangeDTO.notifyHook,
    };

    // Create a new request-like object with the changeDTO as body
    const changeRequest = {
      ...request,
      body: changeDTO,
    } as FastifyRequest<{ Body: SubmitChangeDTO }>;

    return this.change(changeRequest, reply);
  }

  async change(request: FastifyRequest<{ Body: SubmitChangeDTO }>, reply: FastifyReply): Promise<SubmitResultVO> {
    const changeDTO = request.body;

    if (!changeDTO.taskId) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'taskId cannot be empty');
    }

    if (![TaskAction.UPSCALE, TaskAction.VARIATION, TaskAction.REROLL].includes(changeDTO.action!)) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'action parameter error');
    }

    let description = `/up ${changeDTO.taskId}`;
    if (changeDTO.action === TaskAction.REROLL) {
      description += ' R';
    } else {
      description += ` ${changeDTO.action!.charAt(0)}${changeDTO.index}`;
    }

    const targetTask = await this.taskStoreService.get(changeDTO.taskId!);
    if (!targetTask) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, 'related task does not exist or has expired');
    }

    if (targetTask.status !== TaskStatus.SUCCESS) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'related task status error');
    }

    if (![TaskAction.IMAGINE, TaskAction.VARIATION, TaskAction.REROLL, TaskAction.BLEND].includes(targetTask.action!)) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'related task does not allow variation');
    }

    const task = this.newTask(changeDTO);
    task.action = changeDTO.action;
    task.prompt = targetTask.prompt;
    task.promptEn = targetTask.promptEn;
    task.setProperty(TASK_PROPERTY_FINAL_PROMPT, targetTask.getProperty(TASK_PROPERTY_FINAL_PROMPT));
    task.setProperty(TASK_PROPERTY_PROGRESS_MESSAGE_ID, targetTask.getProperty(TASK_PROPERTY_MESSAGE_ID));
    task.setProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID, targetTask.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID));
    task.description = description;

    const messageFlags = targetTask.getProperty(TASK_PROPERTY_FLAGS) || 0;
    const messageId = targetTask.getProperty(TASK_PROPERTY_MESSAGE_ID);
    const messageHash = targetTask.getProperty(TASK_PROPERTY_MESSAGE_HASH);
    task.setProperty(TASK_PROPERTY_REFERENCED_MESSAGE_ID, messageId);

    if (changeDTO.action === TaskAction.UPSCALE) {
      return this.taskService.submitUpscale(task, messageId, messageHash, changeDTO.index!, messageFlags);
    } else if (changeDTO.action === TaskAction.VARIATION) {
      return this.taskService.submitVariation(task, messageId, messageHash, changeDTO.index!, messageFlags);
    } else {
      return this.taskService.submitReroll(task, messageId, messageHash, messageFlags);
    }
  }

  async describe(request: FastifyRequest<{ Body: SubmitDescribeDTO }>, reply: FastifyReply): Promise<SubmitResultVO> {
    const describeDTO = request.body;

    if (!describeDTO.base64) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'base64 cannot be empty');
    }

    let dataUrl;
    try {
      const dataUrls = convertBase64Array([describeDTO.base64]);
      dataUrl = dataUrls[0];
    } catch (e) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'base64 format error');
    }

    const task = this.newTask(describeDTO);
    task.action = TaskAction.DESCRIBE;
    const taskFileName = `${task.id}.${guessFileSuffix(dataUrl.mimeType) || 'png'}`;
    task.description = `/describe ${taskFileName}`;
    return this.taskService.submitDescribe(task, dataUrl);
  }

  async shorten(request: FastifyRequest<{ Body: SubmitShortenDTO }>, reply: FastifyReply): Promise<SubmitResultVO> {
    const shortenDTO = request.body;
    let prompt = shortenDTO.prompt;

    if (!prompt || prompt.trim().length === 0) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'prompt cannot be empty');
    }

    prompt = prompt.trim();
    const task = this.newTask(shortenDTO);
    task.action = TaskAction.SHORTEN;
    task.prompt = prompt;

    const promptEn = await this.translatePrompt(prompt);
    task.promptEn = promptEn;
    task.description = `/shorten ${prompt}`;
    return this.taskService.submitShorten(task);
  }

  async blend(request: FastifyRequest<{ Body: SubmitBlendDTO }>, reply: FastifyReply): Promise<SubmitResultVO> {
    const blendDTO = request.body;
    const base64Array = blendDTO.base64Array;

    if (!base64Array || base64Array.length < 2 || base64Array.length > 5) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'base64List parameter error');
    }

    if (!blendDTO.dimensions) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'dimensions parameter error');
    }

    let dataUrlList;
    try {
      dataUrlList = convertBase64Array(base64Array);
    } catch (e) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'base64 format error');
    }

    const task = this.newTask(blendDTO);
    task.action = TaskAction.BLEND;
    task.description = `/blend ${task.id} ${dataUrlList.length}`;
    return this.taskService.submitBlend(task, dataUrlList, blendDTO.dimensions);
  }

  // Specific image action endpoints removed in favor of generic action/modal

  // ---------- Generic action + modal flow ----------
  async action(request: FastifyRequest<{ Body: SubmitActionDTO }>, reply: FastifyReply): Promise<SubmitResultVO> {
    const dto = request.body;
    if (!dto.taskId) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'taskId cannot be empty');
    }
    if (!dto.customId) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'customId cannot be empty');
    }

    const targetTask = await this.taskStoreService.get(dto.taskId);
    if (!targetTask) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, 'related task does not exist or has expired');
    }
    if (targetTask.status !== TaskStatus.SUCCESS) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'related task status error');
    }

    const task = this.newTask(dto);
    task.action = targetTask.action;
    task.prompt = targetTask.prompt;
    task.promptEn = targetTask.promptEn;
    task.setProperty(TASK_PROPERTY_FINAL_PROMPT, targetTask.getProperty(TASK_PROPERTY_FINAL_PROMPT));
    task.setProperty(TASK_PROPERTY_PROGRESS_MESSAGE_ID, targetTask.getProperty(TASK_PROPERTY_MESSAGE_ID));
    task.setProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID, targetTask.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID));
    task.description = `/action ${dto.customId}`;

    const messageFlags = targetTask.getProperty(TASK_PROPERTY_FLAGS) || 0;
    const messageId = targetTask.getProperty(TASK_PROPERTY_MESSAGE_ID);
    const messageHash = targetTask.getProperty(TASK_PROPERTY_MESSAGE_HASH);
    task.setProperty(TASK_PROPERTY_REFERENCED_MESSAGE_ID, messageId);

    return this.taskService.submitCustomComponent(task, messageId, messageHash, dto.customId, messageFlags);
  }

  async modal(request: FastifyRequest<{ Body: SubmitModalDTO }>, reply: FastifyReply): Promise<SubmitResultVO> {
    const dto = request.body;
    if (!dto.taskId) {
      return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'taskId cannot be empty');
    }

    const targetTask = await this.taskStoreService.get(dto.taskId);
    if (!targetTask) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, 'related task does not exist or has expired');
    }

    const task = this.newTask(dto);
    task.action = targetTask.action;
    task.prompt = targetTask.prompt;
    task.promptEn = targetTask.promptEn;
    task.setProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID, targetTask.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID));
    task.description = `/modal ${dto.taskId}`;

    let maskDataUrl;
    if (dto.maskBase64) {
      try {
        const dataUrls = convertBase64Array([dto.maskBase64]);
        maskDataUrl = dataUrls[0];
      } catch (e) {
        return SubmitResultVO.fail(ReturnCode.VALIDATION_ERROR, 'maskBase64 format error');
      }
    }

    // For now, modal supports inpaint-style follow-ups (mask + optional prompt)
    return this.taskService.submitModal(task, maskDataUrl, dto.prompt);
  }

  private newTask(base: any): Task {
    const task = new Task();
    task.id = `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    task.submitTime = Date.now();
    task.state = base.state;
    const notifyHook = base.notifyHook || config.mj.notifyHook;
    task.setProperty(TASK_PROPERTY_NOTIFY_HOOK, notifyHook);
    task.setProperty(TASK_PROPERTY_NONCE, SnowFlake.INSTANCE.nextId());
    return task;
  }

  private async translatePrompt(prompt: string): Promise<string> {
    if (config.mj.translateWay === 'NULL' || !prompt || !this.translateService.containsChinese(prompt)) {
      return prompt;
    }

    // Extract parameters
    const paramMatch = prompt.match(/\s+--[a-z]+.*$/i);
    const paramStr = paramMatch ? paramMatch[0] : '';

    const promptWithoutParam = prompt.substring(0, prompt.length - paramStr.length);

    // Extract image URLs
    const imageUrlRegex = /https?:\/\/[a-z0-9-_:@&?=+,.!/~*'%$]+\s+/gi;
    const imageUrls: string[] = [];
    let match;
    while ((match = imageUrlRegex.exec(promptWithoutParam)) !== null) {
      imageUrls.push(match[0]);
    }

    let text = promptWithoutParam;
    for (const imageUrl of imageUrls) {
      text = text.replace(imageUrl, '');
    }

    if (text.trim()) {
      const translated = this.translateService.translateToEnglish(text);
      text = typeof translated === 'string' ? translated.trim() : (await translated).trim();
    }

    // Translate --no parameters
    let translatedParamStr = paramStr;
    if (paramStr) {
      const noMatch = paramStr.match(/--no\s+(.*?)(?=--|$)/);
      if (noMatch) {
        const paramNoStr = noMatch[1].trim();
        const translatedNo = this.translateService.translateToEnglish(paramNoStr);
        const translatedNoStr = typeof translatedNo === 'string' ? translatedNo.trim() : (await translatedNo).trim();
        translatedParamStr = paramStr.replace(noMatch[0], `--no ${translatedNoStr} `);
      }
    }

    return imageUrls.join('') + text + translatedParamStr;
  }
}

