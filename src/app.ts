import * as express from 'express';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { WebClient as SlackWebClient, SectionBlock } from '@slack/web-api';
import { calendar_v3 } from 'googleapis/build/src/apis/calendar/v3';

import * as slack from './slack';
import { setConfig, getConfig } from './config';

type Event = calendar_v3.Schema$Event;

export interface NotificationPair {
  channel: string;
  calendar: string;
}

export interface AppConfig {
  pairs: NotificationPair[];
  adminChannel: string;
  /**
   * Which channels to include an `@here` mention when notifying
   */
  atHereChannels: string[];
  /**
   * How regularly (in milliseconds) should google be checked for changes to
   * calendar events.
   */
  interval: number;
  port: number;
  google: {
    clientId: string,
    clientSecret: string,
  };
  siteRoot: string;
}

interface ActiveAuthRequest {
  requestKey: string;
  authUrl: string;
  /**
   * Attempt to accept the given code, and if valid, return true
   */
  acceptCode: (code: string) => Promise<boolean>;
  promise: Promise<Credentials>;
}

const CALLBACK_PATH = '/callback';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly'
];

export class App {

  private readonly config: AppConfig;
  private readonly webApp: express.Express;
  private readonly slack: SlackWebClient;
  private googleAuth: OAuth2Client;

  /**
   * Mapping from channel name to ID
   */
  private readonly slackChannels = new Map<string, string>();

  /**
   * Timeouts that are currently queued for posting notifications
   */
  private readonly notificationTimeouts = new Set<NodeJS.Timeout>();

  private activeAuthRequest: ActiveAuthRequest | null = null;

