import { BaseSubmitDTO } from './BaseSubmitDTO';
import { TaskAction } from '../enums/TaskAction';

/**
 * Outpaint action submission parameters
 */
export class SubmitOutpaintDTO extends BaseSubmitDTO {
  /** Related task ID */
  taskId?: string;

  /** Index (1~4), image slot to operate on */
  index?: number;

  /** Percentage to extend canvas: 50 or 75 */
  percent?: 50 | 75;

  /** Optional remix prompt */
  prompt?: string;

  /** Internal: fixed action type */
  action?: TaskAction = TaskAction.OUTPAINT;
}


