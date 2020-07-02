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
1. Tell kubernetes to rollout the latest version of the image:
   ```
   kubectl set image deployment reach4help-bot reach4help-chatbot=gcr.io/reach4help/reach4help-chatbot@sha256:<sha from deployment logs>
   ```