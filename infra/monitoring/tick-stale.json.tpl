{
  "displayName": "[__ENV__] notify tick stale 24h",
  "combiner": "OR",
  "enabled": false,
  "notificationChannels": ["__CHANNEL__"],
  "conditions": [
    {
      "displayName": "notify tick stale 24h",
      "conditionAbsent": {
        "filter": "metric.type=\"logging.googleapis.com/user/__METRIC__\" AND resource.type=\"cloud_run_revision\"",
        "duration": "86400s"
      }
    }
  ]
}
