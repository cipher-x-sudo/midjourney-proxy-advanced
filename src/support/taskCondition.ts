import { Task } from '../models/Task';
import { TaskStatus } from '../enums/TaskStatus';
import { TaskAction } from '../enums/TaskAction';
import {
  TASK_PROPERTY_FINAL_PROMPT,
  TASK_PROPERTY_MESSAGE_ID,
  TASK_PROPERTY_MESSAGE_HASH,
  TASK_PROPERTY_PROGRESS_MESSAGE_ID,
  TASK_PROPERTY_NONCE,
  TASK_PROPERTY_DISCORD_INSTANCE_ID,
} from '../constants';

/**
 * Task condition builder
 */
export class TaskCondition {
  private id?: string;
  private statusSet?: Set<TaskStatus>;
  private actionSet?: Set<TaskAction>;
  private state?: string;
  private finalPrompt?: string;
  private messageId?: string;
  private messageHash?: string;
  private progressMessageId?: string;
  private nonce?: string;
  private instanceId?: string;

  setId(id: string): this {
    this.id = id;
    return this;
  }

  setStatusSet(statusSet: Set<TaskStatus>): this {
    this.statusSet = statusSet;
    return this;
  }

  setActionSet(actionSet: Set<TaskAction>): this {
    this.actionSet = actionSet;
    return this;
  }

  setState(state: string): this {
    this.state = state;
    return this;
  }

  setFinalPrompt(finalPrompt: string | undefined): this {
    this.finalPrompt = finalPrompt;
    return this;
  }

  setMessageId(messageId: string | undefined): this {
    this.messageId = messageId;
    return this;
  }

  setMessageHash(messageHash: string | undefined): this {
    this.messageHash = messageHash;
    return this;
  }

  setProgressMessageId(progressMessageId: string | undefined): this {
    this.progressMessageId = progressMessageId;
    return this;
  }

  setNonce(nonce: string | undefined): this {
    this.nonce = nonce;
    return this;
  }

  setInstanceId(instanceId: string | undefined): this {
    this.instanceId = instanceId;
    return this;
  }

  /**
   * Test if task matches condition
   */
  test(task: Task): boolean {
    if (!task) {
      return false;
    }
    if (this.id && this.id !== task.id) {
      return false;
    }
    if (this.statusSet && this.statusSet.size > 0 && !this.statusSet.has(task.status)) {
      return false;
    }
    if (this.actionSet && this.actionSet.size > 0 && !this.actionSet.has(task.action!)) {
      return false;
    }
    if (this.state && this.state !== task.state) {
      return false;
    }
    if (this.finalPrompt && this.finalPrompt !== task.getProperty(TASK_PROPERTY_FINAL_PROMPT)) {
      return false;
    }
    if (this.messageId && this.messageId !== task.getProperty(TASK_PROPERTY_MESSAGE_ID)) {
      return false;
    }
    if (this.messageHash && this.messageHash !== task.getProperty(TASK_PROPERTY_MESSAGE_HASH)) {
      return false;
    }
    if (this.progressMessageId && this.progressMessageId !== task.getProperty(TASK_PROPERTY_PROGRESS_MESSAGE_ID)) {
      return false;
    }
    if (this.nonce && this.nonce !== task.getProperty(TASK_PROPERTY_NONCE)) {
      return false;
    }
    if (this.instanceId && this.instanceId !== task.getProperty(TASK_PROPERTY_DISCORD_INSTANCE_ID)) {
      return false;
    }
    return true;
  }

  /**
   * Convert to function for filtering
   */
  toFunction(): (task: Task) => boolean {
    return (task: Task) => this.test(task);
  }
}

