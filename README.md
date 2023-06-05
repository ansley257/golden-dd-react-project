This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

### ENV VARS

#### Everywhere

1. **NODE_ENV** 'dev' or 'staging' or 'prod', usually, but can be whatever you choose
2. **DD_SERVICE_NAME** the name of your service
3. **DD_VERSION** the version of your service
4. **DD_GITHUB_COMMIT_SHA** your github sha to connect code to telemetry
5. **DD_GITHUB_REPOSITORY** your github repository to connect code to telemetry

#### Logs

1. **DATADOG_API_KEY** The api key from the Datadog account you want to send logs to
2. **DATADOG_HOSTNAME** The hostname as it should appear in Datadog
3. **DEBUG_LOG_FILE_PATH** This is the path that you are currently logging to for debug logs. By standard this should be `/var/log/<APP_NAME>.log`, provided you don't have access to that (on macOS it's a private file) you can create a logging folder.

### RUM

1. **DD_RUM_APPLICATION_ID** the application ID given by Datadog when setting up RUM through the app UI.
2. **DD_CLIENT_TOKEN** the client token given by Datadog when setting up RUM through the app UI.

### DD AGENT

1. Create a `nodejs.d` folder in the `conf.d` folder, and a `conf.yaml` inside of that.
2. The conf.yaml should look like this:

```yaml
init_config:

instances:

## Log section
logs:
  - type: file
    path: '/PATH/TO/LOG/FOLDER/<APP_NAME>/*.log'
    service: <SERVICE_NAME>
    source: nodejs
    sourcecategory: sourcecode
```
