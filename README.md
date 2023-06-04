This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

### ENV VARS

1. **DATADOG_API_KEY** The api key from the Datadog account you want to send logs to
2. **DATADOG_HOSTNAME** The hostname as it should appear in Datadog
3. **LOG_FILE_PATH** This is the path that you are currently logging to. By standard this should be `/var/log/<APP_NAME>.log`, provided you don't have access to that (on macOS it's a private file) you can create a logging folder.

### DD AGENT

1. Create a `nodejs.d` folder in the `conf.d` folder, and a `conf.yaml` inside of that.
2. The conf.yaml should look like this:

```yaml
init_config:

instances:

##Log section
logs:
  - type: file
    path: '/PATH/TO/LOG/FOLDER/<APP_NAME>/*.log'
    service: dd-winstion-test
    source: nodejs
    sourcecategory: sourcecode
```
