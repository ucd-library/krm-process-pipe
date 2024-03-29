CREATE STREAM subject_stream (
    id VARCHAR,
    time VARCHAR,
    type VARCHAR,
    source VARCHAR,
    subject VARCHAR,
    data STRUCT<
      taskId VARCHAR,
      state VARCHAR,
      command VARCHAR,
      cwd VARCHAR,
      stdout VARCHAR,
      stderr VARCHAR,
      task STRUCT<
        id VARCHAR,
        subject VARCHAR,
        taskDefId VARCHAR
      >,
      failures ARRAY<STRUCT<
        message VARCHAR,
        stack VARCHAR,
        cmd VARCHAR,
        code INTEGER,
        stdout VARCHAR,
        stderr VARCHAR
      >>
    >
  )
  WITH (
    kafka_topic='subject-ready', 
    value_format='json'
  );

CREATE STREAM task_stream (
    id VARCHAR,
    time VARCHAR,
    type VARCHAR,
    source VARCHAR,
    subject VARCHAR,
    data STRUCT<
      name VARCHAR,
      required ARRAY<VARCHAR>,
      ready ARRAY<VARCHAR>,
      taskDefId VARCHAR,
      args MAP<VARCHAR, VARCHAR>,
      controllerMessage STRUCT<
        reason VARCHAR,
        now INTEGER,
        timeout INTEGER
      >
    >
  )
  WITH (
    kafka_topic='task-ready', 
    value_format='json'
  );

