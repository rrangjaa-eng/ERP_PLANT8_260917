{
  "displayName": "[__ENV__] 5xx ratio > 5%",
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["__CHANNEL__"],
  "conditions": [
    {
      "displayName": "5xx ratio > 5%",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"__SERVICE__\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
        "denominatorFilter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"__SERVICE__\" AND metric.type=\"run.googleapis.com/request_count\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM"
          }
        ],
        "denominatorAggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM"
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 0.05,
        "duration": "300s"
      }
    }
  ]
}
