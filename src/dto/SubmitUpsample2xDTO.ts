import { BaseSubmitDTO } from './BaseSubmitDTO';
import { TaskAction } from '../enums/TaskAction';

/**
 * Upsample 2x (V7) submission parameters
 */
export class SubmitUpsample2xDTO extends BaseSubmitDTO {
  /** Related task ID */
  taskId?: string;

  /** Index (1~4), image slot to operate on */
  index?: number;

  /** Mode: subtle | creative */
  mode?: 'subtle' | 'creative';

  /** Internal: fixed action type */
  action?: TaskAction = TaskAction.UPSAMPLE_2X;
}


