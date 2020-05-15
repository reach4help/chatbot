import { WebAPICallResult } from '@slack/web-api';

export interface Conversation {
  id: string;
  name: string;
  is_member: boolean;
}

export interface ListsResult extends WebAPICallResult {
  channels: Conversation[];
}
