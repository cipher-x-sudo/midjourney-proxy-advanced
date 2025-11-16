import { BaseSubmitDTO } from './BaseSubmitDTO';
import { TaskAction } from '../enums/TaskAction';

/**
 * Animate (low/high) submission parameters
 */
export class SubmitAnimateDTO extends BaseSubmitDTO {
  /** Related task ID */
  taskId?: string;

  /** Index (1~4), image slot to operate on */
  index?: number;

  /** Quality: low | high */
  quality?: 'low' | 'high';

  /** Internal: fixed action type */
  action?: TaskAction = TaskAction.ANIMATE;
}


