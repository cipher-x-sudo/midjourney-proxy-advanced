import { SubmitResultVO } from '../models/SubmitResultVO';
import { Task } from '../models/Task';
import { BlendDimensions } from '../enums/BlendDimensions';
import { DataUrl } from '../utils/convertUtils';
import { DiscordLoadBalancer } from '../loadbalancer/discordLoadBalancer';
import { DiscordInstance } from '../loadbalancer/discordInstance';
import { TaskStoreService } from './store/taskStoreService';
import { ReturnCode } from '../constants';
import { Message } from '../result/Message';
import { guessFileSuffix } from '../utils/mimeTypeUtils';
import { TASK_PROPERTY_DISCORD_INSTANCE_ID, TASK_PROPERTY_NONCE } from '../constants';

/**
 * Task service interface
 */
export interface TaskService {
  submitImagine(task: Task, dataUrls: DataUrl[]): Promise<SubmitResultVO>;
  submitUpscale(task: Task, targetMessageId: string, targetMessageHash: string, index: number, messageFlags: number): Promise<SubmitResultVO>;
  submitVariation(task: Task, targetMessageId: string, targetMessageHash: string, index: number, messageFlags: number): Promise<SubmitResultVO>;
  submitReroll(task: Task, targetMessageId: string, targetMessageHash: string, messageFlags: number): Promise<SubmitResultVO>;
  submitDescribe(task: Task, dataUrl: DataUrl): Promise<SubmitResultVO>;
  submitShorten(task: Task): Promise<SubmitResultVO>;
  submitBlend(task: Task, dataUrls: DataUrl[], dimensions: BlendDimensions): Promise<SubmitResultVO>;

  // New image actions via custom components
  submitUpsample2x(task: Task, targetMessageId: string, targetMessageHash: string, index: number, mode: 'subtle'|'creative', messageFlags: number): Promise<SubmitResultVO>;
  submitVariationStrength(task: Task, targetMessageId: string, targetMessageHash: string, index: number, level: 'low'|'high', messageFlags: number): Promise<SubmitResultVO>;
  submitPan(task: Task, targetMessageId: string, targetMessageHash: string, index: number, direction: 'left'|'right'|'up'|'down', messageFlags: number): Promise<SubmitResultVO>;
  submitOutpaint(task: Task, targetMessageId: string, targetMessageHash: string, index: number, percent: 50|75, messageFlags: number): Promise<SubmitResultVO>;
  submitAnimate(task: Task, targetMessageId: string, targetMessageHash: string, index: number, quality: 'low'|'high', messageFlags: number): Promise<SubmitResultVO>;
  submitInpaint(task: Task, targetMessageId: string, targetMessageHash: string, index: number, messageFlags: number, maskDataUrl: DataUrl, prompt?: string): Promise<SubmitResultVO>;
}

/**
 * Task service implementation
 */
export class TaskServiceImpl implements TaskService {
  private taskStoreService: TaskStoreService;
  private discordLoadBalancer: DiscordLoadBalancer;

  constructor(taskStoreService: TaskStoreService, discordLoadBalancer: DiscordLoadBalancer) {
    this.taskStoreService = taskStoreService;
    this.discordLoadBalancer = discordLoadBalancer;
  }

