{
  "displayName": "[__ENV__] notify tick stale 23h30m",
  "combiner": "OR",
  "enabled": false,
  "notificationChannels": ["__CHANNEL__"],
  "conditions": [
    {
      "displayName": "notify tick stale 23h30m",
      "conditionAbsent": {
        "filter": "metric.type=\"logging.googleapis.com/user/__METRIC__\" AND resource.type=\"cloud_run_revision\"",
        "duration": "84600s"
      }
    }
  ]
}
