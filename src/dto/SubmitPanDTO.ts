import { BaseSubmitDTO } from './BaseSubmitDTO';
import { TaskAction } from '../enums/TaskAction';

/**
 * Pan action submission parameters
 */
export class SubmitPanDTO extends BaseSubmitDTO {
  /** Related task ID */
  taskId?: string;

  /** Index (1~4), image slot to operate on */
  index?: number;

  /** Direction: left | right | up | down */
  direction?: 'left' | 'right' | 'up' | 'down';

  /** Internal: fixed action type */
  action?: TaskAction = TaskAction.PAN;
}


