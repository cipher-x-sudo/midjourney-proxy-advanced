import { DiscordAccount } from '../models/DiscordAccount';
import { Task } from '../models/Task';
import { SubmitResultVO } from '../models/SubmitResultVO';
import { Message } from '../result/Message';
import { BlendDimensions } from '../enums/BlendDimensions';
import { DataUrl } from '../utils/convertUtils';
import { TaskCondition } from '../support/taskCondition';

/**
 * Discord instance interface
 */
export interface DiscordInstance {
  getInstanceId(): string;
  account(): DiscordAccount;
  isAlive(): boolean;
  startWss(): Promise<void>;
  getRunningTasks(): Task[];
  getQueueTasks(): Task[];
  exitTask(task: Task): void;
  getRunningFutures(): Map<string, Promise<any>>;
  submitTask(task: Task, discordSubmit: () => Promise<Message<void>>): Promise<SubmitResultVO>;
  findRunningTask(condition: (task: Task) => boolean): Task[];
  getRunningTask(id: string): Task | undefined;
  getRunningTaskByNonce(nonce: string): Task | undefined;

  // DiscordService methods
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

  // Generic component interaction
  customComponent(messageId: string, messageFlags: number, customId: string, nonce: string): Promise<Message<void>>;

  // Connection status
  getConnectionStatus(): {
    connected: boolean;
    running: boolean;
    sessionId: string | null;
    sequence: number | null;
    websocketState: string;
    hasSession: boolean;
  };
}

// Export implementation
export { DiscordInstanceImpl } from './discordInstanceImpl';

