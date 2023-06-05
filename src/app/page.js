import React from 'react';
// import Logger from './logger';
import { datadogRum } from '@datadog/browser-rum';

export default function App() {
  console.warn('yoa');

  const rum = datadogRum.init({
    applicationId: process.env.DD_APPLICATION_ID,
    clientToken: process.env.DD_CLIENT_TOKEN,
    site: 'datadoghq.com',
    service: process.env.DD_SERVICE_NAME,
    env: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    // Specify a version number to identify the deployed version of your application in Datadog
    version: process.env.DD_VERSION,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'mask-user-input',
  });

  console.debug('rum', rum);
  console.log(
    'start session replay recording',
    datadogRum.startSessionReplayRecording()
  );

  datadogRum.startSessionReplayRecording();

  return (
    <div className='App'>
      <h1>Hello CodeSandbox</h1>
      <h2>Start editing to see some magic happen!</h2>
    </div>
  );
}
