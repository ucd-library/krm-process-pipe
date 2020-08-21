ARG NODEJS_BASE
FROM ${NODEJS_BASE}

RUN mkdir /service
WORKDIR /service

COPY package.json .
# COPY package-lock.json .

RUN npm install --production

COPY index.js .

CMD node index.js