import {config as initEnv} from 'dotenv';
import { WebClient, WebAPICallResult, SectionBlock } from '@slack/web-api';
import { google } from 'googleapis';
import { calendar_v3 } from 'googleapis/build/src/apis/calendar/v3';

import { authorize } from './google-auth';

initEnv();

type Event = calendar_v3.Schema$Event;

interface NotificationPair {
  channel: string;
  calendar: string;
}

const PAIRS: NotificationPair[] = [
  {
    channel: 'bot-admin',
    calendar: 'reach4help.org_ba7n184n686bs9vkpjtqakhdl0@group.calendar.google.com'
  }
];

/**
 * Which channels to include an `@here` with the message
 */
const AT_HERE_CHANNELS: string[] = [
  'bot-admin'
];

// Every 30 mins
const INTERVAL = 1000 * 60 * 30;

interface Conversation {
  id: string;
  name: string;
  is_member: boolean;
}

interface ListsResult extends WebAPICallResult {
  channels: Conversation[];
}

(async () => {

  // Authorize with google
  await authorize();

  // Read a token from the environment variables
  const token = process.env.SLACK_TOKEN;

  // Initialize
  const slack = new WebClient(token);

  // Build up mapping from channel name to ID
  const channels = new Map<string, string>();
  await slack.conversations.list() as ListsResult;
  const lists = await slack.conversations.list() as ListsResult;

  for(const c of lists.channels) {
    channels.set(c.name, c.id);
  }

  const notificationTimeouts: NodeJS.Timeout[] = [];

  const notifyOfEvents = (
    channel: string,
    time: number,
    events: Event[]
  ) => {
    const channelId = channels.get(channel);
    const atHere = AT_HERE_CHANNELS.indexOf(channel) > -1;
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
    slack.chat.postMessage({
      channel: channelId,
      text,
      blocks
    });
  }

  /**
   * Get the latest up-coming events, and schedule timeouts to post about them
   * in the respective channels.
   */
  const handleUpcomingEvents = async () => {
    const auth = await authorize();

    const calendar = google.calendar({ version: 'v3', auth });

    /*
     * channel -> time -> eventId -> event
     */
    const eventGroups = new Map<string, Map<number, Map<String, Event>>>();

    for (const pair of PAIRS) {
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
    notificationTimeouts.map(clearTimeout);
    notificationTimeouts.splice(0, notificationTimeouts.length);

    // Create timeouts for each of the upcoming events
    const now = new Date().getTime();
    for (const [channel, channelGroup] of eventGroups) {
      for (const [time, timeGroup] of channelGroup) {
        const timeout = time - now;
        const timeout_15 = time - now - 1000 * 60 * 15;
        const remind = () => notifyOfEvents(channel, time, Array.from(timeGroup.values()));
        if (timeout > 0) {
          notificationTimeouts.push(setTimeout(remind, timeout));
        }
        if (timeout_15 > 0) {
          notificationTimeouts.push(setTimeout(remind, timeout_15));
        }
      }
    }
  }

  handleUpcomingEvents();

  setInterval(handleUpcomingEvents, INTERVAL);

})();
