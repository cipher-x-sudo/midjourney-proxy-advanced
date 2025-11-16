import { BaseSubmitDTO } from './BaseSubmitDTO';
import { TaskAction } from '../enums/TaskAction';

/**
 * Variation strength (low/high) submission parameters
 */
export class SubmitVariationStrengthDTO extends BaseSubmitDTO {
  /** Related task ID */
  taskId?: string;

  /** Index (1~4), image slot to operate on */
  index?: number;

  /** Strength level: low | high */
  level?: 'low' | 'high';

  /** Internal: fixed action type */
  action?: TaskAction = TaskAction.VARIATION_STRENGTH;
}


