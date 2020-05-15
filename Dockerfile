# Use the official lightweight Node.js 10 image.
# https://hub.docker.com/_/node
FROM node:10-slim

# Create and change to the app directory.
WORKDIR /usr/src/app

COPY . ./

# Install dependencies.
RUN yarn install

# Install dependencies.
RUN yarn run build

# Run the service on container startup.
CMD [ "yarn", "run", "start" ]