  async submitImagine(task: Task, dataUrls: DataUrl[]): Promise<SubmitResultVO> {
    const instance = this.discordLoadBalancer.chooseInstance();
    if (!instance) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, 'No available account instance');
    }

    task.setProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID, instance.getInstanceId());

    return instance.submitTask(task, async () => {
      const imageUrls: string[] = [];
      
      for (const dataUrl of dataUrls) {
        const taskFileName = `${task.id}.${guessFileSuffix(dataUrl.mimeType) || 'png'}`;
        const uploadResult = await instance.upload(taskFileName, dataUrl);
        
        if (uploadResult.getCode() !== ReturnCode.SUCCESS) {
          return Message.of(uploadResult.getCode(), uploadResult.getDescription());
        }

        const finalFileName = uploadResult.getResult()!;
        const sendImageResult = await instance.sendImageMessage(`upload image: ${finalFileName}`, finalFileName);
        
        if (sendImageResult.getCode() !== ReturnCode.SUCCESS) {
          return Message.of(sendImageResult.getCode(), sendImageResult.getDescription());
        }

        imageUrls.push(sendImageResult.getResult()!);
      }

      if (imageUrls.length > 0) {
        task.prompt = `${imageUrls.join(' ')} ${task.prompt || ''}`;
        task.promptEn = `${imageUrls.join(' ')} ${task.promptEn || ''}`;
        task.description = `/imagine ${task.prompt}`;
        await this.taskStoreService.save(task);
      }

      const nonce = task.getProperty(TASK_PROPERTY_NONCE);
      return instance.imagine(task.promptEn || task.prompt || '', nonce || '');
    });
  }

  async submitUpscale(task: Task, targetMessageId: string, targetMessageHash: string, index: number, messageFlags: number): Promise<SubmitResultVO> {
    const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
    const discordInstance = this.discordLoadBalancer.getDiscordInstance(instanceId);
    
    if (!discordInstance || !discordInstance.isAlive()) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }

    const nonce = task.getProperty(TASK_PROPERTY_NONCE);
    return discordInstance.submitTask(task, () => 
      discordInstance.upscale(targetMessageId, index, targetMessageHash, messageFlags, nonce || '')
    );
  }

  async submitVariation(task: Task, targetMessageId: string, targetMessageHash: string, index: number, messageFlags: number): Promise<SubmitResultVO> {
    const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
    const discordInstance = this.discordLoadBalancer.getDiscordInstance(instanceId);
    
    if (!discordInstance || !discordInstance.isAlive()) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }

    const nonce = task.getProperty(TASK_PROPERTY_NONCE);
    return discordInstance.submitTask(task, () => 
      discordInstance.variation(targetMessageId, index, targetMessageHash, messageFlags, nonce || '')
    );
  }

  async submitReroll(task: Task, targetMessageId: string, targetMessageHash: string, messageFlags: number): Promise<SubmitResultVO> {
    const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
    const discordInstance = this.discordLoadBalancer.getDiscordInstance(instanceId);
    
    if (!discordInstance || !discordInstance.isAlive()) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }

    const nonce = task.getProperty(TASK_PROPERTY_NONCE);
    return discordInstance.submitTask(task, () => 
      discordInstance.reroll(targetMessageId, targetMessageHash, messageFlags, nonce || '')
    );
  }

  async submitDescribe(task: Task, dataUrl: DataUrl): Promise<SubmitResultVO> {
    const discordInstance = this.discordLoadBalancer.chooseInstance();
    if (!discordInstance) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, 'No available account instance');
    }

    task.setProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID, discordInstance.getInstanceId());

    return discordInstance.submitTask(task, async () => {
      const taskFileName = `${task.id}.${guessFileSuffix(dataUrl.mimeType) || 'png'}`;
      const uploadResult = await discordInstance.upload(taskFileName, dataUrl);
      
      if (uploadResult.getCode() !== ReturnCode.SUCCESS) {
        return Message.of(uploadResult.getCode(), uploadResult.getDescription());
      }

      const finalFileName = uploadResult.getResult()!;
      const nonce = task.getProperty(TASK_PROPERTY_NONCE);
      return discordInstance.describe(finalFileName, nonce || '');
    });
  }

  async submitShorten(task: Task): Promise<SubmitResultVO> {
    const discordInstance = this.discordLoadBalancer.chooseInstance();
    if (!discordInstance) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, 'No available account instance');
    }

    task.setProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID, discordInstance.getInstanceId());

    return discordInstance.submitTask(task, () => {
      const nonce = task.getProperty(TASK_PROPERTY_NONCE);
      return discordInstance.shorten(task.promptEn || task.prompt || '', nonce || '');
    });
  }

  async submitBlend(task: Task, dataUrls: DataUrl[], dimensions: BlendDimensions): Promise<SubmitResultVO> {
    const discordInstance = this.discordLoadBalancer.chooseInstance();
    if (!discordInstance) {
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, 'No available account instance');
    }

    task.setProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID, discordInstance.getInstanceId());

    return discordInstance.submitTask(task, async () => {
      const finalFileNames: string[] = [];
      
      for (const dataUrl of dataUrls) {
        const taskFileName = `${task.id}.${guessFileSuffix(dataUrl.mimeType) || 'png'}`;
        const uploadResult = await discordInstance.upload(taskFileName, dataUrl);
        
        if (uploadResult.getCode() !== ReturnCode.SUCCESS) {
          return Message.of(uploadResult.getCode(), uploadResult.getDescription());
        }

        finalFileNames.push(uploadResult.getResult()!);
      }

      const nonce = task.getProperty(TASK_PROPERTY_NONCE);
      return discordInstance.blend(finalFileNames, dimensions, nonce || '');
    });
  }

  // ---------- New image actions via custom_id ----------
  private getInstanceOrFail(task: Task): DiscordInstance | null {
    const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
    const discordInstance = this.discordLoadBalancer.getDiscordInstance(instanceId);
    if (!discordInstance || !discordInstance.isAlive()) {
      return null;
    }
    return discordInstance;
  }

  async submitUpsample2x(task: Task, targetMessageId: string, targetMessageHash: string, index: number, mode: 'subtle'|'creative', messageFlags: number): Promise<SubmitResultVO> {
    const discordInstance = this.getInstanceOrFail(task);
    if (!discordInstance) {
      const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }
    const customId = `MJ::JOB::upsample_v7_2x_${mode}::${index}::${targetMessageHash}::SOLO`;
    const nonce = task.getProperty(TASK_PROPERTY_NONCE);
    return discordInstance.submitTask(task, () => discordInstance.customComponent(targetMessageId, messageFlags, customId, nonce || ''));
  }

  async submitVariationStrength(task: Task, targetMessageId: string, targetMessageHash: string, index: number, level: 'low'|'high', messageFlags: number): Promise<SubmitResultVO> {
    const discordInstance = this.getInstanceOrFail(task);
    if (!discordInstance) {
      const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }
    const customId = `MJ::JOB::${level}_variation::${index}::${targetMessageHash}::SOLO`;
    const nonce = task.getProperty(TASK_PROPERTY_NONCE);
    return discordInstance.submitTask(task, () => discordInstance.customComponent(targetMessageId, messageFlags, customId, nonce || ''));
  }

  async submitPan(task: Task, targetMessageId: string, targetMessageHash: string, index: number, direction: 'left'|'right'|'up'|'down', messageFlags: number): Promise<SubmitResultVO> {
    const discordInstance = this.getInstanceOrFail(task);
    if (!discordInstance) {
      const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }
    const customId = `MJ::JOB::pan_${direction}::${index}::${targetMessageHash}::SOLO`;
    const nonce = task.getProperty(TASK_PROPERTY_NONCE);
    return discordInstance.submitTask(task, () => discordInstance.customComponent(targetMessageId, messageFlags, customId, nonce || ''));
  }

  async submitOutpaint(task: Task, targetMessageId: string, targetMessageHash: string, index: number, percent: 50|75, messageFlags: number): Promise<SubmitResultVO> {
    const discordInstance = this.getInstanceOrFail(task);
    if (!discordInstance) {
      const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }
    const customId = `MJ::Outpaint::${percent}::${index}::${targetMessageHash}::SOLO`;
    const nonce = task.getProperty(TASK_PROPERTY_NONCE);
    return discordInstance.submitTask(task, () => discordInstance.customComponent(targetMessageId, messageFlags, customId, nonce || ''));
  }

  async submitAnimate(task: Task, targetMessageId: string, targetMessageHash: string, index: number, quality: 'low'|'high', messageFlags: number): Promise<SubmitResultVO> {
    const discordInstance = this.getInstanceOrFail(task);
    if (!discordInstance) {
      const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }
    const customId = `MJ::JOB::animate_${quality}::${index}::${targetMessageHash}::SOLO`;
    const nonce = task.getProperty(TASK_PROPERTY_NONCE);
    return discordInstance.submitTask(task, () => discordInstance.customComponent(targetMessageId, messageFlags, customId, nonce || ''));
  }

  async submitInpaint(task: Task, targetMessageId: string, targetMessageHash: string, index: number, messageFlags: number, maskDataUrl: DataUrl, prompt?: string): Promise<SubmitResultVO> {
    const discordInstance = this.getInstanceOrFail(task);
    if (!discordInstance) {
      const instanceId = task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID);
      return SubmitResultVO.fail(ReturnCode.NOT_FOUND, `Account unavailable: ${instanceId}`);
    }
    const customId = `MJ::Inpaint::${index}::${targetMessageHash}::SOLO`;
    const nonce = task.getProperty(TASK_PROPERTY_NONCE);

    return discordInstance.submitTask(task, async () => {
      // Step 1: trigger Inpaint button
      const pressResult = await discordInstance.customComponent(targetMessageId, messageFlags, customId, nonce || '');
      if (pressResult.getCode() !== ReturnCode.SUCCESS) {
        return pressResult;
      }
      // Step 2: upload mask image
      const fileName = `${task.id}.png`;
      const uploadResult = await discordInstance.upload(fileName, maskDataUrl);
      if (uploadResult.getCode() !== ReturnCode.SUCCESS) {
        return Message.of(uploadResult.getCode(), uploadResult.getDescription());
      }
      const finalFileName = uploadResult.getResult()!;
      // Step 3: send mask as message with optional prompt text (acts like user action)
      const content = (prompt && prompt.trim()) ? prompt.trim() : 'mask';
      const sendResult = await discordInstance.sendImageMessage(content, finalFileName);
      if (sendResult.getCode() !== ReturnCode.SUCCESS) {
        return Message.of(sendResult.getCode(), sendResult.getDescription());
      }
      return Message.success<void>();
    });
  }
}

