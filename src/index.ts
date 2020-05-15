import {config as initEnv} from 'dotenv';
import { App, AppConfig } from './app';

initEnv();

const CONFIG: AppConfig = {
  adminChannel: 'bot-admin',
  atHereChannels: ['bot-admin'],
  pairs: [
    {
      channel: 'bot-admin',
      calendar: 'reach4help.org_ba7n184n686bs9vkpjtqakhdl0@group.calendar.google.com'
    }
  ],
  // Every 30 mins
  interval: 1000 * 60 * 30,
  port: parseInt(process.env.PORT || '3000'),
}

const app = new App(CONFIG);

app.start();
