FROM node:lts-buster

# Install deps
RUN apt-get update && apt-get install -y

# Setup directories for the `node` user
RUN mkdir -p /home/node/app/stardust/node_modules && chown -R node:node /home/node/app/stardust

WORKDIR /home/node/app/stardust

# Install node modules
COPY package.json ./
# Switch to the node user for installation
USER node
RUN npm install --production

# Copy over source files under the node user
COPY --chown=node:node ./src ./src
COPY --chown=node:node ./README.md ./

# stardust defaults to 5892
EXPOSE 5892

# Available overrides (defaults shown):
#   --disableMetrics=false
# Server logging can be enabled via the DEBUG environment variable:
#   DEBUG=signalling-server,signalling-server:error
CMD [ "node", "src/server/bin.js"]