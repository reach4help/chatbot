import * as fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import * as path from 'path';
import * as readline from 'readline';
import { promisify } from 'util';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly'
];

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const TOKEN_FILE = path.join(path.dirname(__dirname), 'token.json');

export const authorize = async () => {
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const redirect_uri = "urn:ietf:wg:oauth:2.0:oob";

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
  const token = await readFile(TOKEN_FILE).catch(() => null);
  let credentials: Credentials;
  if (!token) {
    credentials = await getAccessToken(oAuth2Client);
  } else {
    credentials = JSON.parse(token.toString('utf8'));
  }
  oAuth2Client.setCredentials(credentials);
  return oAuth2Client;
}

const getAccessToken = async (oAuth2Client: OAuth2Client): Promise<Credentials> => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const code = await new Promise<string>(resolve => {
    const r = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    r.question('Enter the code from that page here: ', code => {
      r.close();
      resolve(code);
    });
  });
  const token = await new Promise<Credentials>((resolve, reject) =>
    oAuth2Client.getToken(code, (err, token) => {
      if (err || !token) {
        reject(err);
        return;
      }
      resolve(token);
    })
  );
  oAuth2Client.setCredentials(token);
  await writeFile(TOKEN_FILE, JSON.stringify(token));
  return token;
}
