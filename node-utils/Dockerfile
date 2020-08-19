FROM node:14

RUN mkdir /utils
WORKDIR /utils

COPY package.json .
COPY package-lock.json .

RUN npm link
ENV NODE_PATH /usr/local/lib/node_modules/

COPY index.js .
COPY lib lib