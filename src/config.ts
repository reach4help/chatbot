import * as firebase from 'firebase';
import fetch from 'node-fetch';
import { Credentials } from 'google-auth-library';

import 'firebase/firestore';

const CONFIG_DOC = 'config/chatbot';

export interface Config {
  token?: Credentials;
}

const initializeFirebase = () => {

  const {
    FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN,
    FIREBASE_DATABASE_URL,
    FIREBASE_PROJECT_ID,
    FIREBASE_APP_ID
  } = process.env;

  if (
    !FIREBASE_API_KEY ||
    !FIREBASE_AUTH_DOMAIN ||
    !FIREBASE_DATABASE_URL ||
    !FIREBASE_PROJECT_ID ||
    !FIREBASE_APP_ID
  ) {
    throw new Error('missing environment variables for firebase project');
  }

  if (firebase.apps.length === 0) {
    firebase.initializeApp({
      apiKey: FIREBASE_API_KEY,
      authDomain: FIREBASE_AUTH_DOMAIN,
      databaseURL: FIREBASE_DATABASE_URL,
      projectId: FIREBASE_PROJECT_ID,
      appId: FIREBASE_APP_ID,
    });
  }
}

const authenticate = async () => {

  const {
    FIREBASE_BOT_TOKEN,
    FIREBASE_BOT_AUTH_ENDPOINT
  } = process.env;

  if (!FIREBASE_BOT_TOKEN) {
    throw new Error('missing environment variable FIREBASE_BOT_TOKEN');
  }

  if (!FIREBASE_BOT_AUTH_ENDPOINT) {
    throw new Error('missing environment variable FIREBASE_BOT_AUTH_ENDPOINT');
  }

  const authTokenResp = await fetch(FIREBASE_BOT_AUTH_ENDPOINT, {
    method: 'post',
    body: JSON.stringify({
      token: FIREBASE_BOT_TOKEN
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  const authToken = await authTokenResp.text();

  await firebase.auth().signInWithCustomToken(authToken);
}

export const getConfig = async () => {
  initializeFirebase();

  if (!firebase.auth().currentUser) {
    await authenticate();
  }

  const config: Config = await
    firebase.firestore().doc(CONFIG_DOC).get()
    .then(doc => doc.data() as Config || {});

  return config;
}

export const setConfig = async (data: Partial<Config>) => {
  initializeFirebase();

  if (!firebase.auth().currentUser) {
    await authenticate();
  }

  await firebase.firestore().runTransaction(async transaction => {
    const ref = firebase.firestore().doc(CONFIG_DOC);
    const doc = await transaction.get(ref);
    if (doc.exists) {
      await transaction.update(ref, data);
    } else {
      await transaction.set(ref, data);
    }
  })
}
