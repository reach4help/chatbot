import {config as initEnv} from 'dotenv';
import { WebClient, WebAPICallResult } from '@slack/web-api';

initEnv();

interface Conversation {
  id: string;
  name: string;
  is_member: boolean;
}

interface ListsResult extends WebAPICallResult {
  channels: Conversation[];
}

(async () => {

  // Read a token from the environment variables
  const token = process.env.SLACK_TOKEN;

  // Initialize
  const web = new WebClient(token);

  const lists = await web.conversations.list() as ListsResult;

  for(const c of lists.channels) {
    if (c.is_member) {
      console.log(c);

      await web.chat.postMessage({
        channel: c.id,
        text: 'Test',
      });
    }
  }



})();
