import {config as initEnv} from 'dotenv';
import { App, AppConfig } from './app';

initEnv();
initEnv({
  path: '.env.secrets'
});

const {
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  SITE_ROOT,
} = process.env;

if (!GOOGLE_CLIENT_SECRET) {
  throw new Error('missing environment variable GOOGLE_CLIENT_SECRET');
}

if (!GOOGLE_CLIENT_ID) {
  throw new Error('missing environment variable GOOGLE_CLIENT_ID');
}

if (!SITE_ROOT) {
  throw new Error('missing environment variable SITE_ROOT');
}

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
  google: {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET
  },
  siteRoot: SITE_ROOT
}

const app = new App(CONFIG);

app.start();
