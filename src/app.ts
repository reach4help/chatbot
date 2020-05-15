import * as express from 'express';
import { google } from 'googleapis';
import { WebClient as SlackWebClient, SectionBlock } from '@slack/web-api';
import { calendar_v3 } from 'googleapis/build/src/apis/calendar/v3';

import { authorize as authorizeWithGoogle } from './google-auth';

import * as slack from './slack';

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
}

export class App {

  private readonly config: AppConfig;
  private readonly webApp: express.Express;
  private readonly slack: SlackWebClient;

  /**
   * Mapping from channel name to ID
   */
  private readonly slackChannels = new Map<string, string>();

  /**
   * Timeouts that are currently queued for posting notifications
   */
  private readonly notificationTimeouts = new Set<NodeJS.Timeout>();

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
  }

  private initializeWebapp() {

  }

  private async getSlackChannels() {
    const lists = await this.slack.conversations.list() as slack.ListsResult;

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
        maxResults: 10,
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
        if (timeout > 0) {
          this.notificationTimeouts.add(setTimeout(remind, timeout));
        }
        if (timeout_15 > 0) {
          this.notificationTimeouts.add(setTimeout(remind, timeout_15));
        }
      }
    }
  }

  private authorizeWithGoogleCalendar() {
    return authorizeWithGoogle();
  }

  public async start() {
    this.initializeWebapp();

    await this.getSlackChannels();

    await this.sendStatusMessage([{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Initializing Bot'
      }
    }]);

    await this.authorizeWithGoogleCalendar();

    this.webApp.listen(this.config.port);
    console.log(`Listening on port: ${this.config.port}`);

    this.handleUpcomingEvents();

    setInterval(this.handleUpcomingEvents, this.config.interval);
  }

}
