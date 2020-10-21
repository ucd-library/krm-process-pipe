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

CREATE TABLE task_table (
    id VARCHAR primary key,
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

-- materializd view version
-- CREATE TABLE task_view AS
--   SELECT ID, TIME, TYPE, SOURCE, SUBJECT, DATA, count(*) as count
--   FROM task_stream
--   GROUP BY id, TIME, TYPE, SOURCE, SUBJECT, DATA EMIT CHANGES;

-- Find duplicates
create table subject_counts as select subject, count(*) as count from task_stream group by subject emit changes;
select * from subject_counts where count > 1 emit changes;