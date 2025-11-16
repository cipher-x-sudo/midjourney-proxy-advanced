import { BaseSubmitDTO } from './BaseSubmitDTO';

/**
 * Modal follow-up for actions requiring extra data
 */
export class SubmitModalDTO extends BaseSubmitDTO {
  /** Parent task ID (result from previous /submit/action) */
  taskId?: string;

  /** Optional prompt text */
  prompt?: string;

  /** Optional mask for inpaint */
  maskBase64?: string;
}


