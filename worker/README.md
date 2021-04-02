# Kafka Worker Connector

This docker container is meant to be a multi stage build container addition
to an executable environment.

# Example Usage:

Say you wanted to execute the commands inside a genertic debian container,
you would add the following: 


```
FROM debian

COPY --from=ucdlib/kafka-worker-connector:latest /kafka-worker-connector /kafka-worker-connector
RUN ln -s /krm-worker-connector/node-binaries/bin/* /usr/bin/

CMD node /krm-worker-connector
```