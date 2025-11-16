import { BaseSubmitDTO } from './BaseSubmitDTO';
import { TaskAction } from '../enums/TaskAction';

/**
 * Inpaint (Vary Region) submission parameters
 */
export class SubmitInpaintDTO extends BaseSubmitDTO {
  /** Related task ID */
  taskId?: string;

  /** Index (1~4), image slot to operate on */
  index?: number;

  /** Optional remix prompt */
  prompt?: string;

  /** Mask image base64 data URL (PNG). White = editable region */
  maskBase64?: string;

  /** Internal: fixed action type */
  action?: TaskAction = TaskAction.INPAINT;
}


