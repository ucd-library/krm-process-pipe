const config = require('./config');
const logger = require('./logger');
const monitoring = require('@google-cloud/monitoring');

// https://cloud.google.com/monitoring/custom-metrics/creating-metrics
class Monitoring {

  constructor(serviceId) {
    if( !serviceId ) throw new Error('You must set a monitor id');
    this.serviceId = serviceId;
    
    let clientConfig = {};
    if( config.google.serviceAccountFile ) {
      clientConfig.keyFilename = config.google.serviceAccountFile;
    }
    this.client = new monitoring.MetricServiceClient(clientConfig);

    this.metrics = {};
    this.data = {};

    this.interval = 1000 * 30;
    setInterval(() => this.write(), this.interval);
  }

  registerMetric(metric, opts={}) {
    if( !metric.metricDescriptor ) {
      metric = {
        name : this.client.projectPath(config.google.projectId),
        metricDescriptor : metric
      }
    }

    this.metrics[metric.metricDescriptor.type] = {metric, opts};
    this.data[metric.metricDescriptor.type] = {};
  }

  async ensureMetrics() {
    for( let key in this.metrics ) {
      await this.ensureMetric(this.metrics[key].metric);
    }
  }

  ensureMetric(metric) {
    return this.client.createMetricDescriptor(metric);
  }

  setMaxMetric(type, key, value, args={}) {
    let current = this.getMetricValue(type, args[key]);

    if( !current ) {
      this.setMetricValue(type, key, value, args);
      return true;
    }

    if( current.value > value ) return false;

    this.setMetricValue(type, key, value, args);
    return true;
  }

  incrementMetric(type, key, args) {
    let current = this.getMetricValue(type, args[key]);
    if( !current ) {
      this.setMetricValue(type, key, 1, args);
      return true;
    }
    this.setMetricValue(type, key, current.value+1, args);
    return true;
  }

  setMetricValue(type, key, value, args={}) {
    if( !args[key] ) throw new Error('Metric args does not contain key: '+key);
    if( !this.data[type] ) throw new Error('Unknown metric type: '+type);
    
    if( !args.time ) args.time = new Date();
    args.value = value;
    
    this.data[type][args[key]] = args;
  }

  getMetricValue(type, key) {
    if( !this.data[type] ) throw new Error('Unknown metric type: '+type);
    return this.data[type][key];
  }

  async write() {
    let data = this.data;

    let tmp = {};
    Object.keys(data).forEach(type => {
      tmp[type] = this.metrics[type].opts.onReset ? this.metrics[type].opts.onReset() : {};
    });
    this.data = tmp;

    for( let type in data ) {
      let values = data[type];
      for( let key in values ) {
        let item = values[key];

        if( this.metrics[type].opts.beforeWriteCallback ) {
          item.value = this.metrics[type].opts.beforeWriteCallback(item, {interval: this.interval});
        }

        let dataPoint = {
          interval: {
            endTime: {
              seconds: item.time.getTime() / 1000,
            },
          },
          value: {
            int64Value: item.value+'',
          },
        };

        let labels = Object.assign({}, item);
        delete labels.value;
        delete labels.time;
        labels.env = config.env;
        labels.serviceId = this.serviceId;
  
        let timeSeriesData = {
          metric: {type, labels},
          resource: {
            type: 'global',
            labels: {
              project_id: config.google.projectId,
            },
          },
          points: [dataPoint],
        };
      
        let request = {
          name: this.client.projectPath(config.google.projectId),
          timeSeries: [timeSeriesData],
        };
      
        // Writes time series data
        try {
          let result = await this.client.createTimeSeries(request);
        } catch(e) {
          logger.warn(`error writing metric ${type} ${key}`, e);
        }
      }
    }
  }

}

module.exports = Monitoring;