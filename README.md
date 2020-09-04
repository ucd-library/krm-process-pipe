# krm-process-pipe
Dependency graph powered workload processing pipe using Kafka, RabbitMQ and MongoDB

Overview
https://docs.google.com/document/d/1QbsPZhnaXPQrxMlDEkF8kbZxD6hJYklRpb1GOhJnEIA

Reference
https://docs.google.com/drawings/d/1h7dRpq62InnhG1V6tPLTryQ64FR1O0xhJLf3HohBZLs

# Graph Documentation

A KRM graph should be defined as a NodeJS javascript object.  This means you can break
the graph out into submodules and you have access to all standard NodeJS packages inside
you graph definition.

The graph should be placed `/etc/krm/graph/index.js` or in a folder defined by `GRAPH_FILE` env variable.

The graph has the following structure:

## Graph

```
{
  name : String,
  graph : {
    [subject] : [Subject Definition]
  }
}
```

A subject definition needs to be a URI.  It is recommended that any subject that creates a file be a 
file URI while anything else can be a url.  Variables are defined using mustache syntax `{}`. 

Example:

```
file:///{scale}/{date}/{time}/{band}/{apid}/blocks/{block}/image.png
```

Where, `scale`, `date`, `time`, `band`, `apid` and `block` are variables for the subject.  In this example the following
dependency definition would match: `file:///east/2019-10-24/09-10-00/7/e6/image.png`.

## Subject Definition

Subject definitions define the actionable task in the dependency graph.
The subject definition has the following structure:

```
{
  name : String,
  worker : String,
  dependencies: Array of [Dependency Definition],
  options : Object,
  command : String | Function
}
```

Properties:
  - `name`: human readable name/label for the subject task
  - `worker`: name of worker topic queue to send subject tasks to
  - `dependencies`: Array of [Dependency Definition] objects, see below
  - `options`: control when a subject task is ready and how long to wait for a task to be ready
  - `command`: Either a static string of the command to run on a worker or a function that returns a string

If the command is a function, the arguments will be:
  - `uri`: a `new URL(subject)` object
  - `message`: the subject task message (definition below)
  - `config`: the complete KRM config object. Filesystem information is at `config.fs`

Example:
```
{
  ...
  command : (uri, msg, config) => `node-image-utils jp2-to-png ${config.fs.nfsRoot}${uri.pathname} --rm-fragments`
}
```

## Subject Definition - Options

The subject definition options control when a subject task is ready and how long to wait for a task to be ready.  Subject tasks might require more than one depency to be ready.  In this case you can define the number of dependencies with a static count or you can dynamically return
if a subject task is ready using the ready function.  Then dependent count is the number of defined dependencies that match.

The options have the following structure:

```
{
  ready : Function,
  dependentCount : Number,
  timeout : Number,
  delay : Number
}
```

  - `ready` : A function that returns a boolean value that is true if the subject task is ready to execute. See below for ready function definition.  Note, the `ready` function overrides the dependent count.
  - `dependentCount` : number of matched dependencies subjects required before task should execute.
  - `timeout` : max time (in ms) to wait for a dependency task to be ready.  Defaults to 5min.  If this timeout expires, the subject task will be executed as is.   This timer resets every time a new dependency is ready
  - `delay` : time (in ms) to wait after subject task is ready before it is executed.

The `ready` function arguments will be:
  - `uri`: a `new URL(subject)` object
  - `message`: the subject task message (definition below)
  - `config`: the complete KRM config object. Filesystem information is at `config.fs`

Example:
```
{
  ready : (uri, msg, config) => {
    let pathname = path.parse(uri.pathname).dir;
    pathname = path.resolve(rootDir, pathname, '..', '..', 'fragment-metadata.json');

    if( !fs.existsSync(pathname) ) return false;
    
    let count = JSON.parse(fs.readFileSync(pathname, 'utf-8')).fragmentsCount;
    return ( msg.data.ready.length >= count);
  }
}
```

No options are required in which case the options will default to the following:

```
{
  dependentCount: 1
}
```

## Dependency Definition

Subject dependency URIs are defined in the same manor as the subject itself with the option to add constraints on the
URI variables.  All variables for the definied subject MUST match the variables of the dependency.

The dependencies have the following structure:

```
{
  subject : String,
  constraints : Object
}
```

  - `subject` : dependency subject URI to match
  - `constraints` : a key/value pair object of URI variable names mapped to regular expressions.  These limit or constraint
  which parent subject tasks are required to execute the child subject task.

Example.  Given the following subject URI `file:///{scale}/{date}/{time}/{band}/{apid}/blocks/{block}/image.png`

A dependency could look like:

```
{
  subject : 'file:///{scale}/{date}/{time}/{band}/{apid}/blocks/{block}/fragments/{fragment}/image_fragment.jp2',
  constraints : {
    scale : /^(mesoscale|conus|fulldisk)$/
  }
}
```

Where only `scale` folders with values of `mesoscale`, `conus`, and `fulldisk` would match.