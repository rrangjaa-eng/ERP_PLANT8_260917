{
  "displayName": "[__ENV__] notify tick stale 25h",
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["__CHANNEL__"],
  "conditions": [
    {
      "displayName": "notify tick successes < 1 in 25h",
      "conditionThreshold": {
        "filter": "metric.type=\"logging.googleapis.com/user/__METRIC__\" AND resource.type=\"cloud_run_revision\"",
        "aggregations": [
          {
            "alignmentPeriod": "89700s",
            "perSeriesAligner": "ALIGN_SUM",
            "crossSeriesReducer": "REDUCE_SUM"
          }
        ],
        "comparison": "COMPARISON_LT",
        "thresholdValue": 1,
        "duration": "300s",
        "evaluationMissingData": "EVALUATION_MISSING_DATA_ACTIVE"
      }
    }
  ]
}
