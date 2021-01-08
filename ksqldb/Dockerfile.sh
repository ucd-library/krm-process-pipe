ARG KSQL_TAG
ARG KSQL_IMAGE_NAME
FROM confluentinc/ksqldb-server:

RUN mkdir /opt/scripts
COPY ./init.sql /opt/scripts

RUN export KSQL_KSQL_QUERIES_FILE=/opt/scripts/init.sql