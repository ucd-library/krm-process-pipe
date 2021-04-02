FROM ubuntu:bionic

ENV NODE_VERSION=v14.16.0
ENV NODE_PACKAGE_FOLDER=node-${NODE_VERSION}-linux-x64
ENV NODE_TAR_FILE=${NODE_PACKAGE_FOLDER}.tar.xz

RUN mkdir /kafka-worker-connector
WORKDIR /kafka-worker-connector

RUN apt-get update && apt-get install -y wget
RUN wget https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz
RUN tar -xf ${NODE_TAR_FILE} && mv ${NODE_PACKAGE_FOLDER} node-binaries

COPY package.json .
COPY package-lock.json .

RUN npm install --production

COPY lib lib
COPY index.js .

# extending should run if they need the binaries
# ln -s /krm-worker-connector/node-binaries/bin/* /usr/bin/
# RUN npm install --production