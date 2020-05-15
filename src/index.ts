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
  atHereChannels: ['leadership', 'team-back-end', 'team-design-ui-ux', 'team-front-end', 'team-map', 'team-marketing', 'team-outreach-pr', 'bot-admin'],
  pairs: [
    {
      channel: 'leadership',
      calendar: 'reach4help.org_ba7n184n686bs9vkpjtqakhdl0@group.calendar.google.com'
    },
    {
      channel: 'team-back-end',
      calendar: 'reach4help.org_r4l70btvo2q55foaurpc7jauuk@group.calendar.google.com'
    },
    {
      channel: 'team-design-ui-ux',
      calendar: 'reach4help.org_rpetmmuro88skq5trit5tu6u60@group.calendar.google.com'
    },
    {
      channel: 'team-front-end',
      calendar: 'reach4help.org_0gusnqc542bvr31tarou3l5pck@group.calendar.google.com'
    },
    {
      channel: 'team-map',
      calendar: 'reach4help.org_8mbgkl6ck52h5po2fehcadg0ek@group.calendar.google.com'
    },
    {
      channel: 'team-marketing',
      calendar: 'reach4help.org_hgvotgcvlah0bgu9rj1si5kkoc@group.calendar.google.com'
    },
    {
      channel: 'team-outreach-pr',
      calendar: 'reach4help.org_badtfkfu8ahgnie6ppfg9efca8@group.calendar.google.com'
    },
    {
      channel: 'general',
      calendar: 'reach4help.org_cgvkud6esrtvrmaqnc7p5ra2m0@group.calendar.google.com'
    },
    {
      channel: 'bot-admin',
      calendar: 'reach4help.org_4c8mrtre1mtkt7do9fqf47lfmc@group.calendar.google.com'
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
