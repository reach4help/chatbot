# Deployment Environment Setup

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/quickstarts)
1. Set the current project as reach4help:
   ```
   gcloud config set project reach4help
   ```
1. Login:
   ```
   gcloud auth login
   ```
1. [OPTIONAL]
   Using the gcloud command line tool, install the Kubernetes command-line tool.
   kubectl is used to communicate with Kubernetes,
   which is the cluster orchestration system of GKE clusters:

   ```
   gcloud components install kubectl
   ```

# Deployment

1. Run the following command in the root of the repo,
   which will submit the repo to cloud build,
   and then once the build completes the image will be stored
   in the [container repository](https://console.cloud.google.com/gcr/images/reach4help/GLOBAL/reach4help-chatbot?project=reach4help):

   ```
   gcloud builds submit --tag gcr.io/reach4help/reach4help-chatbot
   ```
1. Deploy the latest version of the image (can be done in the Google Cloud Shell)
   1. Get the bot credentials
      ```
      gcloud container clusters get-credentials reach4help-bot --zone=us-central1-b
      ```
   2. Tell kubernetes to rollout the image to the bot
      ```
      kubectl set image deployment reach4help-bot reach4help-chatbot=gcr.io/reach4help/reach4help-chatbot@sha256:<sha from deployment logs>
      ```
1. Check that the bot successfully restarted and posted a message in the
   `#bot-admin` slack channel.

# Redeploying `deployment.yaml` config

If you have to change `deployment.yaml` for any reason, such as moving an
environment variable into a secret, then updating the image is not enough
and you need to apply the changed config like so:

```
kubectl apply -f deployment.yaml
```