  public constructor(config: AppConfig) {

    this.config = config;

    const {
      SLACK_TOKEN
    } = process.env;

    if (!SLACK_TOKEN) {
      throw new Error('missing environment variable SLACK_TOKEN');
    }

    this.webApp = express();

    this.slack = new SlackWebClient(SLACK_TOKEN);

    const redirectURI = new URL(config.siteRoot);
    redirectURI.pathname = CALLBACK_PATH;

    this.googleAuth = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      redirectURI.href
    );
  }

  private initializeWebapp() {
    this.webApp.get(CALLBACK_PATH, async (req, res) => {
      if (!this.activeAuthRequest) {
        res.status(403).send('No active auth request');
        return;
      }
      if (req.query.state !== this.activeAuthRequest.requestKey) {
        res.status(403).send('Invalid state parameter');
        return;
      }
      if (typeof req.query.code !== 'string') {
        res.status(403).send('Invalid code parameter');
        return;
      }
      const valid = await this.activeAuthRequest.acceptCode(req.query.code);
      if (valid) {
        this.activeAuthRequest = null;
        res.status(200).send('Successfully Authenticated');
      } else {
        res.status(403).send(`Invalid code, please try again: ${this.activeAuthRequest.authUrl}`);
      }
    });
  }

  private async getSlackChannels() {
    const lists = await this.slack.conversations.list({
      types: 'public_channel,private_channel',
      limit: 1000
    }) as slack.ListsResult;

    for (const c of lists.channels) {
      this.slackChannels.set(c.name, c.id);
    }
  }

  private sendStatusMessage(blocks: SectionBlock[]) {
    const channel = this.slackChannels.get(this.config.adminChannel);
    if (!channel) {
      throw new Error(`Unable to locate admin channel ${this.config.adminChannel}`);
    }
    return this.slack.chat.postMessage({
      channel,
      text: '',
      blocks
    }).catch((err: any) => {
      console.error(err);
      throw err;
    })
  }

  private notifyOfEvents = (
    channel: string,
    time: number,
    events: Event[]
  ) => {
    const channelId = this.slackChannels.get(channel);
    const atHere = this.config.atHereChannels.indexOf(channel) > -1;
    if (!channelId) {
      console.error(`Unable to find channel ${channel}`);
      return;
    }
    const now = new Date().getTime();
    const diff = time - now;
    const diffMins = Math.round(diff / 1000 / 60);
    let text = atHere ? '<!here> ' : '';
    text += `The following ${events.length !== 1 ? 'events are' : 'event is'} starting ${diffMins < 1 ? 'now' : `in ${diffMins} mins`}:\n`;
    const blocks: SectionBlock[] = [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text
      }
    }];
    for (const event of events) {
      if (event.htmlLink && event.summary) {
        let eventText = `:calendar: <${event.htmlLink}|${event.summary}>`;
        if (event.hangoutLink) {
          eventText += ` - <${event.hangoutLink}|*Join Meeting*>`;
        }
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: eventText,
          }
        });
      }
    }
    this.slack.chat.postMessage({
      channel: channelId,
      text,
      blocks
    });
  }

  /**
   * Call this when we need to get a new google token.
   */
  private getNewGoogleToken = async (): Promise<Credentials> => {
    if (!this.activeAuthRequest) {
      const url = new URL(this.config.siteRoot);
      url.pathname = CALLBACK_PATH;
      /**
       * Random string assigned to this auth request
       */
      const requestKey = Math.random().toString(36).substr(2);
      const authUrl = this.googleAuth.generateAuthUrl({
        access_type: 'offline',
        scope: GOOGLE_SCOPES,
        state: requestKey
      });
      let acceptCode: ((code: string) => Promise<boolean>) | null = null;
      const promise = new Promise<Credentials>(resolve => {
        acceptCode = code => {
          console.log('Accepting new auth code')
          return this.googleAuth.getToken(code)
          .then(
            resp => {
              resolve(resp.tokens);
              return true;
            },
            () => false
          )
        }
      }).then(async token => {
        await setConfig({ token });
        return token;
      });
      if (!acceptCode) {
        throw new Error('Unexpected Error');
      }
      this.activeAuthRequest = {
        requestKey,
        authUrl,
        acceptCode,
        promise
      }
    }
    // Send a message about auth
    this.sendStatusMessage([{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `<!here> I need someone to log in to google to authorize access to calendar, ` +
          `please <${this.activeAuthRequest.authUrl}|Click here to authorize>.`
      }
    }]);
    return this.activeAuthRequest.promise;
  }

  private async authorizeWithGoogleCalendar() {
    if (Object.keys(this.googleAuth.credentials).length === 0) {
      console.log('No credentials set yet, checking config');
      let token = await (await getConfig()).token;
      if (!token) {
        console.log('No credentials in config, requesting new ones');
        token = await this.getNewGoogleToken();
      }
      this.googleAuth.setCredentials(token);
    }
    return this.googleAuth;
  }

  /**
   * Get the latest up-coming events, and schedule timeouts to post about them
   * in the respective channels.
   */
  private handleUpcomingEvents = async () => {
    const auth = await this.authorizeWithGoogleCalendar();

    const calendar = google.calendar({ version: 'v3', auth });

    /*
     * channel -> time -> eventId -> event
     */
    const eventGroups = new Map<string, Map<number, Map<String, Event>>>();

    for (const pair of this.config.pairs) {
      let timeMap = eventGroups.get(pair.channel);
      if (!timeMap) {
        timeMap = new Map();
        eventGroups.set(pair.channel, timeMap);
      }

      const events = await calendar.events.list({
        calendarId: pair.calendar,
        timeMin: (new Date()).toISOString(),
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
      });
      for (const event of events.data.items || []) {
        if (!event.id) {
          continue;
        }
        if (!event.start?.dateTime) {
          // Only schedule notifications for non-all-day events
          continue;
        };
        const time = new Date(event.start.dateTime).getTime();
        let eventIdMap = timeMap.get(time);
        if (!eventIdMap) {
          eventIdMap = new Map();
          timeMap.set(time, eventIdMap);
        }
        eventIdMap.set(event.id, event);
      }
    }

    // Clear all upcoming timeouts
    this.notificationTimeouts.forEach(clearTimeout);
    this.notificationTimeouts.clear();

    // Create timeouts for each of the upcoming events
    const now = new Date().getTime();
    for (const [channel, channelGroup] of eventGroups) {
      for (const [time, timeGroup] of channelGroup) {
        const timeout = time - now;
        const timeout_15 = time - now - 1000 * 60 * 15;
        const remind = () => this.notifyOfEvents(channel, time, Array.from(timeGroup.values()));
        if (timeout > 0 && timeout < 0x7FFFFFFF) {
          this.notificationTimeouts.add(setTimeout(remind, timeout));
        }
        if (timeout_15 > 0 && timeout_15 < 0x7FFFFFFF) {
          this.notificationTimeouts.add(setTimeout(remind, timeout_15));
        }
      }
    }
  }

  public async start() {
    this.initializeWebapp();

    this.webApp.listen(this.config.port);
    console.log(`Listening on port: ${this.config.port}`);

    await this.getSlackChannels();

    await this.sendStatusMessage([{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Initializing Bot'
      }
    }]);

    await this.authorizeWithGoogleCalendar();

    await this.sendStatusMessage([{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Successfully authorized with Google Calendar'
      }
    }]);

    this.handleUpcomingEvents();

    setInterval(this.handleUpcomingEvents, this.config.interval);
  }

}
