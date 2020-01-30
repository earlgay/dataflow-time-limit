# Dataflow Time Limit

This [Cloud Run](https://cloud.google.com/run/) service is designed to check [Dataflow](https://cloud.google.com/dataflow/) jobs within a region, and cancel any that run beyond a predefined maximum duration. It is designed to be invoked with [Cloud Scheduler](https://cloud.google.com/scheduler/), but can be done manually.

![Application Architecture](https://github.com/earlgay/dataflow-time-limit/raw/master/assets/architecture.PNG)

**Disclaimer: This is not an officially supported Google project.**

## Deploy Cloud Run Service

1. Build Image:

```
gcloud builds submit --tag gcr.io/[PROJECT_NAME]/dataflow-time-limit
```

2. Deploy service:

```
gcloud run deploy dataflow-time-limit --image gcr.io/[PROJECT_NAME]/dataflow-time-limit --platform managed --no-allow-unauthenticated --update-env-vars TIME_LIMIT=[TIME_LIMIT],REGION=[REGION] --region=[REGION]
```

3. The deployed service will return an HTTP URL, note this as [SERVICE_URL].

Variable definitions:

-   [PROJECT_NAME]: Name of the GCP project where the service will be deployed.
-   [TIME_LIMIT]: Maximum duration (minutes) to allow a Dataflow job to run before it is cancelled.
-   [REGION]: GCP Region where the Dataflow jobs reside.

Further documentation:

-   Cloud Build > Documentation> [Starting builds manually](https://cloud.google.com/cloud-build/docs/running-builds/start-build-manually)
-   Cloud Run > Documentation > [Deploying container images](https://cloud.google.com/run/docs/deploying)

## Configure Cloud Scheduler

1. Enable the Cloud Scheduler API:

```
gcloud services enable cloudscheduler.googleapis.com
```

2. Create a Service Account for Cloud Scheduler to use:

```
gcloud iam service-accounts create [SERVICE-ACCOUNT_NAME] \
   --display-name "dataflow-time-limit Invoker"
```

3. Give the newly created Service Account permissions to invoke the service:

```
gcloud run services add-iam-policy-binding dataflow-time-limit \
   --member=serviceAccount:[SERVICE-ACCOUNT_NAME]@[PROJECT].iam.gserviceaccount.com \
   --role=roles/run.invoker \
   --platform managed \
   --region [REGION]
```

4. Create the Cloud Scheduler Job (this uses normal Cron syntax, and the below example runs every 1 minutes -- which is good for testing but would ideally be longer for production)

```
gcloud beta scheduler jobs create http dataflow-time-limit-job --schedule "*/1 * * * *" \
   --http-method=GET \
   --uri=[SERVICE_URL] \
   --oidc-service-account-email=[SERVICE-ACCOUNT_NAME]@[PROJECT].iam.gserviceaccount.com   \
   --oidc-token-audience=[SERVICE_URL]
```

_Note: If prompted, select yes to create an App Engine project, select yes to enable the App Engine API, and select the same [REGION] for the region._

Confirm the scheduled job was created:
```
gcloud beta scheduler jobs list
```

If you want to change the schedule (e.g. increase to every 5 minutes), run the following: 
```
gcloud beta scheduler jobs update http dataflow-time-limit-job --schedule "*/5 * * * *"
```

Variable definitions:

-   [SERVICE_URL]: URL of the Cloud Run service.
-   [EMAIL]: Email of the user account that is running the `gcloud` command to test.
-   [SERVICE-ACCOUNT-NAME]: Desired name for the service account that Cloud Scheduler will use to invoke the service.
-   [PROJECT]: GCP Project name.

Further documentation:

-   Cloud Scheduler > Documentation > [Running services on a schedule](https://cloud.google.com/run/docs/triggering/using-scheduler)
-   External > [Crontab Manual Page](http://crontab.org/)

## Testing

**Please note: Testing should ONLY be done in a project that does not have ANY production Dataflow jobs or else those have a risk of being canceled.**

There are several ways to test the service:

1. **Locally**: Run everything on your local machine
2. **Cloud Run Service Manually**: Invoke the Cloud Run Service directly without Cloud Scheduler
3. **Entire workflow**: Let Cloud Scheduler and Cloud Run run as they would in production

In all of those scenarios, it can be easier to test with [TIME_LIMIT] set to a very small number (e.g. 0 -- which cancels any job running 1 minute or more). For the Cloud Run service, you can change the TIME_LIMIT through the console of the Cloud Run service, or with the following command:

```
gcloud run services update dataflow-time-limit --set-env-vars TIME_LIMIT=0 --platform managed --region [REGION]
```

To change it back, simply run the command again with your desired production time limit.

### Testing Locally

You can run this locally on a machine you have `gcloud` and `node` installed and configured.

1. Make sure `gcloud` is configured to point to the project you want this deployed:

```
gcloud config set project [PROJECT_NAME]
```

2. Set the TIME_LIMIT environment variables within your shell to a lower value to make it easier to test (if desired):

```
export TIME_LIMIT=0
```

3. Install node modules:
```
npm install
```

4. Start the service:

```
node server.js
```

5. Browse to http://localhost:8080 to imitate a Cloud Scheduler invokation.

The following is an example of the service started, being invoked, and the service stopping a job:

```
eeg3@mars:~/Code/dataflow-time-limit$ node server.js
App listening on port 8080!
Checking for jobs that exceed configuration maximum duration (0) within us-central1...

Found job violating maximum duration:
         ID: 2020-01-29_14_43_16-1775589797322616320
         Creation Time: 2020-01-29 22:43:17
         Duration: 1


Attempting to stop job: 2020-01-29_14_43_16-1775589797322616320
Stopped job (2020-01-29_14_43_16-1775589797322616320) successfully!
```

If there are no jobs found that violate the maximum duration, it will simply print something similar to the following:
```
Checking for jobs that exceed configuration maximum duration (0) with us-central1...

```

### Testing Cloud Run Service Manually

To test running the Cloud Run service, you can follow the steps in the documentation for [Authenticating developers](https://cloud.google.com/run/docs/authenticating/developers):

1. Grant permissions to your account:

```
gcloud run services add-iam-policy-binding dataflow-time-limit \
--member='user:[EMAIL]' \
--role='roles/run.invoker' \
--region=[REGION] \
--platform=managed
```

2. Use the `curl` command to pass an auth token to the service:

```
curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" [SERVICE_URL]
```

Assuming no jobs violate the maximum duration, this should return:

```
{"success":[],"failed":[]}
```

If there were jobs successfully (or failed) to be canceled, the job IDs would be listed within the above.

### Testing entire workflow (Cloud Scheduler & Cloud Run Service) with a sample Dataflow Job

Use this [Interactive Tutorial](https://console.cloud.google.com/dataflow?walkthrough_tutorial_id=dataflow_index) that will create a walkthrough pane in your Google Cloud Console to start a job. The job created through the tutorial should run longer than 1 minute, and as a result will be canceled by the service.

You should see within the logs of the Cloud Run Service results similar to the following:

![Examle Log of Successful Cancellation](https://github.com/earlgay/dataflow-time-limit/raw/master/assets/log_success.PNG)

## Prepare Settings for Production Usage

During testing, you likely set time to low values to ease testing time. If so, let's increase settings to a more reasonable level.

1. Change maximum duration to a higher number, such as 1440 (1 day):
```
gcloud run services update dataflow-time-limit --set-env-vars TIME_LIMIT=1440 --platform managed --region [REGION]
```

2. Change Cloud Scheduler to run hourly:
```
gcloud beta scheduler jobs update http dataflow-time-limit-job --schedule "0 * * * *"
```

## Cleanup

To remove everything created, perform the following:

1. Remove Cloud Run Service
2. Remove Images from Container Registry
3. Remove Cloud Scheduler Job
