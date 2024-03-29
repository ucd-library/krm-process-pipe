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