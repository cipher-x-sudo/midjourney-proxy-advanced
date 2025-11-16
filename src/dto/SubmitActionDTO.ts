import { BaseSubmitDTO } from './BaseSubmitDTO';

/**
 * Generic MJ action by customId
 */
export class SubmitActionDTO extends BaseSubmitDTO {
  /** Related task ID */
  taskId?: string;

  /** Full customId from MJ button, e.g. MJ::JOB::pan_left::1::<hash>::SOLO */
  customId?: string;
}


